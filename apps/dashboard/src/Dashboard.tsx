import { useCallback, useEffect, useState } from 'react';
import {
  api,
  clearToken,
  openEventStream,
  type Device,
  type Group,
  type Schedule,
} from './api.ts';
import { DeviceCard } from './DeviceCard.tsx';
import { AddDeviceModal } from './AddDeviceModal.tsx';
import { ChangePasswordModal } from './ChangePasswordModal.tsx';
import { GroupsPanel } from './GroupsPanel.tsx';
import { SchedulesPanel } from './SchedulesPanel.tsx';

type Tab = 'devices' | 'groups' | 'schedules';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, g, s] = await Promise.all([
        api.listDevices(),
        api.listGroups(),
        api.listSchedules(),
      ]);
      setDevices(d.devices);
      setGroups(g.groups);
      setSchedules(s.schedules);
    } catch (err) {
      if ((err as Error).message === 'unauthorized') onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: refetch on any server-sent event (device/group/schedule).
  useEffect(() => {
    const es = openEventStream(() => load());
    return () => es?.close();
  }, [load]);

  function logout() {
    clearToken();
    onLogout();
  }

  const online = devices.filter((d) => d.status === 'online').length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          PiSignage
        </div>
        <nav className="tabs">
          {(['devices', 'groups', 'schedules'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
        <div className="topbar-meta">
          <span className="muted">
            {online}/{devices.length} online
          </span>
          <button className="ghost" onClick={() => setShowPassword(true)}>
            Password
          </button>
          <button className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : tab === 'devices' ? (
          <>
            <div className="content-head">
              <h1>Devices</h1>
              <button onClick={() => setShowAdd(true)}>+ Add device</button>
            </div>
            {devices.length === 0 ? (
              <div className="empty">
                <p>No devices yet.</p>
                <p className="muted">
                  Boot a Pi with the agent, then click <strong>Add device</strong> and enter the
                  code shown on its screen.
                </p>
              </div>
            ) : (
              <div className="grid">
                {devices.map((d) => (
                  <DeviceCard key={d.id} device={d} onChanged={load} />
                ))}
              </div>
            )}
          </>
        ) : tab === 'groups' ? (
          <GroupsPanel groups={groups} devices={devices} onChanged={load} />
        ) : (
          <SchedulesPanel
            schedules={schedules}
            devices={devices}
            groups={groups}
            onChanged={load}
          />
        )}
      </main>

      {showAdd && (
        <AddDeviceModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {showPassword && <ChangePasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}
