import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Content } from '@pisignage/shared';
import { db, schema } from '../db/index.js';
import { publish } from '../events.js';
import { requireAuth } from '../middleware.js';
import { applyContent, applyRefresh, applyTvPower, devicesForTarget } from '../services/control.js';

const NameBody = z.object({ name: z.string().min(1) });
const MembersBody = z.object({ deviceIds: z.array(z.string()) });
const SetContentBody = z.object({ url: z.string().url().optional(), blank: z.boolean().optional() });
const TvPowerBody = z.object({ on: z.boolean() });

export async function groupRoutes(fastify: FastifyInstance): Promise<void> {
  // List groups in the org, each with its member device ids.
  fastify.get('/api/groups', { preHandler: requireAuth }, async (req) => {
    const orgId = req.auth!.orgId;
    const rows = await db.query.groups.findMany({ where: eq(schema.groups.orgId, orgId) });
    const members = await db
      .select({ groupId: schema.deviceGroups.groupId, deviceId: schema.deviceGroups.deviceId })
      .from(schema.deviceGroups)
      .innerJoin(schema.groups, eq(schema.groups.id, schema.deviceGroups.groupId))
      .where(eq(schema.groups.orgId, orgId));
    const byGroup = new Map<string, string[]>();
    for (const m of members) {
      const arr = byGroup.get(m.groupId) ?? [];
      arr.push(m.deviceId);
      byGroup.set(m.groupId, arr);
    }
    return {
      groups: rows.map((g) => ({
        id: g.id,
        name: g.name,
        deviceIds: byGroup.get(g.id) ?? [],
        createdAt: g.createdAt.toISOString(),
      })),
    };
  });

  fastify.post('/api/groups', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = NameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const [group] = await db
      .insert(schema.groups)
      .values({ orgId: req.auth!.orgId, name: parsed.data.name })
      .returning();
    publish(req.auth!.orgId, { type: 'groups.updated' });
    return { group: { id: group.id, name: group.name, deviceIds: [] } };
  });

  fastify.patch('/api/groups/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = NameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });
    await db.update(schema.groups).set({ name: parsed.data.name }).where(eq(schema.groups.id, id));
    publish(req.auth!.orgId, { type: 'groups.updated' });
    return { ok: true };
  });

  fastify.delete('/api/groups/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });
    await db.delete(schema.groups).where(eq(schema.groups.id, id));
    publish(req.auth!.orgId, { type: 'groups.updated' });
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    return { ok: true };
  });

  // Replace a group's membership with the given device ids (those owned by the org).
  fastify.put('/api/groups/:id/devices', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = MembersBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });

    let owned: string[] = [];
    if (parsed.data.deviceIds.length > 0) {
      const rows = await db
        .select({ id: schema.devices.id })
        .from(schema.devices)
        .where(
          and(
            eq(schema.devices.orgId, req.auth!.orgId),
            inArray(schema.devices.id, parsed.data.deviceIds),
          ),
        );
      owned = rows.map((r) => r.id);
    }

    await db.delete(schema.deviceGroups).where(eq(schema.deviceGroups.groupId, id));
    if (owned.length > 0) {
      await db
        .insert(schema.deviceGroups)
        .values(owned.map((deviceId) => ({ groupId: id, deviceId })));
    }
    publish(req.auth!.orgId, { type: 'groups.updated' });
    return { ok: true, deviceIds: owned };
  });

  // Bulk control: apply an action to every device in the group.
  fastify.post('/api/groups/:id/content', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = SetContentBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!parsed.data.blank && !parsed.data.url) return reply.code(400).send({ error: 'url_required' });
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });
    const content: Content = parsed.data.blank
      ? { type: 'blank' }
      : { type: 'url', url: parsed.data.url! };
    const ids = await devicesForTarget(req.auth!.orgId, 'group', id);
    let delivered = 0;
    for (const d of ids) if (await applyContent(d, req.auth!.orgId, content)) delivered++;
    return { ok: true, devices: ids.length, delivered };
  });

  fastify.post('/api/groups/:id/tv', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = TvPowerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });
    const ids = await devicesForTarget(req.auth!.orgId, 'group', id);
    let delivered = 0;
    for (const d of ids) if (applyTvPower(d, parsed.data.on)) delivered++;
    return { ok: true, devices: ids.length, delivered };
  });

  fastify.post('/api/groups/:id/refresh', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ownsGroup(id, req.auth!.orgId))) return reply.code(404).send({ error: 'not_found' });
    const ids = await devicesForTarget(req.auth!.orgId, 'group', id);
    let delivered = 0;
    for (const d of ids) if (applyRefresh(d)) delivered++;
    return { ok: true, devices: ids.length, delivered };
  });
}

async function ownsGroup(id: string, orgId: string): Promise<boolean> {
  const g = await db.query.groups.findFirst({
    where: and(eq(schema.groups.id, id), eq(schema.groups.orgId, orgId)),
  });
  return !!g;
}
