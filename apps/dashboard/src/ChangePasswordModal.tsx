import { useState } from 'react';
import { api } from './api.ts';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setError('');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (e) {
      setError((e as Error).message === 'invalid_credentials' ? 'Current password is wrong.' : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Change password</h2>
        {done ? (
          <>
            <p className="muted small">Password updated.</p>
            <div className="modal-actions">
              <button onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <label className="field">
              Current password
              <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label className="field">
              New password
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            <label className="field">
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            {error && <div className="error">{error}</div>}
            <div className="modal-actions">
              <button className="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button onClick={submit} disabled={busy || !current || !next || !confirm}>
                Update
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
