import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthClaims } from './auth.js';
import { verifyAuthToken } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthClaims;
  }
}

/** preHandler that requires a valid dashboard JWT (Authorization: Bearer ...). */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    await reply.code(401).send({ error: 'missing_token' });
    return;
  }
  const claims = await verifyAuthToken(token);
  if (!claims) {
    await reply.code(401).send({ error: 'invalid_token' });
    return;
  }
  req.auth = claims;
}
