import { eq } from 'drizzle-orm';
import type { Content } from '@pisignage/shared';
import { db, schema } from './db/index.js';
import { applyContent, applyTvPower, devicesForTarget } from './services/control.js';

/**
 * Edge-triggered schedule runner. Every tick we compute the current wall-clock
 * minute in each org's timezone and fire any enabled schedule whose time (and
 * weekday / date) matches. `lastFiredKey` dedupes within the minute and across
 * restarts. A missed minute (server down at the exact time) is simply skipped —
 * the next occurrence fires normally.
 */

const TICK_MS = 30_000;

interface Now {
  date: string; // YYYY-MM-DD
  hhmm: string; // HH:MM
  weekday: number; // 0=Sun..6=Sat
  key: string; // YYYY-MM-DDTHH:MM
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nowInTz(tz: string): Now {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parts.hour === '24' ? '00' : parts.hour; // some envs emit 24 at midnight
  const hhmm = `${hour}:${parts.minute}`;
  return { date, hhmm, weekday: WEEKDAYS[parts.weekday] ?? 0, key: `${date}T${hhmm}` };
}

async function runDueSchedules(): Promise<void> {
  const orgs = await db.select().from(schema.orgs);
  for (const org of orgs) {
    const now = nowInTz(org.timezone || 'America/New_York');
    const due = await db.query.schedules.findMany({
      where: eq(schema.schedules.orgId, org.id),
    });
    for (const s of due) {
      if (!s.enabled) continue;
      if (s.time !== now.hhmm) continue;
      if (s.kind === 'weekly') {
        const days = (s.daysOfWeek ?? '').split(',').filter(Boolean).map(Number);
        if (!days.includes(now.weekday)) continue;
      } else if (s.date !== now.date) {
        continue;
      }
      if (s.lastFiredKey === now.key) continue;

      await fireSchedule(org.id, s);
      await db
        .update(schema.schedules)
        .set({ lastFiredKey: now.key })
        .where(eq(schema.schedules.id, s.id));
    }
  }
}

async function fireSchedule(
  orgId: string,
  s: typeof schema.schedules.$inferSelect,
): Promise<void> {
  const ids = await devicesForTarget(orgId, s.targetType, s.targetId);
  for (const deviceId of ids) {
    if (s.action === 'set_content') {
      await applyContent(deviceId, orgId, s.payload as Content);
    } else {
      applyTvPower(deviceId, (s.payload as { on: boolean }).on);
    }
  }
  console.log(`[scheduler] fired "${s.name}" (${s.action}) -> ${ids.length} device(s)`);
}

export function startScheduler(): void {
  const tick = () =>
    runDueSchedules().catch((err) => console.error('[scheduler] tick failed:', err));
  setInterval(tick, TICK_MS);
  tick();
  console.log('[scheduler] started');
}
