import { useState } from 'react';
import { api, type Device } from './api.ts';

export function DeviceCard({ device, onChanged }: { device: Device; onChanged: () => void }) {
  const currentUrl = device.content?.type === 'url' ? device.content.url : '';
  const [url, setUrl] = useState(currentUrl);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.setContent(device.id, { url });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never';
  const dirty = url !== currentUrl;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{device.name}</div>
          {device.location && <div className="muted small">{device.location}</div>}
        </div>
        <span className={`status ${device.status}`}>{device.status}</span>
      </div>

      <label className="field">
        URL
        <div className="url-row">
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button onClick={save} disabled={busy || !dirty || !url}>
            Set
          </button>
        </div>
      </label>

      <div className="field">
        TV power <span className="muted small">({device.tvState})</span>
        <div className="card-actions">
          <button onClick={() => act(() => api.setTvPower(device.id, true))} disabled={busy}>
            On
          </button>
          <button
            className="ghost"
            onClick={() => act(() => api.setTvPower(device.id, false))}
            disabled={busy}
          >
            Off
          </button>
        </div>
      </div>

      <div className="card-actions">
        <button className="ghost" onClick={() => act(() => api.refresh(device.id))} disabled={busy}>
          Refresh
        </button>
        <button
          className="ghost"
          onClick={() => act(() => api.setContent(device.id, { blank: true }))}
          disabled={busy}
        >
          Blank
        </button>
        <button
          className="ghost danger"
          onClick={() => {
            if (confirm(`Remove "${device.name}"?`)) act(() => api.deleteDevice(device.id));
          }}
          disabled={busy}
        >
          Remove
        </button>
      </div>

      <div className="card-foot muted small">
        <span>{device.model ?? 'unknown model'}</span>
        <span>seen {lastSeen}</span>
      </div>
    </div>
  );
}
