// Same-origin in dev (Vite proxy). Set VITE_API_BASE for production builds.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface DeviceMetrics {
  cpuTempC: number | null;
  uptimeSec: number | null;
  memUsedPct: number | null;
  diskUsedPct: number | null;
  throttledFlags: number | null;
  at: string | null;
}

export interface Device {
  id: string;
  name: string;
  location: string | null;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  model: string | null;
  agentVersion: string | null;
  tvState: 'on' | 'off' | 'unknown';
  content: { type: 'url'; url: string } | { type: 'blank' } | null;
  metrics: DeviceMetrics;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  deviceIds: string[];
  createdAt?: string;
}

export type SchedulePayload =
  | { type: 'url'; url: string }
  | { type: 'blank' }
  | { on: boolean };

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  targetType: 'device' | 'group';
  targetId: string;
  action: 'set_content' | 'tv_power';
  payload: SchedulePayload;
  kind: 'weekly' | 'once';
  time: string;
  daysOfWeek: string | null;
  date: string | null;
  lastFiredKey: string | null;
  createdAt: string;
}

export type NewSchedule = Omit<Schedule, 'id' | 'lastFiredKey' | 'createdAt'>;

export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface Org {
  id: string;
  name: string;
  timezone: string;
}

const TOKEN_KEY = 'pisignage.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Decode the signed-in user's id from the JWT payload (no verification needed client-side). */
export function currentUserId(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split('.')[1])).userId ?? null;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `request_failed_${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; role: string } }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  listDevices: () => request<{ devices: Device[] }>('/api/devices'),
  claimDevice: (code: string, name: string, location?: string) =>
    request<{ device: Device }>('/api/devices/claim', {
      method: 'POST',
      body: JSON.stringify({ code, name, location }),
    }),
  setContent: (id: string, payload: { url?: string; blank?: boolean }) =>
    request<{ ok: boolean; delivered: boolean }>(`/api/devices/${id}/content`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setTvPower: (id: string, on: boolean) =>
    request<{ ok: boolean; delivered: boolean }>(`/api/devices/${id}/tv`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),
  refresh: (id: string) =>
    request<{ ok: boolean; delivered: boolean }>(`/api/devices/${id}/refresh`, { method: 'POST' }),
  deleteDevice: (id: string) =>
    request<{ ok: boolean }>(`/api/devices/${id}`, { method: 'DELETE' }),

  // --- Groups ---
  listGroups: () => request<{ groups: Group[] }>('/api/groups'),
  createGroup: (name: string) =>
    request<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  renameGroup: (id: string, name: string) =>
    request<{ ok: boolean }>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteGroup: (id: string) =>
    request<{ ok: boolean }>(`/api/groups/${id}`, { method: 'DELETE' }),
  setGroupDevices: (id: string, deviceIds: string[]) =>
    request<{ ok: boolean }>(`/api/groups/${id}/devices`, {
      method: 'PUT',
      body: JSON.stringify({ deviceIds }),
    }),
  setGroupContent: (id: string, payload: { url?: string; blank?: boolean }) =>
    request<{ ok: boolean; devices: number; delivered: number }>(`/api/groups/${id}/content`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  setGroupTvPower: (id: string, on: boolean) =>
    request<{ ok: boolean; devices: number; delivered: number }>(`/api/groups/${id}/tv`, {
      method: 'POST',
      body: JSON.stringify({ on }),
    }),
  refreshGroup: (id: string) =>
    request<{ ok: boolean; devices: number; delivered: number }>(`/api/groups/${id}/refresh`, {
      method: 'POST',
    }),

  // --- Schedules ---
  listSchedules: () => request<{ schedules: Schedule[] }>('/api/schedules'),
  createSchedule: (s: NewSchedule) =>
    request<{ schedule: Schedule }>('/api/schedules', { method: 'POST', body: JSON.stringify(s) }),
  updateSchedule: (id: string, s: NewSchedule) =>
    request<{ schedule: Schedule }>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(s),
    }),
  setScheduleEnabled: (id: string, enabled: boolean) =>
    request<{ ok: boolean }>(`/api/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  deleteSchedule: (id: string) =>
    request<{ ok: boolean }>(`/api/schedules/${id}`, { method: 'DELETE' }),

  // --- Users ---
  listUsers: () => request<{ users: User[] }>('/api/users'),
  createUser: (email: string, password: string) =>
    request<{ user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  deleteUser: (id: string) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),

  // --- Org settings ---
  getOrg: () => request<{ org: Org }>('/api/org'),
  updateOrg: (patch: Partial<Pick<Org, 'name' | 'timezone'>>) =>
    request<{ org: Org }>('/api/org', { method: 'PATCH', body: JSON.stringify(patch) }),
};

/** Open the SSE stream for live device updates. Token goes in the query string. */
export function openEventStream(onEvent: () => void): EventSource | null {
  const token = getToken();
  if (!token) return null;
  const es = new EventSource(`${API_BASE}/api/events?token=${encodeURIComponent(token)}`);
  es.onmessage = () => onEvent();
  return es;
}
