import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, openEventStream, type Device } from './api.ts';
import { DeviceCard } from './DeviceCard.tsx';
import { AddDeviceModal } from './AddDeviceModal.tsx';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const { devices } = await api.listDevices();
      setDevices(devices);
    } catch (err) {
      if ((err as Error).message === 'unauthorized') onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: refetch on any server-sent device event.
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
        <div className="topbar-meta">
          <span className="muted">
            {online}/{devices.length} online
          </span>
          <button className="ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        <div className="content-head">
          <h1>Devices</h1>
          <button onClick={() => setShowAdd(true)}>+ Add device</button>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : devices.length === 0 ? (
          <div className="empty">
            <p>No devices yet.</p>
            <p className="muted">
              Boot a Pi with the agent, then click <strong>Add device</strong> and enter the code
              shown on its screen.
            </p>
          </div>
        ) : (
          <div className="grid">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onChanged={load} />
            ))}
          </div>
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
    </div>
  );
}
