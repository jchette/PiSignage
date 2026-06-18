import { useCallback, useEffect, useState } from 'react';
import { api, currentUserId, type User } from './api.ts';

export function UsersModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const me = currentUserId();

  const load = useCallback(async () => {
    try {
      const { users } = await api.listUsers();
      setUsers(users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      await api.createUser(email.trim(), password);
      setEmail('');
      setPassword('');
      await load();
    } catch (e) {
      setError((e as Error).message === 'email_taken' ? 'That email is already in use.' : 'Could not add user.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(u: User) {
    if (!confirm(`Remove ${u.email}?`)) return;
    setBusy(true);
    try {
      await api.deleteUser(u.id);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Users</h2>

        <div className="checklist">
          {users.map((u) => (
            <div key={u.id} className="user-row">
              <span>
                {u.email}
                {u.id === me && <span className="muted small"> (you)</span>}
              </span>
              <button
                className="ghost danger"
                onClick={() => remove(u)}
                disabled={busy || u.id === me}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label className="field">
          New user email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Temporary password (8+ chars)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button onClick={add} disabled={busy || !email || !password}>
            Add user
          </button>
        </div>
      </div>
    </div>
  );
}
