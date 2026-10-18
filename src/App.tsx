import { useCallback, useEffect, useState } from 'react';
import { Loader } from './components/Brand';
import { AppShell } from './components/Shell';
import { api } from './lib/api';
import { DataProvider, type Screen } from './lib/store';
import type { User } from './lib/types';
import { Admin } from './screens/Admin';
import { Corrections } from './screens/Corrections';
import { DashboardJump } from './screens/DashboardJump';
import { Deliveries } from './screens/Deliveries';
import { Home } from './screens/Home';
import { Issued } from './screens/Issued';
import { Login } from './screens/Login';
import { StockTake } from './screens/StockTake';
import { Reports } from './screens/Reports';
import { Returns } from './screens/Returns';
import { SetPassword } from './screens/SetPassword';
import { SignUp, Waiting } from './screens/SignUp';
import { Submitted } from './screens/Submitted';
import { Transfers } from './screens/Transfers';
import { exitTraining } from './lib/training';

const SCREENS: Record<Screen, () => JSX.Element> = {
  home: Home, deliveries: Deliveries, issued: Issued, returns: Returns, transfers: Transfers,
  submitted: Submitted, dashboard: DashboardJump, stocktake: StockTake, corrections: Corrections, reports: Reports,
};

const fromHash = (): Screen => {
  const h = location.hash.replace('#/', '') as Screen;
  return h in SCREENS ? h : 'home';
};

const isAdminPath = () => location.pathname.replace(/\/+$/, '') === '/admin';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>(fromHash);
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIntroDone(true), 1800); return () => clearTimeout(t); }, []);
  const [recovering, setRecovering] = useState(() => api.isRecovery());
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminPath, setAdminPath] = useState(isAdminPath);

  const loadUser = useCallback(() => api.currentUser().then(setUser).catch(() => setUser(null)), []);
  useEffect(() => { loadUser(); }, [loadUser]);
  useEffect(() => {
    const on = () => { setScreen(fromHash()); setAdminPath(isAdminPath()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  useEffect(() => { const t = setInterval(() => { if (api.isRecovery()) setRecovering(true); }, 500); return () => clearInterval(t); }, []);

  const go = useCallback((s: Screen) => {
    if (isAdminPath()) { history.pushState(null, '', `/#/${s}`); setAdminPath(false); setScreen(s); return; }
    location.hash = `/${s}`;
  }, []);
  const openAdmin = useCallback(() => { history.pushState(null, '', '/admin'); setAdminPath(true); window.scrollTo(0, 0); }, []);
  const signOut = useCallback(async () => { if (api.mode === 'training') { exitTraining(); return; } await api.signOut(); setUser(null); history.replaceState(null, '', '/'); setAdminPath(false); }, []);

  if (user === undefined || !introDone) return <Loader />;
  if (recovering) return <SetPassword onDone={() => { setRecovering(false); location.hash = ''; loadUser(); }} />;
  if (!user) {
    if (creating) {
      return <SignUp onBack={() => setCreating(false)} onDone={async () => {
        setCreating(false);
        const u = await api.currentUser().catch(() => null);
        if (u) setUser(u); else setNotice('Account created. If an email arrives asking you to confirm, confirm it first, then sign in here.');
      }} />;
    }
    return <Login onIn={loadUser} onCreate={() => { setNotice(''); setCreating(true); }} notice={notice} />;
  }
  if (user.status !== 'approved') return <Waiting name={user.name} status={user.status} onCheck={loadUser} onSignOut={signOut} />;
  if (adminPath) {
    if (user.role !== 'admin') {
      return (
        <div className="phone"><main className="body center" style={{ justifyContent: 'center', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 28 }}>The admin page is for the admin only</h2>
          <button className="btn" onClick={() => go('home')}>Go to the check-in</button>
        </main></div>
      );
    }
    return <Admin user={user} onExit={() => go('home')} onSignOut={signOut} />;
  }
  const View = SCREENS[screen];
  return (
    <DataProvider user={user} go={go} signOut={signOut} openAdmin={openAdmin}>
      <AppShell screen={screen}><View /></AppShell>
    </DataProvider>
  );
}
