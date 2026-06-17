import type { FastifyReply } from 'fastify';

/**
 * Server-Sent Events hub for the dashboard. The browser opens one EventSource
 * per session; we push device state changes to all subscribers in the same org.
 *
 * Single-instance only. When we scale the server horizontally we'll back this
 * with Redis pub/sub, but for now an in-process fan-out is plenty.
 */

export type DashboardEvent =
  | { type: 'device.updated'; deviceId: string }
  | { type: 'device.status'; deviceId: string; status: 'online' | 'offline' };

interface Subscriber {
  orgId: string;
  reply: FastifyReply;
}

const subscribers = new Set<Subscriber>();

export function addSubscriber(orgId: string, reply: FastifyReply): () => void {
  const sub: Subscriber = { orgId, reply };
  subscribers.add(sub);
  return () => subscribers.delete(sub);
}

export function publish(orgId: string, event: DashboardEvent): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const sub of subscribers) {
    if (sub.orgId !== orgId) continue;
    try {
      sub.reply.raw.write(data);
    } catch {
      subscribers.delete(sub);
    }
  }
}
