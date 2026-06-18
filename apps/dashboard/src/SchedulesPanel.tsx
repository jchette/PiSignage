import { useState } from 'react';
import {
  api,
  type Device,
  type Group,
  type NewSchedule,
  type Schedule,
  type SchedulePayload,
} from './api.ts';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SchedulesPanel({
  schedules,
  devices,
  groups,
  onChanged,
}: {
  schedules: Schedule[];
  devices: Device[];
  groups: Group[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  function nameForTarget(s: Schedule): string {
    if (s.targetType === 'group') return groups.find((g) => g.id === s.targetId)?.name ?? '(group)';
    return devices.find((d) => d.id === s.targetId)?.name ?? '(device)';
  }

  const formOpen = showForm || editing !== null;

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <>
      <div className="content-head">
        <h1>Schedules</h1>
        <button
          onClick={() => (formOpen ? closeForm() : setShowForm(true))}
        >
          {formOpen ? 'Close' : '+ New schedule'}
        </button>
      </div>

      {formOpen && (
        <ScheduleForm
          key={editing?.id ?? 'new'}
          initial={editing}
          devices={devices}
          groups={groups}
          onSaved={() => {
            closeForm();
            onChanged();
          }}
        />
      )}

      {schedules.length === 0 ? (
        <div className="empty">
          <p>No schedules yet.</p>
          <p className="muted">
            Schedule TV power or content changes for a device or group — e.g. TVs On at 08:00,
            Off at 22:00.
          </p>
        </div>
      ) : (
        <div className="grid">
          {schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              target={nameForTarget(s)}
              onEdit={() => {
                setShowForm(false);
                setEditing(s);
              }}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </>
  );
}

function describeAction(s: Schedule): string {
  if (s.action === 'tv_power') return `TV ${'on' in s.payload && s.payload.on ? 'On' : 'Off'}`;
  if ('type' in s.payload && s.payload.type === 'url') return `Show ${s.payload.url}`;
  return 'Blank screen';
}

function describeWhen(s: Schedule): string {
  if (s.kind === 'weekly') {
    const days = (s.daysOfWeek ?? '')
      .split(',')
      .filter(Boolean)
      .map((n) => DOW[Number(n)])
      .join(', ');
    return `${days} at ${s.time}`;
  }
  return `${s.date} at ${s.time}`;
}

function ScheduleCard({
  schedule: s,
  target,
  onEdit,
  onChanged,
}: {
  schedule: Schedule;
  target: string;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{s.name}</div>
          <div className="muted small">
            {target} · {s.targetType}
          </div>
        </div>
        <span className={`status ${s.enabled ? 'online' : 'offline'}`}>
          {s.enabled ? 'on' : 'off'}
        </span>
      </div>
      <div className="small">{describeAction(s)}</div>
      <div className="muted small">{describeWhen(s)}</div>
      <div className="card-actions">
        <button className="ghost" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button
          className="ghost"
          onClick={() => act(() => api.setScheduleEnabled(s.id, !s.enabled))}
          disabled={busy}
        >
          {s.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          className="ghost danger"
          onClick={() => {
            if (confirm(`Delete schedule "${s.name}"?`)) act(() => api.deleteSchedule(s.id));
          }}
          disabled={busy}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ScheduleForm({
  initial,
  devices,
  groups,
  onSaved,
}: {
  initial: Schedule | null;
  devices: Device[];
  groups: Group[];
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(
    initial ? `${initial.targetType}:${initial.targetId}` : '',
  );
  const [action, setAction] = useState<'tv_power' | 'set_content'>(initial?.action ?? 'tv_power');
  const [on, setOn] = useState(
    initial?.action === 'tv_power' && 'on' in initial.payload ? initial.payload.on : true,
  );
  const initialContentKind =
    initial?.action === 'set_content' && 'type' in initial.payload && initial.payload.type === 'blank'
      ? 'blank'
      : 'url';
  const [contentKind, setContentKind] = useState<'url' | 'blank'>(initialContentKind);
  const [url, setUrl] = useState(
    initial && 'type' in (initial.payload as object) && (initial.payload as { type?: string }).type === 'url'
      ? (initial.payload as { url: string }).url
      : '',
  );
  const [kind, setKind] = useState<'weekly' | 'once'>(initial?.kind ?? 'weekly');
  const [days, setDays] = useState<Set<number>>(
    new Set(
      initial?.kind === 'weekly' && initial.daysOfWeek
        ? initial.daysOfWeek.split(',').filter(Boolean).map(Number)
        : [1, 2, 3, 4, 5],
    ),
  );
  const [date, setDate] = useState(initial?.date ?? '');
  const [time, setTime] = useState(initial?.time ?? '08:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleDay(i: number) {
    const next = new Set(days);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setDays(next);
  }

  async function submit() {
    setError('');
    if (!name.trim()) return setError('Name is required.');
    if (!target) return setError('Pick a target.');
    if (action === 'set_content' && contentKind === 'url' && !url) return setError('URL is required.');
    if (kind === 'weekly' && days.size === 0) return setError('Pick at least one day.');
    if (kind === 'once' && !date) return setError('Pick a date.');

    const [targetType, targetId] = target.split(':') as ['device' | 'group', string];
    let payload: SchedulePayload;
    if (action === 'tv_power') payload = { on };
    else payload = contentKind === 'url' ? { type: 'url', url } : { type: 'blank' };

    const body: NewSchedule = {
      name: name.trim(),
      enabled: initial?.enabled ?? true,
      targetType,
      targetId,
      action,
      payload,
      kind,
      time,
      daysOfWeek: kind === 'weekly' ? [...days].sort((a, b) => a - b).join(',') : null,
      date: kind === 'once' ? date : null,
    };

    setBusy(true);
    try {
      if (initial) await api.updateSchedule(initial.id, body);
      else await api.createSchedule(body);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">{initial ? 'Edit schedule' : 'New schedule'}</div>
      <label className="field">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Open TVs" />
      </label>

      <label className="field">
        Target
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Select a device or group…</option>
          {groups.length > 0 && (
            <optgroup label="Groups">
              {groups.map((g) => (
                <option key={g.id} value={`group:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Devices">
            {devices.map((d) => (
              <option key={d.id} value={`device:${d.id}`}>
                {d.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <label className="field">
        Action
        <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
          <option value="tv_power">TV power</option>
          <option value="set_content">Set content</option>
        </select>
      </label>

      {action === 'tv_power' ? (
        <label className="field">
          State
          <select value={on ? 'on' : 'off'} onChange={(e) => setOn(e.target.value === 'on')}>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
      ) : (
        <>
          <label className="field">
            Content
            <select
              value={contentKind}
              onChange={(e) => setContentKind(e.target.value as typeof contentKind)}
            >
              <option value="url">URL</option>
              <option value="blank">Blank</option>
            </select>
          </label>
          {contentKind === 'url' && (
            <label className="field">
              URL
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </label>
          )}
        </>
      )}

      <label className="field">
        Repeat
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="weekly">Weekly</option>
          <option value="once">Once (specific date)</option>
        </select>
      </label>

      {kind === 'weekly' ? (
        <div className="field">
          Days
          <div className="dow">
            {DOW.map((d, i) => (
              <button
                key={i}
                type="button"
                className={`dow-btn ${days.has(i) ? '' : 'ghost'}`}
                onClick={() => toggleDay(i)}
              >
                {d[0]}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <label className="field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}

      <label className="field">
        Time (Eastern)
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>

      {error && <div className="error">{error}</div>}
      <div className="card-actions">
        <button onClick={submit} disabled={busy}>
          {initial ? 'Save changes' : 'Create schedule'}
        </button>
      </div>
    </div>
  );
}
