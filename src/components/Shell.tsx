import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import { longDate, weekdayName } from '../lib/dates';
import { signal, useSignal } from '../lib/signals';
import { ComexLogo, SiteLogo } from './Brand';
import { ZohoAutoSync, ZohoStatusLine } from './Zoho';
import { Icon, PulseDot, Ring, useMinutesToClose } from './fx';
import { StartTraining } from './Training';
import { CommandPalette } from './CommandPalette';
import { Welcome } from '../screens/Welcome';
import { isTrained } from '../lib/trainingPlan';

const CHECKIN: Screen[] = ['home', 'dashboard', 'deliveries', 'issued', 'returns', 'transfers', 'submitted'];
const NAV: { screen: Screen; label: string; icon: string; match: Screen[] }[] = [
  { screen: 'home', label: 'Check-in', icon: 'checkin', match: CHECKIN },
  { screen: 'stocktake', label: 'Stock take', icon: 'box', match: ['stocktake'] },
  { screen: 'reports', label: 'Reports', icon: 'report', match: ['reports'] },
  { screen: 'corrections', label: 'Fix an error', icon: 'fix', match: ['corrections'] },
];
/** Records: past entries per kind, each with its colour (green in, orange out, blue back in, purple transfers). */
const RECORDS: { screen: Screen; label: string; tone: string }[] = [
  { screen: 'rec-deliveries', label: 'Deliveries', tone: 'deliveries' },
  { screen: 'rec-issued', label: 'Issued items', tone: 'issued' },
  { screen: 'rec-returns', label: 'Returned items', tone: 'returns' },
  { screen: 'rec-transfers', label: 'Project transfers', tone: 'transfers' },
];
const readRecOpen = () => { try { return localStorage.getItem('ssms-records') !== 'closed'; } catch { return true; } };
// Screens that show the phone tab bar (not the step-by-step forms).
const TABBAR: Screen[] = ['home', 'dashboard', 'corrections', 'submitted', 'reports', 'stocktake', 'rec-deliveries', 'rec-issued', 'rec-returns', 'rec-transfers'];

export function closeLabel(min: number): string {
  if (min <= 0) return 'Register closed at 6:00 pm';
  const h = Math.floor(min / 60), m = min % 60;
  return `Register closes in ${h ? `${h}h ` : ''}${m}m`;
}

function crumbs(screen: Screen): string[] {
  const step = STEPS.find((s) => s.screen === screen);
  if (step) return ['Check-in', `Step ${step.n} · ${step.label}`];
  if (screen === 'submitted') return ['Check-in', 'Day submitted'];
  if (CHECKIN.includes(screen)) return ['Check-in'];
  const rec = RECORDS.find((r) => r.screen === screen);
  if (rec) return ['Records', rec.label];
  if (screen === 'reports') return ['Records', 'Reports'];
  return [NAV.find((n) => n.match.includes(screen))?.label ?? ''];
}

const readRail = () => { try { return localStorage.getItem('ssms-rail') === 'mini'; } catch { return false; } };

