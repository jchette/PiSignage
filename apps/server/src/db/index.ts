import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { config } from '../config.js';
import * as schema from './schema.js';

// Local dev: DATABASE_URL=file:./local.db (no auth token).
// Production:  DATABASE_URL=libsql://<db>.turso.io + DATABASE_AUTH_TOKEN=...
const client = createClient({
  url: config.databaseUrl,
  authToken: config.databaseAuthToken,
});

export const db = drizzle(client, { schema });
export { schema };
