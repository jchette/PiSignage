import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultStateDir = path.resolve(here, '..', '.state');

export const config = {
  server: (process.env.PISIGNAGE_SERVER ?? 'http://localhost:4000').replace(/\/$/, ''),
  stateDir: process.env.PISIGNAGE_STATE_DIR ?? defaultStateDir,
  display: (process.env.PISIGNAGE_DISPLAY ?? 'auto') as 'auto' | 'chromium' | 'console',
  kioskCmd:
    process.env.PISIGNAGE_KIOSK_CMD ??
    'chromium --kiosk --ozone-platform=wayland --no-first-run --noerrdialogs ' +
      '--disable-infobars --disable-session-crashed-bubble --password-store=basic {url}',
  agentVersion: '0.1.0',
  heartbeatMs: 15000,
};

/** Derive the WebSocket URL from the HTTP base. */
export function wsUrl(token: string): string {
  const base = config.server.replace(/^http/, 'ws');
  return `${base}/ws/device?token=${encodeURIComponent(token)}`;
}
