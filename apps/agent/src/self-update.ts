import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(here, '..', 'deploy', 'self-update.sh');

/** Exit code the script uses to signal "pulled + rebuilt; restart me". */
const RESTART_EXIT_CODE = 2;

/**
 * Runs deploy/self-update.sh (force-sync to origin/main, npm install, rebuild).
 * Linux-only — dev machines just no-op. Returns true if the caller should now
 * restart the process (systemd's Restart=always brings the new build up).
 */
export async function runSelfUpdate(): Promise<boolean> {
  if (process.platform !== 'linux') {
    console.log('[self-update] (dev) skipping — not Linux');
    return false;
  }
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT], { stdio: 'inherit' });
    child.on('error', (err) => {
      console.error(`[self-update] failed to launch: ${err.message}`);
      resolve(false);
    });
    child.on('exit', (code) => {
      if (code === RESTART_EXIT_CODE) {
        console.log('[self-update] update applied, restarting');
        resolve(true);
      } else if (code === 0) {
        console.log('[self-update] already up to date');
        resolve(false);
      } else {
        console.error(`[self-update] check failed (exit ${code}); staying on current build`);
        resolve(false);
      }
    });
  });
}
