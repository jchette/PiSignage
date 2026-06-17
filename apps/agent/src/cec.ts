import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { TvState } from '@pisignage/shared';

const run = promisify(execFile);

/**
 * HDMI-CEC TV power control via `cec-ctl` (v4l-utils), the tool shipped on
 * Raspberry Pi OS Trixie (there is no `cec-client`). Pi 5 exposes /dev/cec0
 * (HDMI0) and /dev/cec1 (HDMI1); override with PISIGNAGE_CEC_DEVICE.
 *
 * The TV is CEC logical address 0. We register as a Playback device first so
 * the adapter has a logical address to send from.
 *
 * Phase 1 wires the path end-to-end; the exact opcodes are validated against
 * the real TV in Phase 2.
 */
const CEC_DEVICE = process.env.PISIGNAGE_CEC_DEVICE ?? '/dev/cec0';

let configured = false;

async function ensureConfigured(): Promise<void> {
  if (configured) return;
  // Claim a Playback logical address on the bus (idempotent).
  await run('cec-ctl', ['-d', CEC_DEVICE, '--playback']);
  configured = true;
}

export async function setTvPower(on: boolean): Promise<TvState> {
  if (os.platform() !== 'linux') {
    console.log(`[cec] (dev) would turn TV ${on ? 'ON' : 'OFF'}`);
    return on ? 'on' : 'off';
  }
  try {
    await ensureConfigured();
    // Address the TV (logical address 0). Image View On wakes it; Standby sleeps it.
    const args = on
      ? ['-d', CEC_DEVICE, '--to', '0', '--image-view-on']
      : ['-d', CEC_DEVICE, '--to', '0', '--standby'];
    await run('cec-ctl', args);
    return on ? 'on' : 'off';
  } catch (err) {
    console.error(`[cec] failed: ${(err as Error).message}`);
    return 'unknown';
  }
}
