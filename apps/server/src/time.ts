export interface Now {
  date: string; // YYYY-MM-DD
  hhmm: string; // HH:MM
  weekday: number; // 0=Sun..6=Sat
  key: string; // YYYY-MM-DDTHH:MM
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function nowInTz(tz: string): Now {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parts.hour === '24' ? '00' : parts.hour; // some envs emit 24 at midnight
  const hhmm = `${hour}:${parts.minute}`;
  return { date, hhmm, weekday: WEEKDAYS[parts.weekday] ?? 0, key: `${date}T${hhmm}` };
}
