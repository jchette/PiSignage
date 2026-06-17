import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Content, TvState } from '@pisignage/shared';

/**
 * Data layer: Turso (libSQL / SQLite) via Drizzle.
 *
 * Every tenant-owned row carries `orgId`. Today there is one org (single admin),
 * but modelling it now means multi-tenant later is additive, not a rewrite.
 *
 * Conventions for SQLite:
 *  - ids are app-generated UUID strings
 *  - timestamps are integer epoch (Drizzle `mode: 'timestamp'` -> Date)
 *  - JSON columns use `mode: 'json'`
 */

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(randomUUID),
  orgId: text('org_id')
    .notNull()
    .references(() => orgs.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    location: text('location'),
    // sha256 of the device token; the raw token is shown to the agent once at pairing.
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('offline'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
    model: text('model'),
    agentVersion: text('agent_version'),
    tvState: text('tv_state').$type<TvState>().default('unknown'),
    // Desired content for this device (Phase 1: a URL). Null = blank.
    content: text('content', { mode: 'json' }).$type<Content | null>(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    orgIdx: index('devices_org_idx').on(t.orgId),
  }),
);

/**
 * Short-lived pairing handshake. The agent (no token yet) starts a session and
 * shows the code on screen; an admin claims it in the dashboard, which mints a
 * device row + token and writes them back here for the agent to pick up.
 */
export const pairingSessions = sqliteTable(
  'pairing_sessions',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    code: text('code').notNull(),
    status: text('status').notNull().default('pending'),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'set null' }),
    // Raw device token, stored transiently so the polling agent can retrieve it once.
    deviceToken: text('device_token'),
    requestedModel: text('requested_model'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    codeIdx: index('pairing_code_idx').on(t.code),
  }),
);

export const schema = { orgs, users, devices, pairingSessions };
export { sql };
