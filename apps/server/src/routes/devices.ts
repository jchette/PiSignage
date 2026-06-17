import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { Content } from '@pisignage/shared';
import { generateDeviceToken } from '../auth.js';
import { db, schema } from '../db/index.js';
import { addSubscriber, publish } from '../events.js';
import { requireAuth } from '../middleware.js';
import { serializeDevice } from '../serialize.js';
import { verifyAuthToken } from '../auth.js';
import { isDeviceOnline, sendToDevice } from '../ws/registry.js';

const ClaimBody = z.object({
  code: z.string().min(4),
  name: z.string().min(1),
  location: z.string().optional(),
});

const SetContentBody = z.object({
  url: z.string().url().optional(),
  blank: z.boolean().optional(),
});

export async function deviceRoutes(fastify: FastifyInstance): Promise<void> {
  // List all devices in the caller's org.
  fastify.get('/api/devices', { preHandler: requireAuth }, async (req) => {
    const rows = await db.query.devices.findMany({
      where: eq(schema.devices.orgId, req.auth!.orgId),
    });
    return { devices: rows.map(serializeDevice) };
  });

  // Claim a pairing code -> mint a device + token, attach to the session.
  fastify.post('/api/devices/claim', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const { code, name, location } = parsed.data;

    const session = await db.query.pairingSessions.findFirst({
      where: and(
        eq(schema.pairingSessions.code, code),
        eq(schema.pairingSessions.status, 'pending'),
      ),
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return reply.code(404).send({ error: 'invalid_or_expired_code' });
    }

    const { token, tokenHash } = generateDeviceToken();
    const [device] = await db
      .insert(schema.devices)
      .values({
        orgId: req.auth!.orgId,
        name,
        location,
        tokenHash,
        model: session.requestedModel,
      })
      .returning();

    await db
      .update(schema.pairingSessions)
      .set({ status: 'claimed', deviceId: device.id, deviceToken: token })
      .where(eq(schema.pairingSessions.id, session.id));

    publish(req.auth!.orgId, { type: 'device.updated', deviceId: device.id });
    return { device: serializeDevice(device) };
  });

  // Set what a device should display.
  fastify.post('/api/devices/:id/content', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SetContentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const device = await getOwnedDevice(id, req.auth!.orgId);
    if (!device) return reply.code(404).send({ error: 'not_found' });

    const content: Content = parsed.data.blank
      ? { type: 'blank' }
      : { type: 'url', url: parsed.data.url! };
    if (!parsed.data.blank && !parsed.data.url) {
      return reply.code(400).send({ error: 'url_required' });
    }

    await db.update(schema.devices).set({ content }).where(eq(schema.devices.id, id));

    const delivered = sendToDevice(id, { t: 'set_content', commandId: nanoid(), content });
    publish(req.auth!.orgId, { type: 'device.updated', deviceId: id });
    return { ok: true, delivered };
  });

  // Ask a device to reload its current content.
  fastify.post('/api/devices/:id/refresh', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await getOwnedDevice(id, req.auth!.orgId);
    if (!device) return reply.code(404).send({ error: 'not_found' });
    const delivered = sendToDevice(id, { t: 'refresh', commandId: nanoid() });
    return { ok: true, delivered };
  });

  // Remove a device.
  fastify.delete('/api/devices/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await getOwnedDevice(id, req.auth!.orgId);
    if (!device) return reply.code(404).send({ error: 'not_found' });
    await db.delete(schema.devices).where(eq(schema.devices.id, id));
    publish(req.auth!.orgId, { type: 'device.updated', deviceId: id });
    return { ok: true };
  });

  // SSE stream of live device updates for the dashboard.
  // EventSource can't send headers, so the JWT comes in via ?token=.
  fastify.get('/api/events', async (req, reply) => {
    const { token } = req.query as { token?: string };
    const claims = token ? await verifyAuthToken(token) : null;
    if (!claims) {
      return reply.code(401).send({ error: 'invalid_token' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const remove = addSubscriber(claims.orgId, reply);
    const keepalive = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 25000);

    req.raw.on('close', () => {
      clearInterval(keepalive);
      remove();
    });
  });
}

async function getOwnedDevice(id: string, orgId: string) {
  return db.query.devices.findFirst({
    where: and(eq(schema.devices.id, id), eq(schema.devices.orgId, orgId)),
  });
}

// Re-exported so other modules share the same online check.
export { isDeviceOnline };
