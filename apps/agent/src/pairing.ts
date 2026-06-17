import fs from 'node:fs';
import type {
  PairingStartResponse,
  PairingStatusResponse,
} from '@pisignage/shared';
import { config } from './config.js';
import type { Display } from './display/index.js';
import { saveState } from './state.js';

const POLL_INTERVAL_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the pairing handshake until the device is claimed, persisting the token.
 * Shows the code on screen and polls the server. Loops forever on expiry by
 * starting a fresh session, so an unattended Pi eventually gets paired.
 */
export async function runPairing(display: Display): Promise<{ deviceToken: string; deviceId: string }> {
  for (;;) {
    const session = await startSession();
    await display.showPairingCode(session.code, config.server);
    const expiresAt = new Date(session.expiresAt).getTime();

    while (Date.now() < expiresAt) {
      await sleep(POLL_INTERVAL_MS);
      const status = await pollStatus(session.sessionId);
      if (status?.status === 'claimed' && status.deviceToken && status.deviceId) {
        const state = { deviceToken: status.deviceToken, deviceId: status.deviceId };
        saveState(state);
        console.log('[pairing] device claimed and token saved');
        return state;
      }
      if (status?.status === 'expired') break;
    }
    console.log('[pairing] code expired, requesting a new one');
  }
}

async function startSession(): Promise<PairingStartResponse> {
  const res = await fetch(`${config.server}/api/pairing/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: detectModel() }),
  });
  if (!res.ok) throw new Error(`pairing start failed: ${res.status}`);
  return res.json() as Promise<PairingStartResponse>;
}

async function pollStatus(sessionId: string): Promise<PairingStatusResponse | null> {
  try {
    const res = await fetch(`${config.server}/api/pairing/status/${sessionId}`);
    if (!res.ok) return null;
    return res.json() as Promise<PairingStatusResponse>;
  } catch {
    return null; // server briefly unreachable; keep polling
  }
}

function detectModel(): string | undefined {
  try {
    // On a Pi this file contains e.g. "Raspberry Pi 5 Model B Rev 1.0"
    return fs.readFileSync('/proc/device-tree/model', 'utf8').replace(/\0/g, '').trim();
  } catch {
    return undefined;
  }
}
