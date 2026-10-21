import type React from 'react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/Shell';
import { api } from './lib/api';
import { DataProvider, type Screen } from './lib/store';
import type { User } from './lib/types';
import { DashboardJump } from './screens/DashboardJump';
import { Deliveries } from './screens/Deliveries';
import { Home } from './screens/Home';
import { Issued } from './screens/Issued';
import { Login } from './screens/Login';
import { Returns } from './screens/Returns';
import { SetPassword } from './screens/SetPassword';
import { SignUp, Waiting } from './screens/SignUp';
import { Submitted } from './screens/Submitted';
import { Transfers } from './screens/Transfers';
import { exitTraining } from './lib/training';
import { bootDone, bootGreet, forgetVisitor } from './lib/boot';
import { recordScreen } from './lib/nav';

// Screens used less often load on demand, so the first download is smaller.
const Admin = lazy(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Corrections = lazy(() => import('./screens/Corrections').then((m) => ({ default: m.Corrections })));
const StockTake = lazy(() => import('./screens/StockTake').then((m) => ({ default: m.StockTake })));
const Records = lazy(() => import('./screens/Records').then((m) => ({ default: m.Records })));
const Consumption = lazy(() => import('./screens/Consumption').then((m) => ({ default: m.Consumption })));
const Reports = lazy(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const PageSkeleton = () => (
  <div className="page" aria-busy="true">
    <i className="skel" style={{ width: 180, height: 14 }} /><i className="skel" style={{ width: '45%', height: 34 }} />
    <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi"><i className="skel" style={{ width: '60%' }} /><i className="skel big" /></div>)}</div>
    <div className="panel pad stack">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="skel" style={{ width: `${55 + ((i * 13) % 40)}%` }} />)}</div>
  </div>
);

const SCREENS: Record<Screen, React.ComponentType> = {
  home: Home, deliveries: Deliveries, issued: Issued, returns: Returns, transfers: Transfers,
  submitted: Submitted, dashboard: DashboardJump, stocktake: StockTake, corrections: Corrections, reports: Reports, welcome: Home,
  'rec-deliveries': () => <Records recKey="deliveries" />, 'rec-issued': () => <Records recKey="issued" />,
  'rec-returns': () => <Records recKey="returns" />, 'rec-transfers': () => <Records recKey="transfers" />, consumption: Consumption,
};

const fromHash = (): Screen => {
  const h = location.hash.replace('#/', '') as Screen;
  return h in SCREENS ? h : 'home';
};

const isAdminPath = () => location.pathname.replace(/\/+$/, '') === '/admin';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>(fromHash);
  useEffect(() => { recordScreen(screen); }, [screen]);
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
  const signOut = useCallback(async () => {
    if (api.mode === 'training') { exitTraining(); return; }
    await api.signOut();
    try { Object.keys(localStorage).filter((k) => k.startsWith('ssms-cache:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    forgetVisitor();
    setUser(null); history.replaceState(null, '', '/'); setAdminPath(false);
  }, []);
  // Screens that don't load the store finish the boot screen straight away.
  const storeScreen = !!user && user.status === 'approved' && !adminPath && !recovering;
  // Once we know who is signed in, greet that person (or nobody), never the last person on this device.
  useEffect(() => { if (user) bootGreet(user.name); else if (user === null) { const h = document.getElementById('bootHello'); if (h) h.textContent = ''; } }, [user]);
  useEffect(() => { if (user !== undefined && !storeScreen) bootDone(); }, [user, storeScreen]);

  if (user === undefined) return null;
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
    return <Suspense fallback={<PageSkeleton />}><Admin user={user} onExit={() => go('home')} onSignOut={signOut} /></Suspense>;
  }
  const View = SCREENS[screen];
  return (
    <DataProvider user={user} go={go} signOut={signOut} openAdmin={openAdmin}>
      <AppShell screen={screen}><Suspense fallback={<PageSkeleton />}><View /></Suspense></AppShell>
    </DataProvider>
  );
}
