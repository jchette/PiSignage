import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const secret = new TextEncoder().encode(config.jwtSecret);

export interface AuthClaims {
  userId: string;
  orgId: string;
  email: string;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function signAuthToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifyAuthToken(token: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as string,
      orgId: payload.orgId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}

/** Generate a device token (returned once to the agent) and its stored hash. */
export function generateDeviceToken(): { token: string; tokenHash: string } {
  const token = `dev_${randomBytes(24).toString('hex')}`;
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Human-friendly 6-digit pairing code. */
export function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
