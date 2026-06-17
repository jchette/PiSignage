import { z } from 'zod';

/**
 * Wire protocol between the Pi agent and the cloud control plane.
 *
 * Transport: a single persistent OUTBOUND WebSocket from each Pi to the cloud.
 * The agent authenticates with its device token, then exchanges JSON messages.
 *
 * Naming: messages are tagged with a `t` (type) discriminator so both sides can
 * switch on a single field. Server->Device messages are "commands"; Device->Server
 * messages are "events".
 */

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// Shared value objects
// ---------------------------------------------------------------------------

export const TvStateSchema = z.enum(['on', 'off', 'unknown']);
export type TvState = z.infer<typeof TvStateSchema>;

export const DeviceStatusSchema = z.enum(['online', 'offline']);
export type DeviceStatus = z.infer<typeof DeviceStatusSchema>;

/** Content the agent should render. Phase 1 supports only `url`. */
export const ContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), url: z.string().url() }),
  z.object({ type: z.literal('blank') }),
]);
export type Content = z.infer<typeof ContentSchema>;

// ---------------------------------------------------------------------------
// Device -> Server (events)
// ---------------------------------------------------------------------------

/** First message after the socket opens and authenticates. */
export const HelloSchema = z.object({
  t: z.literal('hello'),
  protocol: z.number().int(),
  agentVersion: z.string(),
  model: z.string().optional(),
  os: z.string().optional(),
});

/** Periodic health/status report. */
export const HeartbeatSchema = z.object({
  t: z.literal('heartbeat'),
  currentContent: ContentSchema.nullable().optional(),
  tvState: TvStateSchema.optional(),
  cpuTempC: z.number().optional(),
  uptimeSec: z.number().optional(),
  agentVersion: z.string().optional(),
});

/** Acknowledgement of a command (by id). */
export const AckSchema = z.object({
  t: z.literal('ack'),
  commandId: z.string(),
  ok: z.boolean(),
  error: z.string().optional(),
});

export const DeviceMessageSchema = z.discriminatedUnion('t', [
  HelloSchema,
  HeartbeatSchema,
  AckSchema,
]);
export type DeviceMessage = z.infer<typeof DeviceMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> Device (commands)
// ---------------------------------------------------------------------------

/** Tell the device what to render. */
export const SetContentSchema = z.object({
  t: z.literal('set_content'),
  commandId: z.string(),
  content: ContentSchema,
});

/** HDMI-CEC TV power control (Phase 2 wiring; command defined now). */
export const TvPowerSchema = z.object({
  t: z.literal('tv_power'),
  commandId: z.string(),
  on: z.boolean(),
});

export const RebootSchema = z.object({
  t: z.literal('reboot'),
  commandId: z.string(),
});

/** Reload the current content (e.g. refresh the kiosk page). */
export const RefreshSchema = z.object({
  t: z.literal('refresh'),
  commandId: z.string(),
});

/** Server heartbeat/keepalive; device should reply with a heartbeat. */
export const PingSchema = z.object({
  t: z.literal('ping'),
});

export const ServerMessageSchema = z.discriminatedUnion('t', [
  SetContentSchema,
  TvPowerSchema,
  RebootSchema,
  RefreshSchema,
  PingSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ---------------------------------------------------------------------------
// REST pairing payloads (device has no token yet, so this is plain HTTPS)
// ---------------------------------------------------------------------------

/** Agent asks the cloud to begin pairing; gets back a short code to display. */
export const PairingStartResponseSchema = z.object({
  sessionId: z.string(),
  code: z.string(),
  expiresAt: z.string(),
});
export type PairingStartResponse = z.infer<typeof PairingStartResponseSchema>;

/** Agent polls this until an admin claims the code in the dashboard. */
export const PairingStatusResponseSchema = z.object({
  status: z.enum(['pending', 'claimed', 'expired']),
  deviceToken: z.string().optional(),
  deviceId: z.string().optional(),
});
export type PairingStatusResponse = z.infer<typeof PairingStatusResponseSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseDeviceMessage(raw: unknown): DeviceMessage | null {
  const result = DeviceMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
