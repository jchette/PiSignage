import { useEffect, useState } from 'react';
import { getToken } from './api.ts';
import { Login } from './Login.tsx';
import { Dashboard } from './Dashboard.tsx';

export function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getToken()));

  // Keep auth state in sync if the token is cleared elsewhere (e.g. a 401).
  useEffect(() => {
    const onStorage = () => setAuthed(Boolean(getToken()));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (!authed) {
    return <Login onLoggedIn={() => setAuthed(true)} />;
  }
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
