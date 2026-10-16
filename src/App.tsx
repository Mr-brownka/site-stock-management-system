import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api';
import { DataProvider, type Screen } from './lib/store';
import type { User } from './lib/types';
import { Dashboard } from './screens/Dashboard';
import { Deliveries } from './screens/Deliveries';
import { Home } from './screens/Home';
import { Issued } from './screens/Issued';
import { Login } from './screens/Login';
import { Opening } from './screens/Opening';
import { Returns } from './screens/Returns';
import { Submitted } from './screens/Submitted';
import { Transfers } from './screens/Transfers';

const SCREENS: Record<Screen, () => JSX.Element> = {
  home: Home, deliveries: Deliveries, issued: Issued, returns: Returns, transfers: Transfers,
  submitted: Submitted, dashboard: Dashboard, opening: Opening,
};

const fromHash = (): Screen => {
  const h = location.hash.replace('#/', '') as Screen;
  return h in SCREENS ? h : 'home';
};

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>(fromHash);

  const loadUser = useCallback(() => api.currentUser().then(setUser).catch(() => setUser(null)), []);
  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => {
    const on = () => { setScreen(fromHash()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((s: Screen) => { location.hash = `/${s}`; }, []);
  const signOut = useCallback(async () => { await api.signOut(); setUser(null); location.hash = ''; }, []);

  if (user === undefined) return <div className="spinner">Loading…</div>;
  if (!user) return <Login onIn={loadUser} />;
  const View = SCREENS[screen];
  return (
    <DataProvider user={user} go={go} signOut={signOut}>
      <View key={screen} />
    </DataProvider>
  );
}
