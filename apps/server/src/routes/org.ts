import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { publish } from '../events.js';
import { requireAuth } from '../middleware.js';

const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  timezone: z
    .string()
    .min(1)
    .refine(isValidTimeZone, { message: 'unknown timezone' })
    .optional(),
});

/** True if the string is an IANA tz the runtime's Intl accepts. */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function orgRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/org', { preHandler: requireAuth }, async (req, reply) => {
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, req.auth!.orgId) });
    if (!org) return reply.code(404).send({ error: 'not_found' });
    return { org: { id: org.id, name: org.name, timezone: org.timezone } };
  });

  fastify.patch('/api/org', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    if (parsed.data.name === undefined && parsed.data.timezone === undefined) {
      return reply.code(400).send({ error: 'no_fields' });
    }
    await db
      .update(schema.orgs)
      .set(parsed.data)
      .where(eq(schema.orgs.id, req.auth!.orgId));
    // Schedule timezone affects how fire times are evaluated/labelled.
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    const org = await db.query.orgs.findFirst({ where: eq(schema.orgs.id, req.auth!.orgId) });
    return { org: { id: org!.id, name: org!.name, timezone: org!.timezone } };
  });
}
