import { exec } from 'node:child_process';
import os from 'node:os';
import type { TvState } from '@pisignage/shared';

/**
 * HDMI-CEC TV power control. Phase 1 wires the command path end-to-end with a
 * best-effort libcec call; the exact invocation for the Pi 5 (cec-ctl vs
 * echo|cec-client) gets validated on real hardware in Phase 2.
 */
export async function setTvPower(on: boolean): Promise<TvState> {
  if (os.platform() !== 'linux') {
    console.log(`[cec] (dev) would turn TV ${on ? 'ON' : 'OFF'}`);
    return on ? 'on' : 'off';
  }
  // libcec: `echo 'on 0' | cec-client -s -d 1`  /  `standby 0`
  const cmd = on
    ? `echo 'on 0' | cec-client -s -d 1`
    : `echo 'standby 0' | cec-client -s -d 1`;
  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        console.error(`[cec] failed: ${err.message}`);
        resolve('unknown');
      } else {
        resolve(on ? 'on' : 'off');
      }
    });
  });
}
