import { useState } from 'react';
import { api, type Org } from './api.ts';

// Browsers (and our server's Intl) accept the full IANA list. Fall back to a
// short common set if the runtime lacks Intl.supportedValuesOf.
function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (k: string) => string[] };
  try {
    return intl.supportedValuesOf?.('timeZone') ?? FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

const FALLBACK_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
];

export function SettingsModal({ org, onClose, onSaved }: {
  org: Org;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [timezone, setTimezone] = useState(org.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zones = timeZones();

  async function save() {
    setError('');
    setBusy(true);
    try {
      await api.updateOrg({ timezone });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label className="field">
          Time zone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {/* Ensure the current value is selectable even if not in the list. */}
            {!zones.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Schedules fire at their wall-clock time in this zone.
        </p>

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button onClick={save} disabled={busy || timezone === org.timezone}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
