import type { DeviceMetrics } from './api.ts';

export type Level = 'ok' | 'warn' | 'crit';

/** Compact uptime, e.g. "3d 4h", "5h 12m", "8m". */
export function formatUptime(sec: number | null): string {
  if (sec == null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** CPU temperature severity for Raspberry Pi (soft-throttle starts ~80–85°C). */
export function tempLevel(c: number | null): Level {
  if (c == null) return 'ok';
  if (c >= 80) return 'crit';
  if (c >= 70) return 'warn';
  return 'ok';
}

/** Generic percentage severity for memory / disk gauges. */
export function pctLevel(p: number | null): Level {
  if (p == null) return 'ok';
  if (p >= 90) return 'crit';
  if (p >= 75) return 'warn';
  return 'ok';
}

const FLAG = {
  underVoltageNow: 0x1,
  throttledNow: 0x4,
  softTempNow: 0x8,
  underVoltageEver: 0x10000,
  throttledEver: 0x40000,
  softTempEver: 0x80000,
};

export interface PowerHealth {
  level: Level;
  label: string;
}

/**
 * Decode `vcgencmd get_throttled`. Current ("now") conditions outrank historical
 * ("ever") ones; under-voltage is the most actionable signal (bad PSU/cable).
 * Returns null when there's nothing to report (healthy, or no Pi flags).
 */
export function powerHealth(flags: number | null): PowerHealth | null {
  if (flags == null) return null;
  if (flags & FLAG.underVoltageNow) return { level: 'crit', label: 'Undervoltage' };
  if (flags & FLAG.throttledNow) return { level: 'warn', label: 'Throttled' };
  if (flags & FLAG.softTempNow) return { level: 'warn', label: 'Temp limited' };
  if (flags & FLAG.underVoltageEver) return { level: 'warn', label: 'Undervoltage earlier' };
  if (flags & FLAG.throttledEver) return { level: 'warn', label: 'Throttled earlier' };
  if (flags & FLAG.softTempEver) return { level: 'warn', label: 'Temp limited earlier' };
  return null;
}

/** True once any metric has been reported for the device. */
export function hasMetrics(m: DeviceMetrics): boolean {
  return (
    m.at != null ||
    m.cpuTempC != null ||
    m.uptimeSec != null ||
    m.memUsedPct != null ||
    m.diskUsedPct != null
  );
}
