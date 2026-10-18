import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import { signal, useSignal } from '../lib/signals';
import { CrateMark, SiteLogo } from './Brand';
import { Icon, PulseDot, Ring, useMinutesToClose } from './fx';
import { StartTraining } from './Training';
import { CommandPalette } from './CommandPalette';
import { Welcome } from '../screens/Welcome';

const CHECKIN: Screen[] = ['home', 'dashboard', 'deliveries', 'issued', 'returns', 'transfers', 'submitted'];
const NAV: { screen: Screen; label: string; icon: string; match: Screen[] }[] = [
  { screen: 'home', label: 'Check-in', icon: 'checkin', match: CHECKIN },
  { screen: 'stocktake', label: 'Stock take', icon: 'box', match: ['stocktake'] },
  { screen: 'reports', label: 'Reports', icon: 'report', match: ['reports'] },
  { screen: 'corrections', label: 'Fix a mistake', icon: 'fix', match: ['corrections'] },
];
// Screens that show the phone tab bar (not the step-by-step forms).
const TABBAR: Screen[] = ['home', 'dashboard', 'corrections', 'submitted', 'reports', 'stocktake'];

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
  return [NAV.find((n) => n.match.includes(screen))?.label ?? ''];
}

const readRail = () => { try { return localStorage.getItem('ssms-rail') === 'mini'; } catch { return false; } };

export function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const { user, site, go, signOut, openAdmin, stepState, submission, lowItems, balances, day, projectWeek, syncing } = useData();
  const [mini, setMini] = useState(readRail);
  const [palette, setPalette] = useState(false);
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
  if (!balances.length && (screen === 'home' || screen === 'dashboard')) return <Welcome />;
  const done = STEPS.filter((s) => stepState(s.key) !== 'todo').length;
  const urgent = !submission && min < 60;
  const trail = crumbs(screen);
  const dateChip = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`shell ${TABBAR.includes(screen) ? 'hasTab' : ''} ${mini ? 'mini' : ''}`}>
      <aside className="rail" aria-label="Main menu">
        <div className="railBrand">
          <CrateMark size={34} tile="dark" />
          <div className="railName"><b>COMEX BUILDERS</b><span>Site Stock</span></div>
        </div>
        {site && <div className="railSite" title={site}><SiteLogo name={site} height={34} /></div>}
        <nav className="railNav">
          <span className="railSec">Operations</span>
          {NAV.map((n) => (
            <button key={n.screen} className="railLink" title={n.label} aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <Icon name={n.icon} /><span className="rlText">{n.label}</span>
              {n.screen === 'home' && lowItems.length > 0 && <span className="railLow"><PulseDot />{lowItems.length}</span>}
            </button>
          ))}
          <span className="railSec">Tools</span>
          {user.role === 'admin' && <button className="railLink" title="Admin" onClick={openAdmin}><Icon name="user" /><span className="rlText">Admin</span></button>}
          <StartTraining user={user} label="Training mode" />
          <button className="railLink" title="Search" onClick={() => setPalette(true)}><Icon name="search" /><span className="rlText">Search</span><kbd className="rlText">Ctrl K</kbd></button>
        </nav>
        <div className={`railToday ${urgent ? 'urgent' : ''}`}>
          <Ring done={submission ? 4 : done} total={4} size={44} />
          <div className="rlText">
            <b>{submission ? 'Day submitted' : done === 4 ? 'Ready to submit' : 'Today’s check-in'}</b>
            <span>{submission ? 'All four steps done' : closeLabel(min)}</span>
          </div>
        </div>
        <div className="railUser">
          <span className="avatar">{initials}</span>
          <div className="rlText"><b>{user.name}</b><span>{user.role === 'admin' ? 'Admin' : 'Storekeeper'}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</span></div>
          <button className="iconBtn sm rlText" onClick={signOut} title="Sign out" aria-label="Sign out"><Icon name="out" size={18} /></button>
        </div>
        <button className="railCollapse" onClick={toggleRail} aria-label={mini ? 'Expand the menu' : 'Collapse the menu'} title={mini ? 'Expand the menu' : 'Collapse the menu'}><Icon name="panel" size={18} /><span className="rlText">Collapse menu</span></button>
      </aside>

      <div className="shellMain">
        <header className="topbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="crSite">{site || 'Store'}</span>
            {trail.map((c, i) => (
              <span key={c} className="crPart"><span aria-hidden="true">/</span>
                {i < trail.length - 1 ? <button onClick={() => go('home')}>{c}</button> : <b aria-current="page">{c}</b>}
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
            <span className={`tbChip status ${submission ? 'ok' : min <= 0 ? 'late' : urgent ? 'soon' : ''}`}>
              {submission ? <><Icon name="check" size={14} />Submitted</> : <>{min <= 0 ? <PulseDot /> : <Icon name="clock" size={14} />}{closeLabel(min).replace('Register ', '')}</>}
            </span>
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
