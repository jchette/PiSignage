import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { publish } from '../events.js';
import { requireAuth } from '../middleware.js';
import { serializeSchedule } from '../serialize.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOW = /^[0-6](,[0-6])*$/;

// payload validated per action below
const ScheduleBody = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean().optional(),
    targetType: z.enum(['device', 'group']),
    targetId: z.string().min(1),
    action: z.enum(['set_content', 'tv_power']),
    payload: z.union([
      z.object({ type: z.literal('url'), url: z.string().url() }),
      z.object({ type: z.literal('blank') }),
      z.object({ on: z.boolean() }),
    ]),
    kind: z.enum(['weekly', 'once']),
    time: z.string().regex(HHMM),
    daysOfWeek: z.string().regex(DOW).optional(),
    date: z.string().regex(DATE).optional(),
  })
  .refine((s) => (s.kind === 'weekly' ? !!s.daysOfWeek : !!s.date), {
    message: 'weekly needs daysOfWeek; once needs date',
  })
  .refine(
    (s) =>
      s.action === 'tv_power'
        ? 'on' in s.payload
        : 'type' in s.payload,
    { message: 'payload does not match action' },
  );

export async function scheduleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/schedules', { preHandler: requireAuth }, async (req) => {
    const rows = await db.query.schedules.findMany({
      where: eq(schema.schedules.orgId, req.auth!.orgId),
    });
    return { schedules: rows.map(serializeSchedule) };
  });

  fastify.post('/api/schedules', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = ScheduleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const d = parsed.data;
    const [row] = await db
      .insert(schema.schedules)
      .values({
        orgId: req.auth!.orgId,
        name: d.name,
        enabled: d.enabled ?? true,
        targetType: d.targetType,
        targetId: d.targetId,
        action: d.action,
        payload: d.payload,
        kind: d.kind,
        time: d.time,
        daysOfWeek: d.kind === 'weekly' ? d.daysOfWeek : null,
        date: d.kind === 'once' ? d.date : null,
      })
      .returning();
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    return { schedule: serializeSchedule(row) };
  });

  // Full edit: replace all editable fields. Resets lastFiredKey so an edited
  // time can fire again today.
  fastify.put('/api/schedules/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ScheduleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const owned = await db.query.schedules.findFirst({
      where: and(eq(schema.schedules.id, id), eq(schema.schedules.orgId, req.auth!.orgId)),
    });
    if (!owned) return reply.code(404).send({ error: 'not_found' });
    const d = parsed.data;
    await db
      .update(schema.schedules)
      .set({
        name: d.name,
        enabled: d.enabled ?? true,
        targetType: d.targetType,
        targetId: d.targetId,
        action: d.action,
        payload: d.payload,
        kind: d.kind,
        time: d.time,
        daysOfWeek: d.kind === 'weekly' ? d.daysOfWeek : null,
        date: d.kind === 'once' ? d.date : null,
        lastFiredKey: null,
      })
      .where(eq(schema.schedules.id, id));
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    const updated = await db.query.schedules.findFirst({ where: eq(schema.schedules.id, id) });
    return { schedule: serializeSchedule(updated!) };
  });

  // Toggle enabled (lightweight). Full edit uses PUT above.
  fastify.patch('/api/schedules/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const owned = await db.query.schedules.findFirst({
      where: and(eq(schema.schedules.id, id), eq(schema.schedules.orgId, req.auth!.orgId)),
    });
    if (!owned) return reply.code(404).send({ error: 'not_found' });
    await db
      .update(schema.schedules)
      .set({ enabled: parsed.data.enabled })
      .where(eq(schema.schedules.id, id));
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    return { ok: true };
  });

  fastify.delete('/api/schedules/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const owned = await db.query.schedules.findFirst({
      where: and(eq(schema.schedules.id, id), eq(schema.schedules.orgId, req.auth!.orgId)),
    });
    if (!owned) return reply.code(404).send({ error: 'not_found' });
    await db.delete(schema.schedules).where(eq(schema.schedules.id, id));
    publish(req.auth!.orgId, { type: 'schedules.updated' });
    return { ok: true };
  });
}
