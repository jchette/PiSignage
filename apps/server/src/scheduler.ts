import { eq } from 'drizzle-orm';
import type { Content } from '@pisignage/shared';
import { db, schema } from './db/index.js';
import { applyContent, applyTvPower, devicesForTarget } from './services/control.js';
import { nowInTz } from './time.js';

/**
 * Edge-triggered schedule runner. Every tick we compute the current wall-clock
 * minute in each org's timezone and fire any enabled schedule whose time (and
 * weekday / date) matches. `lastFiredKey` dedupes within the minute and across
 * restarts. A missed minute (server down at the exact time) is simply skipped —
 * the next occurrence fires normally.
 */

const TICK_MS = 30_000;

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
      await applyTvPower(deviceId, orgId, (s.payload as { on: boolean }).on);
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
