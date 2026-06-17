import os from 'node:os';
import type { Content } from '@pisignage/shared';
import { config } from '../config.js';
import { ConsoleDisplay } from './console.js';
import { ChromiumDisplay } from './chromium.js';

/** A display backend renders content on the screen and shows the pairing code. */
export interface Display {
  show(content: Content): Promise<void>;
  refresh(): Promise<void>;
  showPairingCode(code: string, serverUrl: string): Promise<void>;
}

export function createDisplay(): Display {
  const mode = config.display === 'auto' ? detect() : config.display;
  return mode === 'chromium' ? new ChromiumDisplay() : new ConsoleDisplay();
}

/** Use the real kiosk on Linux (the Pi); log everywhere else (dev machines). */
function detect(): 'chromium' | 'console' {
  return os.platform() === 'linux' ? 'chromium' : 'console';
}
