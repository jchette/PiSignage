import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  // Local dev defaults to a SQLite file; prod uses a Turso libsql:// URL + token.
  databaseUrl: process.env.DATABASE_URL ?? 'file:./local.db',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  jwtSecret: required('JWT_SECRET'),
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'changeme',
  orgName: process.env.ORG_NAME ?? 'My Business',
  port: Number(process.env.PORT ?? 4000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
