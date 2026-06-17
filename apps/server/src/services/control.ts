import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Content } from '@pisignage/shared';
import { db, schema } from '../db/index.js';
import { publish } from '../events.js';
import { sendToDevice } from '../ws/registry.js';

/**
 * Device control primitives shared by the REST routes (single device + group)
 * and the scheduler, so all paths persist state and notify the dashboard the
 * same way. Each returns whether the command was delivered to a live socket.
 */

export async function applyContent(
  deviceId: string,
  orgId: string,
  content: Content,
): Promise<boolean> {
  await db.update(schema.devices).set({ content }).where(eq(schema.devices.id, deviceId));
  const delivered = sendToDevice(deviceId, { t: 'set_content', commandId: nanoid(), content });
  publish(orgId, { type: 'device.updated', deviceId });
  return delivered;
}

export function applyTvPower(deviceId: string, on: boolean): boolean {
  return sendToDevice(deviceId, { t: 'tv_power', commandId: nanoid(), on });
}

export function applyRefresh(deviceId: string): boolean {
  return sendToDevice(deviceId, { t: 'refresh', commandId: nanoid() });
}

/** Resolve a schedule/group target to the concrete device ids in the org. */
export async function devicesForTarget(
  orgId: string,
  targetType: 'device' | 'group',
  targetId: string,
): Promise<string[]> {
  if (targetType === 'device') {
    const d = await db.query.devices.findFirst({
      where: and(eq(schema.devices.id, targetId), eq(schema.devices.orgId, orgId)),
    });
    return d ? [d.id] : [];
  }
  const rows = await db
    .select({ deviceId: schema.deviceGroups.deviceId })
    .from(schema.deviceGroups)
    .innerJoin(schema.devices, eq(schema.devices.id, schema.deviceGroups.deviceId))
    .where(and(eq(schema.deviceGroups.groupId, targetId), eq(schema.devices.orgId, orgId)));
  return rows.map((r) => r.deviceId);
}
