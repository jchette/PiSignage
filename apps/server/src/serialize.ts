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
    createdAt: row.createdAt.toISOString(),
  };
}

export type DeviceDto = ReturnType<typeof serializeDevice>;
