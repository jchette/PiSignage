import { useEffect, useState } from 'react';
import { api, type Device } from './api.ts';
import {
  formatUptime,
  hasMetrics,
  pctLevel,
  powerHealth,
  tempLevel,
  type Level,
} from './metrics.ts';

export function DeviceCard({ device, onChanged }: { device: Device; onChanged: () => void }) {
  const currentUrl = device.content?.type === 'url' ? device.content.url : '';
  const [url, setUrl] = useState(currentUrl);
  const [zoom, setZoom] = useState(String(device.zoom ?? 1));
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

  useEffect(() => setZoom(String(device.zoom ?? 1)), [device.zoom]);

  async function saveZoom(next: string) {
    setZoom(next);
    setBusy(true);
    try {
      await api.setZoom(device.id, Number(next));
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

  const m = device.metrics;
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'never';
  const dirty = url !== currentUrl;
  const power = powerHealth(m.throttledFlags);

  // Worst severity across health signals drives the card's left signal rail.
  const worst = worstLevel([
    tempLevel(m.cpuTempC),
    pctLevel(m.memUsedPct),
    pctLevel(m.diskUsedPct),
    power?.level ?? 'ok',
  ]);
  const rail =
    device.status === 'offline'
      ? ''
      : worst === 'crit'
        ? 'is-crit'
        : worst === 'warn'
          ? 'is-alert'
          : 'is-online';

  return (
    <div className={`card signal ${rail}`}>
      <div className="card-head">
        <div className="card-id">
          <span className={`led ${device.status}`} />
          <div>
            <div className="card-title">{device.name}</div>
            {device.location && <div className="muted small">{device.location}</div>}
          </div>
        </div>
        <span className={`status ${device.status}`}>{device.status}</span>
      </div>

      {power && (
        <div className={`power-alert ${power.level}`}>{power.label}</div>
      )}

      {hasMetrics(m) ? (
        <div className="metrics">
          <Metric label="CPU temp" value={fmt(m.cpuTempC, '°C')} level={tempLevel(m.cpuTempC)} />
          <Metric label="Uptime" value={formatUptime(m.uptimeSec)} />
          <Metric
            label="Memory"
            value={fmt(m.memUsedPct, '%')}
            level={pctLevel(m.memUsedPct)}
            gauge={m.memUsedPct}
          />
          <Metric
            label="Disk"
            value={fmt(m.diskUsedPct, '%')}
            level={pctLevel(m.diskUsedPct)}
            gauge={m.diskUsedPct}
          />
        </div>
      ) : (
        <div className="metrics-empty">No health data yet</div>
      )}

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

      <label className="field">
        Zoom <span className="muted small">(fixes tiny text/UI on 4K TVs)</span>
        <select value={zoom} onChange={(e) => saveZoom(e.target.value)} disabled={busy}>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
          <option value="1.75">175%</option>
          <option value="2">200%</option>
          <option value="2.5">250%</option>
          <option value="3">300%</option>
        </select>
      </label>

      <div className="field">
        <span>
          Auto-update{' '}
          <span className={`tag ${device.autoUpdate ? 'on' : 'off'}`}>
            {device.autoUpdate ? 'on' : 'off'}
          </span>
        </span>
        <div className="card-actions">
          <button
            onClick={() => act(() => api.setAutoUpdate(device.id, true))}
            disabled={busy || device.autoUpdate}
          >
            Enable
          </button>
          <button
            className="ghost"
            onClick={() => act(() => api.setAutoUpdate(device.id, false))}
            disabled={busy || !device.autoUpdate}
          >
            Disable
          </button>
        </div>
      </div>

      <div className="field">
        <span>
          TV power <span className={`tag ${device.tvState}`}>{device.tvState}</span>
        </span>
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
        </div>
      </div>

      <div className="card-actions">
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

      <div className="card-foot">
        <span>{device.model ?? 'unknown'}{device.agentVersion ? ` · v${device.agentVersion}` : ''}</span>
        <span>seen {lastSeen}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  level = 'ok',
  gauge,
}: {
  label: string;
  value: string;
  level?: Level;
  gauge?: number | null;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
      </div>
      <span className={`metric-value ${level}`}>{value}</span>
      {gauge != null && (
        <div className="gauge">
          <span className={level} style={{ width: `${Math.min(100, Math.max(0, gauge))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Render a numeric metric with its unit, or an em-dash when absent. */
function fmt(n: number | null, unit: string): string {
  if (n == null) return '—';
  return `${n}${unit}`;
}

function worstLevel(levels: Level[]): Level {
  if (levels.includes('crit')) return 'crit';
  if (levels.includes('warn')) return 'warn';
  return 'ok';
}
