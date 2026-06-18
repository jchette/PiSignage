import { exec } from 'node:child_process';
import { readFile, statfs } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Health metrics reported in each heartbeat. All fields best-effort/optional. */
export interface Metrics {
  cpuTempC?: number;
  uptimeSec?: number;
  memUsedPct?: number;
  diskUsedPct?: number;
  throttledFlags?: number;
}

const isLinux = process.platform === 'linux';

/**
 * Collect a snapshot of device health. Each probe is independently guarded so a
 * single failure (e.g. no vcgencmd off-Pi) never blocks the heartbeat. Returns
 * only the fields that resolved.
 */
export async function collectMetrics(): Promise<Metrics> {
  const [cpuTempC, memUsedPct, diskUsedPct, throttledFlags] = await Promise.all([
    cpuTemp(),
    memUsed(),
    diskUsed(),
    throttled(),
  ]);
  return {
    uptimeSec: Math.round(os.uptime()),
    ...(cpuTempC !== undefined && { cpuTempC }),
    ...(memUsedPct !== undefined && { memUsedPct }),
    ...(diskUsedPct !== undefined && { diskUsedPct }),
    ...(throttledFlags !== undefined && { throttledFlags }),
  };
}

async function cpuTemp(): Promise<number | undefined> {
  if (!isLinux) return undefined;
  try {
    const raw = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
    const milli = Number(raw.trim());
    if (!Number.isFinite(milli)) return undefined;
    return Math.round((milli / 1000) * 10) / 10; // one decimal
  } catch {
    return undefined;
  }
}

async function memUsed(): Promise<number | undefined> {
  // Prefer MemAvailable (accounts for reclaimable cache); fall back to os.
  if (isLinux) {
    try {
      const info = await readFile('/proc/meminfo', 'utf8');
      const total = matchKb(info, 'MemTotal');
      const avail = matchKb(info, 'MemAvailable');
      if (total && avail) return Math.round(((total - avail) / total) * 100);
    } catch {
      /* fall through */
    }
  }
  const total = os.totalmem();
  if (!total) return undefined;
  return Math.round(((total - os.freemem()) / total) * 100);
}

function matchKb(meminfo: string, key: string): number | undefined {
  const m = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, 'm'));
  return m ? Number(m[1]) : undefined;
}

async function diskUsed(): Promise<number | undefined> {
  try {
    const fs = await statfs('/');
    if (!fs.blocks) return undefined;
    // Match `df`: used relative to the user-visible total (excludes root-reserved).
    return Math.round(((fs.blocks - fs.bavail) / fs.blocks) * 100);
  } catch {
    return undefined;
  }
}

async function throttled(): Promise<number | undefined> {
  if (!isLinux) return undefined;
  try {
    const { stdout } = await execAsync('vcgencmd get_throttled');
    const m = stdout.match(/throttled=0x([0-9a-fA-F]+)/);
    return m ? parseInt(m[1], 16) : undefined;
  } catch {
    return undefined; // vcgencmd absent (non-Pi) or no permission
  }
}
