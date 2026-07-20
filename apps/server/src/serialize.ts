import type { InferSelectModel } from 'drizzle-orm';
import type { schema } from './db/index.js';
import { isDeviceOnline } from './ws/registry.js';

type DeviceRow = InferSelectModel<typeof schema.devices>;

/** Shape returned to the dashboard. `status` reflects the live socket, not the column. */
export function serializeDevice(row: DeviceRow) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    status: isDeviceOnline(row.id) ? 'online' : 'offline',
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    model: row.model,
    agentVersion: row.agentVersion,
    tvState: row.tvState ?? 'unknown',
    content: row.content ?? null,
    zoom: row.zoom ?? 1,
    autoUpdate: row.autoUpdate ?? false,
    metrics: {
      cpuTempC: row.cpuTempC ?? null,
      uptimeSec: row.uptimeSec ?? null,
      memUsedPct: row.memUsedPct ?? null,
      diskUsedPct: row.diskUsedPct ?? null,
      throttledFlags: row.throttledFlags ?? null,
      at: row.metricsAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export type DeviceDto = ReturnType<typeof serializeDevice>;

type ScheduleRow = InferSelectModel<typeof schema.schedules>;

export function serializeSchedule(row: ScheduleRow) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    targetType: row.targetType,
    targetId: row.targetId,
    action: row.action,
    payload: row.payload,
    kind: row.kind,
    time: row.time,
    daysOfWeek: row.daysOfWeek,
    date: row.date,
    lastFiredKey: row.lastFiredKey,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ScheduleDto = ReturnType<typeof serializeSchedule>;
