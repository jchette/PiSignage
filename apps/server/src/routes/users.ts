import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth.js';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware.js';

const CreateUserBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin']).optional(),
});

function serializeUser(u: typeof schema.users.$inferSelect) {
  return { id: u.id, email: u.email, role: u.role, createdAt: u.createdAt.toISOString() };
}

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/users', { preHandler: requireAuth }, async (req) => {
    const rows = await db.query.users.findMany({
      where: eq(schema.users.orgId, req.auth!.orgId),
    });
    return { users: rows.map(serializeUser) };
  });

  fastify.post('/api/users', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' });
    const email = parsed.data.email.toLowerCase();

    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) return reply.code(409).send({ error: 'email_taken' });

    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(schema.users)
      .values({ orgId: req.auth!.orgId, email, passwordHash, role: parsed.data.role ?? 'admin' })
      .returning();
    return { user: serializeUser(user) };
  });

  fastify.delete('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (id === req.auth!.userId) return reply.code(400).send({ error: 'cannot_delete_self' });

    const target = await db.query.users.findFirst({
      where: and(eq(schema.users.id, id), eq(schema.users.orgId, req.auth!.orgId)),
    });
    if (!target) return reply.code(404).send({ error: 'not_found' });

    await db.delete(schema.users).where(eq(schema.users.id, id));
    return { ok: true };
  });
}
