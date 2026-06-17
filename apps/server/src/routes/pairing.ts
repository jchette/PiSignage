import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PairingStartResponse, PairingStatusResponse } from '@pisignage/shared';
import { generatePairingCode } from '../auth.js';
import { db, schema } from '../db/index.js';

const PAIRING_TTL_MS = 10 * 60 * 1000;

const StartBody = z.object({
  model: z.string().optional(),
});

/**
 * Pairing endpoints are unauthenticated: the agent has no device token yet.
 * Flow: agent calls /start, displays the code, polls /status until an admin
 * claims it in the dashboard (see devices.ts -> /claim), then receives a token.
 */
export async function pairingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/pairing/start', async (req, reply) => {
    const parsed = StartBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }

    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    const [session] = await db
      .insert(schema.pairingSessions)
      .values({
        code: generatePairingCode(),
        requestedModel: parsed.data.model,
        expiresAt,
      })
      .returning();

    const body: PairingStartResponse = {
      sessionId: session.id,
      code: session.code,
      expiresAt: session.expiresAt.toISOString(),
    };
    return body;
  });

  fastify.get('/api/pairing/status/:sessionId', async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await db.query.pairingSessions.findFirst({
      where: eq(schema.pairingSessions.id, sessionId),
    });
    if (!session) {
      return reply.code(404).send({ error: 'not_found' });
    }

    if (session.status === 'pending' && session.expiresAt.getTime() < Date.now()) {
      const expired: PairingStatusResponse = { status: 'expired' };
      return expired;
    }

    if (session.status === 'claimed' && session.deviceToken && session.deviceId) {
      const claimed: PairingStatusResponse = {
        status: 'claimed',
        deviceToken: session.deviceToken,
        deviceId: session.deviceId,
      };
      return claimed;
    }

    const pending: PairingStatusResponse = { status: 'pending' };
    return pending;
  });
}
