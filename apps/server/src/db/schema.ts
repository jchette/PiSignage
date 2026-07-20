import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Content, TvState } from '@pisignage/shared';

/** What a schedule does when it fires: set content, or switch TV power. */
export type SchedulePayload = Content | { on: boolean };

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
  // IANA timezone used to evaluate schedules (DST-aware). One per tenant.
  timezone: text('timezone').notNull().default('America/New_York'),
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
    // Chromium device-scale-factor for this TV (1 = normal). Fixes pages
    // rendering tiny on 4K panels laid out for ~1080p.
    zoom: real('zoom').notNull().default(1),
    // Opt-in: agent periodically self-updates (git pull + rebuild + restart) when true.
    autoUpdate: integer('auto_update', { mode: 'boolean' }).notNull().default(false),
    // Health metrics from the latest heartbeat (null until first report).
    cpuTempC: real('cpu_temp_c'),
    uptimeSec: integer('uptime_sec'),
    memUsedPct: integer('mem_used_pct'),
    diskUsedPct: integer('disk_used_pct'),
    throttledFlags: integer('throttled_flags'),
    metricsAt: integer('metrics_at', { mode: 'timestamp' }),
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

/** A named collection of devices for bulk control + scheduling. */
export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    orgIdx: index('groups_org_idx').on(t.orgId),
  }),
);

/** Many-to-many membership: a device can belong to several groups. */
export const deviceGroups = sqliteTable(
  'device_groups',
  {
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.deviceId, t.groupId] }),
    groupIdx: index('device_groups_group_idx').on(t.groupId),
  }),
);

/**
 * A scheduled action against a device or group. Times are stored as 'HH:MM' in
 * the org's timezone; a server-side ticker fires them edge-triggered.
 *  - kind 'weekly': fires at `time` on each weekday listed in `daysOfWeek` (CSV, 0=Sun).
 *  - kind 'once':   fires at `time` on the single calendar `date` ('YYYY-MM-DD').
 * `lastFiredKey` ('YYYY-MM-DDTHH:MM') dedupes firing within a minute / across restarts.
 */
export const schedules = sqliteTable(
  'schedules',
  {
    id: text('id').primaryKey().$defaultFn(randomUUID),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    targetType: text('target_type').$type<'device' | 'group'>().notNull(),
    targetId: text('target_id').notNull(),
    action: text('action').$type<'set_content' | 'tv_power'>().notNull(),
    payload: text('payload', { mode: 'json' }).$type<SchedulePayload>().notNull(),
    kind: text('kind').$type<'weekly' | 'once'>().notNull(),
    time: text('time').notNull(),
    daysOfWeek: text('days_of_week'),
    date: text('date'),
    lastFiredKey: text('last_fired_key'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    orgIdx: index('schedules_org_idx').on(t.orgId),
  }),
);

export const schema = { orgs, users, devices, pairingSessions, groups, deviceGroups, schedules };
export { sql };
