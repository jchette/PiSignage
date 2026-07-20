import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { parseDeviceMessage } from '@pisignage/shared';
import { hashToken } from '../auth.js';
import { db, schema } from '../db/index.js';
import { publish } from '../events.js';
import { registerDevice, unregisterDevice } from './registry.js';

const PING_INTERVAL_MS = 20000;

/**
 * Device-facing WebSocket gateway. Each Pi opens one persistent outbound
 * connection to `/ws/device?token=<deviceToken>` and stays connected.
 */
export async function registerDeviceGateway(fastify: FastifyInstance): Promise<void> {
  fastify.get('/ws/device', { websocket: true }, async (socket: WebSocket, req) => {
    const { token } = req.query as { token?: string };
    if (!token) {
      socket.close(4001, 'missing token');
      return;
    }

    const device = await db.query.devices.findFirst({
      where: eq(schema.devices.tokenHash, hashToken(token)),
    });
    if (!device) {
      socket.close(4003, 'invalid token');
      return;
    }

    const deviceId = device.id;
    const orgId = device.orgId;

    registerDevice(deviceId, orgId, socket);
    await markOnline(deviceId);
    publish(orgId, { type: 'device.status', deviceId, status: 'online' });

    // Push current desired content immediately so the screen is correct on connect.
    if (device.content) {
      socket.send(
        JSON.stringify({
          t: 'set_content',
          commandId: 'initial',
          content: device.content,
          zoom: device.zoom,
        }),
      );
    }

    // Liveness: a hard power-loss won't send a TCP FIN, so without this the socket
    // could linger "online" for minutes. We ping every interval; the ws client
    // auto-replies with a pong. If a ping goes unanswered, terminate so `close`
    // fires and the device is marked offline (within ~2 intervals).
    let isAlive = true;
    socket.on('pong', () => {
      isAlive = true;
    });
    const ping = setInterval(() => {
      if (!isAlive) {
        socket.terminate();
        return;
      }
      isAlive = false;
      try {
        socket.ping();
        // App-level ping too, so the agent emits a heartbeat (refreshes tvState).
        socket.send(JSON.stringify({ t: 'ping' }));
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS);

    socket.on('message', async (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const msg = parseDeviceMessage(parsed);
      if (!msg) return;

      switch (msg.t) {
        case 'hello':
          await db
            .update(schema.devices)
            .set({ model: msg.model ?? device.model, agentVersion: msg.agentVersion })
            .where(eq(schema.devices.id, deviceId));
          publish(orgId, { type: 'device.updated', deviceId });
          break;
        case 'heartbeat':
          await db
            .update(schema.devices)
            .set({
              lastSeenAt: new Date(),
              tvState: msg.tvState ?? device.tvState,
              agentVersion: msg.agentVersion ?? device.agentVersion,
              // Health metrics are best-effort; `?? null` lets a metric that
              // stops reporting (e.g. moved off Pi hardware) clear rather than stick.
              cpuTempC: msg.cpuTempC ?? null,
              uptimeSec: msg.uptimeSec ?? null,
              memUsedPct: msg.memUsedPct ?? null,
              diskUsedPct: msg.diskUsedPct ?? null,
              throttledFlags: msg.throttledFlags ?? null,
              metricsAt: new Date(),
            })
            .where(eq(schema.devices.id, deviceId));
          publish(orgId, { type: 'device.updated', deviceId });
          break;
        case 'ack':
          if (!msg.ok) {
            fastify.log.warn({ deviceId, commandId: msg.commandId, error: msg.error }, 'command nack');
          }
          break;
      }
    });

    const teardown = async () => {
      clearInterval(ping);
      unregisterDevice(deviceId, socket);
      await markOffline(deviceId);
      publish(orgId, { type: 'device.status', deviceId, status: 'offline' });
    };

    socket.on('close', teardown);
    socket.on('error', teardown);
  });
}

async function markOnline(deviceId: string): Promise<void> {
  await db
    .update(schema.devices)
    .set({ status: 'online', lastSeenAt: new Date() })
    .where(eq(schema.devices.id, deviceId));
}

async function markOffline(deviceId: string): Promise<void> {
  await db
    .update(schema.devices)
    .set({ status: 'offline' })
    .where(eq(schema.devices.id, deviceId));
}
