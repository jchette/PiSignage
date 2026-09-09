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
  // Daily self-restart to bound the RSS growth from a memory leak in
  // @libsql/client (confirmed against both local sqlite and the real Turso
  // endpoint - see CLAUDE.md). Requires railway.toml's restartPolicyType to
  // be "always", since a clean exit(0) is a no-op under "on_failure". Timed
  // an hour after the Pi fleet's synchronized 3 AM OS-update reboot so both
  // disruptions land in the same overnight window.
  restartAtLocalTime: process.env.RESTART_AT_LOCAL_TIME ?? '04:00',
  restartTimezone: process.env.RESTART_TIMEZONE ?? 'America/New_York',
};
