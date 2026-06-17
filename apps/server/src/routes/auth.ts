import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signAuthToken, verifyPassword } from '../auth.js';
import { db, schema } from '../db/index.js';

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/auth/login', async (req, reply) => {
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
}
