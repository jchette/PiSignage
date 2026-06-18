import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, signAuthToken, verifyPassword } from '../auth.js';
import { db, schema } from '../db/index.js';
import { requireAuth } from '../middleware.js';

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/auth/login', {
    // Brute-force throttle: per-IP, on a public URL. Counts every attempt
    // (including failures) so guessing is rate-capped.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const { email, password } = parsed.data;

    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email.toLowerCase()),
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const token = await signAuthToken({
      userId: user.id,
      orgId: user.orgId,
      email: user.email,
    });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });

  // Change the signed-in user's own password (verifies the current one first).
  fastify.post('/api/auth/password', {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const parsed = ChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, req.auth!.userId),
    });
    if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, user.id));
    return { ok: true };
  });
}
