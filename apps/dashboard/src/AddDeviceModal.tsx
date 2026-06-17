import { useState } from 'react';
import { api } from './api.ts';

export function AddDeviceModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.claimDevice(code.trim(), name.trim(), location.trim() || undefined);
      onAdded();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg === 'invalid_or_expired_code' ? 'That code is invalid or expired.' : 'Failed to add device.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add device</h2>
        <p className="muted small">Enter the 6-digit code shown on the Pi's screen.</p>
        <label>
          Pairing code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            required
          />
        </label>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lobby TV"
            required
          />
        </label>
        <label>
          Location (optional)
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Front lobby"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add device'}
          </button>
        </div>
      </form>
    </div>
  );
}
