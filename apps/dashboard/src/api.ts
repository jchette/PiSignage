// Same-origin in dev (Vite proxy). Set VITE_API_BASE for production builds.
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

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
  createdAt: string;
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
};

/** Open the SSE stream for live device updates. Token goes in the query string. */
export function openEventStream(onEvent: () => void): EventSource | null {
  const token = getToken();
  if (!token) return null;
  const es = new EventSource(`${API_BASE}/api/events?token=${encodeURIComponent(token)}`);
  es.onmessage = () => onEvent();
  return es;
}
