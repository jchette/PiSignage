import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { TvState } from '@pisignage/shared';

const run = promisify(execFile);

/**
 * HDMI-CEC TV power control via `cec-ctl` (v4l-utils), the tool shipped on
 * Raspberry Pi OS Trixie (there is no `cec-client`). Validated on real hardware
 * (Pi 5 -> Samsung TV) 2026-06-17.
 *
 * Two things were learned on hardware and are baked in here:
 *
 *  1. Device node: a Pi 5 exposes /dev/cec0 (HDMI0) and /dev/cec1 (HDMI1). Only
 *     the port the TV is plugged into reports a real physical address; the unused
 *     one reports f.f.f.f. We auto-detect the connected adapter rather than assume
 *     cec0. Override with PISIGNAGE_CEC_DEVICE.
 *
 *  2. Power off: this Samsung ACKs but ignores <Standby> (directed and broadcast)
 *     and the power-off / power-toggle remote keys. It only honours <Standby> once
 *     we have asserted ourselves as the active source. So power-off is
 *     active-source -> standby, and power-on is image-view-on -> active-source
 *     (which also switches the TV to the Pi's input).
 */

const FORCED_DEVICE = process.env.PISIGNAGE_CEC_DEVICE;

interface CecAdapter {
  device: string;
  physAddr: string;
}

let adapter: CecAdapter | null = null;
let detected = false;

/** Read an adapter's physical address, or null if it can't be queried. */
async function physAddrOf(device: string): Promise<string | null> {
  try {
    const { stdout } = await run('cec-ctl', ['-d', device]);
    const m = stdout.match(/Physical Address\s*:\s*([0-9a-fA-F.]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Find the CEC adapter with a TV attached and claim a Playback logical address. */
async function detectAdapter(): Promise<CecAdapter | null> {
  if (detected) return adapter;
  detected = true;

  const candidates = FORCED_DEVICE ? [FORCED_DEVICE] : ['/dev/cec0', '/dev/cec1', '/dev/cec2'];
  for (const device of candidates) {
    const physAddr = await physAddrOf(device);
    if (physAddr && physAddr !== 'f.f.f.f') {
      // Claim a Playback logical address on this bus so we can send commands.
      await run('cec-ctl', ['-d', device, '--playback']).catch(() => {});
      adapter = { device, physAddr };
      console.log(`[cec] using ${device} (phys ${physAddr})`);
      return adapter;
    }
  }
  console.error('[cec] no connected CEC adapter found');
  return null;
}

// CEC User Control Codes (remote-button presses) for volume, sent to the TV's
// logical address (0). TV-integrated speakers only expose relative up/down/mute
// via these — there is no standard message reporting back a numeric level (that
// exists only for a soundbar/AVR via System Audio Control, which doesn't apply here).
const VOLUME_UI_CMD: Record<'up' | 'down' | 'mute', string> = {
  up: '0x41',
  down: '0x42',
  mute: '0x43',
};

/** Send one directed volume/mute button tap to the TV. */
export async function adjustTvVolume(action: 'up' | 'down' | 'mute'): Promise<void> {
  if (os.platform() !== 'linux') {
    console.log(`[cec] (dev) would press volume ${action}`);
    return;
  }

  const a = await detectAdapter();
  if (!a) return;

  const uiCmd = VOLUME_UI_CMD[action];
  try {
    await run('cec-ctl', ['-d', a.device, '--to', '0', '--user-control-pressed', `ui-cmd=${uiCmd}`]);
    await run('cec-ctl', ['-d', a.device, '--to', '0', '--user-control-released']);
  } catch (err) {
    console.error(`[cec] volume ${action} failed: ${(err as Error).message}`);
  }
}

export async function setTvPower(on: boolean): Promise<TvState> {
  if (os.platform() !== 'linux') {
    console.log(`[cec] (dev) would turn TV ${on ? 'ON' : 'OFF'}`);
    return on ? 'on' : 'off';
  }

  const a = await detectAdapter();
  if (!a) return 'unknown';

  try {
    if (on) {
      // Wake the TV, then claim active source so it lands on the Pi's HDMI input.
      await run('cec-ctl', ['-d', a.device, '--to', '0', '--image-view-on']);
      await run('cec-ctl', ['-d', a.device, '--active-source', `phys-addr=${a.physAddr}`]);
      return 'on';
    }
    // Samsung only obeys <Standby> when we are the active source first.
    await run('cec-ctl', ['-d', a.device, '--active-source', `phys-addr=${a.physAddr}`]);
    await run('cec-ctl', ['-d', a.device, '--to', '0', '--standby']);
    return 'off';
  } catch (err) {
    console.error(`[cec] failed: ${(err as Error).message}`);
    return 'unknown';
  }
}