export function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const { user, site, go, signOut, openAdmin, stepState, submission, lowItems, balances, day, projectWeek, syncing, catchUp, endCatchUp } = useData();
  const [mini, setMini] = useState(readRail);
  const [recOpen, setRecOpen] = useState(readRecOpen);
  const [userMenu, setUserMenu] = useState(false);
  const toggleRec = () => { const v = !recOpen; setRecOpen(v); try { localStorage.setItem('ssms-records', v ? 'open' : 'closed'); } catch { /* ignore */ } };
  const [palette, setPalette] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  // The gold menu highlight slides to the current page.
  const navRef = useRef<HTMLElement>(null);
  const [ink, setInk] = useState<{ top: number; height: number; opacity: number }>({ top: 0, height: 0, opacity: 0 });
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>('.railLink[aria-current="page"]');
    setInk(el ? { top: el.offsetTop, height: el.offsetHeight, opacity: 1 } : { top: 0, height: 0, opacity: 0 });
  }, [screen, mini, recOpen]);
  const min = useMinutesToClose();
  useSignal('palette', () => setPalette(true));
  // Ctrl/⌘ + K opens the search from anywhere.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  const toggleRail = () => { const v = !mini; setMini(v); try { localStorage.setItem('ssms-rail', v ? 'mini' : 'full'); } catch { /* ignore */ } };

  // A store with no stock take yet starts on the welcome page.
  // New store members stay on the welcome page until 5 training days are done and the store has stock
  // (a store with no stock unlocks its first stock take after training).
  const onboarding = api.mode !== 'training' && user.role !== 'admin' && (!isTrained(user) || !balances.length);
  if (onboarding && !(screen === 'stocktake' && isTrained(user))) return <><ZohoAutoSync /><Welcome /></>;
  if (screen === 'welcome' || (!balances.length && (screen === 'home' || screen === 'dashboard'))) return <><ZohoAutoSync /><Welcome /></>;
  const done = STEPS.filter((s) => stepState(s.key) !== 'todo').length;
  const urgent = !submission && min < 60;
  const trail = crumbs(screen);
  const dateChip = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`shell ${TABBAR.includes(screen) ? 'hasTab' : ''} ${mini ? 'mini' : ''}`}>
      <ZohoAutoSync />
      <aside className="rail" aria-label="Main menu">
        <div className="railBrand comexBrand" title="Comex Builders Ltd">
          {mini ? <ComexLogo dark hatOnly width={44} /> : <ComexLogo dark width={172} />}
        </div>
        <nav className="railNav" ref={navRef}>
          <span className="railInk" aria-hidden="true" style={ink} />
          <span className="railSec">Operations</span>
          {NAV.slice(0, 2).map((n) => (
            <button key={n.screen} className="railLink" title={n.label} aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <Icon name={n.icon} /><span className="rlText">{n.label}</span>
              {n.screen === 'home' && lowItems.length > 0 && <span className="railLow"><PulseDot />{lowItems.length}</span>}
            </button>
          ))}
          <span className="railSec">Records</span>
          <button className="railLink railGroup" title="Records" aria-expanded={recOpen} onClick={toggleRec}>
            <Icon name="list" /><span className="rlText">Records</span><span className={`rgChev rlText ${recOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
          </button>
          {recOpen && <>
            {RECORDS.map((r) => (
              <button key={r.screen} className={`railLink railSub ${r.tone}`} title={r.label} aria-current={screen === r.screen ? 'page' : undefined} onClick={() => go(r.screen)}>
                <span className="rsDot" aria-hidden="true" /><span className="rlText">{r.label}</span>
              </button>
            ))}
            <button className="railLink railSub" title="Reports" aria-current={screen === 'reports' ? 'page' : undefined} onClick={() => go('reports')}>
              <Icon name="report" size={17} /><span className="rlText">Reports</span>
            </button>
          </>}
          <span className="railSec">Corrections</span>
          <button className="railLink" title="Fix an error" aria-current={screen === 'corrections' ? 'page' : undefined} onClick={() => go('corrections')}>
            <Icon name="fix" /><span className="rlText">Fix an error</span>
          </button>
        </nav>
        <div className={`railToday ${urgent ? 'urgent' : ''}`}>
          <Ring done={submission ? 4 : done} total={4} size={44} />
          <div className="rlText">
            <b>{submission ? 'Day submitted' : done === 4 ? 'Ready to submit' : 'Today’s check-in'}</b>
            <span>{submission ? 'All four steps done' : closeLabel(min)}</span>
          </div>
        </div>
        <div className="railUserWrap">
          {userMenu && (
            <div className="railUserMenu" role="menu" onMouseLeave={() => setUserMenu(false)}>
              {user.role === 'admin' && <button className="railLink" role="menuitem" onClick={() => { setUserMenu(false); openAdmin(); }}><Icon name="user" /><span className="rlText">Admin</span></button>}
              <ZohoStatusLine compact />
              <StartTraining user={user} label="Training mode" />
              <button className="railLink signOut" role="menuitem" onClick={signOut}><Icon name="out" /><span className="rlText">Sign out</span></button>
            </div>
          )}
          <button className="railUser" onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu} aria-haspopup="menu" title="Your account">
            <span className="avatar">{initials}</span>
            <div className="rlText"><b>{user.name}</b><span>{user.role === 'admin' ? 'Admin' : 'Store'}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</span></div>
            <span className={`rgChev rlText ${userMenu ? 'open' : ''}`} aria-hidden="true">▴</span>
          </button>
        </div>
        <button className="railCollapse" onClick={toggleRail} aria-label={mini ? 'Expand the menu' : 'Collapse the menu'} title={mini ? 'Expand the menu' : 'Collapse the menu'}><Icon name="panel" size={18} /><span className="rlText">Collapse menu</span></button>
      </aside>

      <div className="shellMain">
        {catchUp && (
          <div className="catchBar" role="status">
            <span className="cbTag">Catch-up</span>
            <span className="cbText">You are entering <b>{longDate(day)}</b>. Everything you save now is dated {weekdayName(day)}.</span>
            <button className="cbBack" onClick={() => { endCatchUp(); go('home'); }}>Back to today</button>
          </div>
        )}
        <header className="topbar">
          <span className="routeBar" key={screen} aria-hidden="true" />
          <span className="tbComex" aria-hidden="true"><ComexLogo hatOnly width={36} /></span>
          <div className="siteSwitchWrap">
            <button className="siteSwitch" onClick={() => setSiteOpen((v) => !v)} aria-expanded={siteOpen} aria-haspopup="dialog" title={site ? `Site: ${site}` : 'Site'}>
              {site ? <SiteLogo name={site} height={26} /> : <b>Store</b>}
              <span className="ssChev" aria-hidden="true">▾</span>
            </button>
            {siteOpen && (
              <div className="sitePop" role="dialog" aria-label="Site" onMouseLeave={() => setSiteOpen(false)}>
                {site && <div className="spLogo"><SiteLogo name={site} height={44} /></div>}
                <div className="spRow"><span>Site</span><b>{site || '–'}</b></div>
                {projectWeek != null && <div className="spRow"><span>Project week</span><b>{projectWeek}</b></div>}
                <div className="spRow"><span>Items in store</span><b>{balances.filter((b) => b.balance > 0).length}</b></div>
                <div className="spRow"><span>You</span><b>{user.name} · {user.role === 'admin' ? 'Admin' : 'Store'}</b></div>
                {user.role === 'admin' && <button className="btn ghost sm" onClick={() => { setSiteOpen(false); openAdmin(); }}>Manage sites</button>}
              </div>
            )}
          </div>
          <nav className="crumbs" aria-label="Breadcrumb">
            {trail.map((c, i) => (
              <span key={c} className="crPart"><span aria-hidden="true">/</span>
                {i < trail.length - 1 ? (c === 'Records' ? <span>{c}</span> : <button onClick={() => go('home')}>{c}</button>) : <b aria-current="page">{c}</b>}
              </span>
            ))}
          </nav>
          <button className="tbSearch" onClick={() => setPalette(true)} aria-label="Search items, pages and actions">
            <Icon name="search" size={16} /><span>Search items, pages, actions</span><kbd>Ctrl K</kbd>
          </button>
          <div className="tbChips">
            {syncing && <span className="tbChip sync" role="status"><span className="syncDot" aria-hidden="true" />Updating…</span>}
            {projectWeek != null && <span className="tbChip" title="Project week">Week {projectWeek}</span>}
            <span className="tbChip"><Icon name="calendar" size={14} />{dateChip}</span>
            {!catchUp && <span className={`tbChip status ${submission ? 'ok' : min <= 0 ? 'late' : urgent ? 'soon' : ''}`}>
              {submission ? <><Icon name="check" size={14} />Submitted</> : <>{min <= 0 ? <PulseDot /> : <Icon name="clock" size={14} />}{closeLabel(min).replace('Register ', '')}</>}
            </span>}
          </div>
        </header>
        <div className="screen" key={screen}>{children}</div>
      </div>

      {TABBAR.includes(screen) && (
        <nav className="tabbar" aria-label="Main menu">
          {NAV.map((n) => (
            <button key={n.screen} aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <span className="tbIcon"><Icon name={n.icon} size={22} />{n.screen === 'home' && lowItems.length > 0 && <PulseDot />}</span>
              {{ home: 'Check-in', corrections: 'Fix', stocktake: 'Stock take' }[n.screen as string] ?? n.label}
            </button>
          ))}
          <button onClick={() => signal('palette')}><span className="tbIcon"><Icon name="search" size={22} /></span>Search</button>
        </nav>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
