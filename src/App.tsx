import type React from 'react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { lazyPage, PageGuard } from './components/Recover';
import { AppShell } from './components/Shell';
import { api, live } from './lib/api';
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
import { RecordsHub } from './screens/RecordsHub';
import { Transfers } from './screens/Transfers';
import { exitTraining } from './lib/training';
import { endGuest, startGuest } from './lib/guest';
import { bootDone, bootGreet, forgetVisitor } from './lib/boot';
import { recordScreen } from './lib/nav';
import { canSee, firstAllowed } from './lib/access';
import { toast } from './components/feedback';
import { useIsPhone } from './components/Ring';
import { PhoneHome } from './phone/PhoneHome';
import { PhoneRecList, PhoneRecordsHub } from './phone/PhoneRecords';
import { PhoneItems } from './phone/PhoneItems';
import { PhoneIncoming } from './phone/PhoneIncoming';
import { PhoneMe, PhoneToFinish } from './phone/PhoneMe';
import { PhoneLow } from './phone/PhoneLow';

// Screens used less often load on demand, so the first download is smaller.
const Admin = lazyPage(() => import('./screens/Admin').then((m) => ({ default: m.Admin })));
const Corrections = lazyPage(() => import('./screens/Corrections').then((m) => ({ default: m.Corrections })));
const StockTake = lazyPage(() => import('./screens/StockTake').then((m) => ({ default: m.StockTake })));
const Records = lazyPage(() => import('./screens/Records').then((m) => ({ default: m.Records })));
const Consumption = lazyPage(() => import('./screens/Consumption').then((m) => ({ default: m.Consumption })));
const Balances = lazyPage(() => import('./screens/Balances').then((m) => ({ default: m.Balances })));
const ComingIn = lazyPage(() => import('./components/Incoming').then((m) => ({ default: m.ComingInPage })));
const Reports = lazyPage(() => import('./screens/Reports').then((m) => ({ default: m.Reports })));
const PageSkeleton = () => (
  <div className="page" aria-busy="true">
    <i className="skel" style={{ width: 180, height: 14 }} /><i className="skel" style={{ width: '45%', height: 34 }} />
    <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="kpi"><i className="skel" style={{ width: '60%' }} /><i className="skel big" /></div>)}</div>
    <div className="panel pad stack">{[0, 1, 2, 3, 4].map((i) => <i key={i} className="skel" style={{ width: `${55 + ((i * 13) % 40)}%` }} />)}</div>
  </div>
);

/** On a phone, some pages have their own phone design. */
const pick = (Desk: React.ComponentType, Phone: React.ComponentType) => function Pick() { return useIsPhone() ? <Phone /> : <Desk />; };
const DeskDashboard = () => <DashboardJump />;
const SCREENS: Record<Screen, React.ComponentType> = {
  home: pick(Home, PhoneHome), deliveries: Deliveries, issued: Issued, returns: Returns, transfers: Transfers,
  submitted: Submitted, dashboard: pick(DeskDashboard, PhoneItems), stocktake: StockTake, corrections: Corrections, reports: Reports, welcome: Home,
  'rec-deliveries': pick(() => <Records recKey="deliveries" />, () => <PhoneRecList recKey="deliveries" />), 'rec-issued': pick(() => <Records recKey="issued" />, () => <PhoneRecList recKey="issued" />),
  'rec-returns': pick(() => <Records recKey="returns" />, () => <PhoneRecList recKey="returns" />), 'rec-transfers': pick(() => <Records recKey="transfers" />, () => <PhoneRecList recKey="transfers" />),
  consumption: Consumption, balances: Balances, records: pick(RecordsHub, PhoneRecordsHub), incoming: pick(ComingIn, PhoneIncoming), me: pick(Home, PhoneMe), tofinish: PhoneToFinish, low: pick(() => { try { sessionStorage.setItem('ssms-bal-filter', 'low'); } catch { /* ignore */ } return <Balances />; }, PhoneLow),
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
    if (api.mode === 'guest') { endGuest(); await live?.signOut().catch(() => undefined); forgetVisitor(); location.replace('/'); return; }
    await api.signOut();
    try { Object.keys(localStorage).filter((k) => k.startsWith('ssms-cache:')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    forgetVisitor();
    setUser(null); history.replaceState(null, '', '/'); setAdminPath(false);
  }, []);
  // Tell the admin who is using the app today: once on opening, then every 5 minutes while it is open and in view.
  const signedIn = !!user && user.status === 'approved' && api.mode === 'live';
  useEffect(() => {
    if (!signedIn) return;
    let lastAt = 0;
    const ping = () => { if (document.visibilityState !== 'visible' || Date.now() - lastAt < 60_000) return; lastAt = Date.now(); api.touch().catch(() => undefined); };
    ping();
    const t = setInterval(ping, 300_000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };
  }, [signedIn]);
  // Screens that don't load the store finish the boot screen straight away.
  const storeScreen = !!user && user.status === 'approved' && !adminPath && !recovering;
  // Once we know who is signed in, greet that person (or nobody), never the last person on this device.
  useEffect(() => { if (user) bootGreet(user.name); else if (user === null) { const h = document.getElementById('bootHello'); if (h) h.textContent = ''; } }, [user]);
  useEffect(() => { if (user !== undefined && !storeScreen) bootDone(); }, [user, storeScreen]);

  // A guest account opens on its own copy of the site (made now, kept in this browser).
  const guestOpening = !!user && user.guest && api.mode === 'live';
  useEffect(() => { if (guestOpening && live && user) startGuest(live, user).catch(() => { setUser(null); }); }, [guestOpening, user]);
  if (user === undefined || guestOpening) return null;
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
    return <PageGuard screen="admin"><Suspense fallback={<PageSkeleton />}><Admin user={user} onExit={() => go('home')} onSignOut={signOut} /></Suspense></PageGuard>;
  }
  // Pages the admin hasn't given this person go to the first page they may see.
  const allowed = canSee(user, screen) ? screen : firstAllowed(user);
  const View = SCREENS[allowed];
  return (
    <DataProvider user={user} go={(s: Screen) => { if (!canSee(user, s)) { toast('That page is turned off for you. Ask the admin to turn it on.', 'warn'); return; } go(s); }} signOut={signOut} openAdmin={openAdmin}>
      <AppShell screen={allowed}><PageGuard screen={allowed}><Suspense fallback={<PageSkeleton />}><View /></Suspense></PageGuard></AppShell>
    </DataProvider>
  );
}
