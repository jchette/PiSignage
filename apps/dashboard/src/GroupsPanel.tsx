import { useState } from 'react';
import { api, type Device, type Group } from './api.ts';

export function GroupsPanel({
  groups,
  devices,
  onChanged,
}: {
  groups: Group[];
  devices: Device[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await api.createGroup(newName.trim());
      setNewName('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="content-head">
        <h1>Groups</h1>
        <div className="url-row" style={{ maxWidth: 360 }}>
          <input
            placeholder="New group name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
          <button onClick={create} disabled={busy || !newName.trim()}>
            + Add
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <p>No groups yet.</p>
          <p className="muted">Create a group to control or schedule several TVs at once.</p>
        </div>
      ) : (
        <div className="grid">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} devices={devices} onChanged={onChanged} />
          ))}
        </div>
      )}
    </>
  );
}

function GroupCard({
  group,
  devices,
  onChanged,
}: {
  group: Group;
  devices: Device[];
  onChanged: () => void;
}) {
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const members = new Set(group.deviceIds);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleMember(deviceId: string, on: boolean) {
    const next = new Set(members);
    if (on) next.add(deviceId);
    else next.delete(deviceId);
    await act(() => api.setGroupDevices(group.id, [...next]));
  }

  const memberNames = devices.filter((d) => members.has(d.id)).map((d) => d.name);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{group.name}</div>
          <div className="muted small">
            {memberNames.length ? memberNames.join(', ') : 'no devices'}
          </div>
        </div>
        <span className="status offline">{group.deviceIds.length}</span>
      </div>

      <label className="field">
        Set URL on all
        <div className="url-row">
          <input
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={() => act(() => api.setGroupContent(group.id, { url }))}
            disabled={busy || !url}
          >
            Set
          </button>
          <button
            className="ghost"
            onClick={() => act(() => api.setGroupContent(group.id, { blank: true }))}
            disabled={busy}
          >
            Blank
          </button>
        </div>
      </label>

      <div className="field">
        TV power (all)
        <div className="card-actions">
          <button onClick={() => act(() => api.setGroupTvPower(group.id, true))} disabled={busy}>
            On
          </button>
          <button
            className="ghost"
            onClick={() => act(() => api.setGroupTvPower(group.id, false))}
            disabled={busy}
          >
            Off
          </button>
          <button
            className="ghost"
            onClick={() => act(() => api.refreshGroup(group.id))}
            disabled={busy}
          >
            Refresh
          </button>
        </div>
      </div>

      {editing && (
        <div className="field">
          Members
          <div className="checklist">
            {devices.length === 0 && <span className="muted small">No devices.</span>}
            {devices.map((d) => (
              <label key={d.id} className="check">
                <input
                  type="checkbox"
                  checked={members.has(d.id)}
                  disabled={busy}
                  onChange={(e) => toggleMember(d.id, e.target.checked)}
                />
                {d.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="card-actions">
        <button className="ghost" onClick={() => setEditing((v) => !v)} disabled={busy}>
          {editing ? 'Done' : 'Edit members'}
        </button>
        <button
          className="ghost danger"
          onClick={() => {
            if (confirm(`Delete group "${group.name}"?`)) act(() => api.deleteGroup(group.id));
          }}
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
