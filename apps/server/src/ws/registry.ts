import type { WebSocket } from 'ws';
import type { ServerMessage } from '@pisignage/shared';

/**
 * In-memory registry of currently-connected device sockets, keyed by deviceId.
 * Lets the REST layer push a command to a device if it's online right now.
 *
 * Single-instance only (see events.ts note). A device connecting twice replaces
 * the older socket.
 */

interface Connection {
  orgId: string;
  socket: WebSocket;
}

const connections = new Map<string, Connection>();

export function registerDevice(deviceId: string, orgId: string, socket: WebSocket): void {
  const existing = connections.get(deviceId);
  if (existing && existing.socket !== socket) {
    try {
      existing.socket.close(4000, 'replaced by newer connection');
    } catch {
      /* ignore */
    }
  }
  connections.set(deviceId, { orgId, socket });
}

export function unregisterDevice(deviceId: string, socket: WebSocket): void {
  const existing = connections.get(deviceId);
  if (existing && existing.socket === socket) {
    connections.delete(deviceId);
  }
}

export function isDeviceOnline(deviceId: string): boolean {
  return connections.has(deviceId);
}

/** Send a command to a connected device. Returns false if it's offline. */
export function sendToDevice(deviceId: string, message: ServerMessage): boolean {
  const conn = connections.get(deviceId);
  if (!conn) return false;
  try {
    conn.socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}
