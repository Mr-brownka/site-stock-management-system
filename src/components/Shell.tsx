import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import { longDate, weekdayName } from '../lib/dates';
import { signal, useSignal } from '../lib/signals';
import { ComexLogo, SiteLogo } from './Brand';
import { ZohoAutoSync, ZohoStatusLine } from './Zoho';
import { Celebrate } from '../phone/Celebrate';
import { useSwipeBack } from '../phone/swipeBack';
import { markDeliveriesSeen, useNewZohoDeliveries } from '../lib/newDeliveries';
import { canEdit, canSee, roleLabel } from '../lib/access';
import { ChangePassword } from './ChangePassword';
import { toast } from './feedback';
import { DatePick } from './DatePick';
import { continueEvening, EveningFlow, stageFor } from './EveningFlow';
import { Icon, PulseDot, Ring, useMinutesToClose } from './fx';
import { CommandPalette } from './CommandPalette';
import { noteVisit, Tour } from './Tour';
import { StartTraining } from './Training';
import { UnfinishedCard } from './Unfinished';

const CHECKIN: Screen[] = ['home', 'submitted'];
const NAV: { screen: Screen; label: string; icon: string; match: Screen[] }[] = [
  { screen: 'home', label: 'Dashboard', icon: 'checkin', match: CHECKIN },
  { screen: 'stocktake', label: 'Stock take', icon: 'box', match: ['stocktake'] },
  { screen: 'reports', label: 'Reports', icon: 'report', match: ['reports'] },
  { screen: 'corrections', label: 'Fix an error', icon: 'fix', match: ['corrections'] },
];
/** Records: past entries per kind, each with its colour (green in, orange out, blue back in, purple transfers). */
const RECORDS: { screen: Screen; label: string; tone: string; entry: Screen }[] = [
  { screen: 'rec-deliveries', label: 'Deliveries', tone: 'deliveries', entry: 'deliveries' },
  { screen: 'rec-issued', label: 'Issued items', tone: 'issued', entry: 'issued' },
  { screen: 'rec-returns', label: 'Returned items', tone: 'returns', entry: 'returns' },
  { screen: 'rec-transfers', label: 'Project transfers', tone: 'transfers', entry: 'transfers' },
];
const readRecOpen = () => { try { return localStorage.getItem('ssms-records') !== 'closed'; } catch { return true; } };
// Screens that show the phone tab bar (not the step-by-step forms).
/** Phone pages with their own top bar (the shell's top bar hides there on phones). */
const PHONE_OWN: Screen[] = ['home', 'records', 'rec-deliveries', 'rec-issued', 'rec-returns', 'rec-transfers', 'dashboard', 'incoming', 'me', 'tofinish', 'stocktake', 'consumption', 'balances', 'low'];
const TABBAR: Screen[] = ['home', 'dashboard', 'corrections', 'submitted', 'reports', 'stocktake', 'rec-deliveries', 'rec-issued', 'rec-returns', 'rec-transfers', 'consumption', 'balances', 'records', 'incoming', 'me', 'tofinish', 'low'];

export function closeLabel(min: number): string {
  if (min <= 0) return 'Register closed at 6:00 pm';
  const h = Math.floor(min / 60), m = min % 60;
  return `Register closes in ${h ? `${h}h ` : ''}${m}m`;
}

function crumbs(screen: Screen): string[] {
  const entry = RECORDS.find((r) => r.entry === screen);
  if (entry) return ['Records', entry.label, 'New entry'];
  if (screen === 'submitted') return ['Dashboard', 'Today’s summary'];
  if (CHECKIN.includes(screen)) return ['Dashboard'];
  if (screen === 'records') return ['Records'];
  const rec = RECORDS.find((r) => r.screen === screen);
  if (rec) return ['Records', rec.label];
  if (screen === 'reports') return ['Records', 'Reports'];
  if (screen === 'consumption') return ['Dashboard', 'Consumption'];
  if (screen === 'balances') return ['Dashboard', 'Balances'];
  if (screen === 'incoming') return ['Dashboard', 'Coming in'];
  return [NAV.find((n) => n.match.includes(screen))?.label ?? ''];
}

const readRail = () => { try { return localStorage.getItem('ssms-rail') === 'mini'; } catch { return false; } };
const readRailW = () => { try { const v = Number(localStorage.getItem('ssms-rail-w')); return v >= 180 && v <= 340 ? v : 212; } catch { return 212; } };

export function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const { user, site, go, signOut, openAdmin, stepState, submission, lowItems, balances, day, projectWeek, syncing, catchUp, endCatchUp, unconfirmed, drafts } = useData();
  const toFinish = unconfirmed.length + drafts.length;
  const newDel = useNewZohoDeliveries();
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => { if (screen === 'rec-deliveries' && newDel) markDeliveriesSeen(); }, [screen, newDel]);
  useEffect(() => { if (user.role === 'store') noteVisit(user, screen); }, [screen, user]);
  const [mini, setMini] = useState(readRail);
  // The menu can be dragged wider or narrower by its right edge; each person's width is remembered.
  const [railW] = useState(readRailW);
  const [recOpen] = useState(readRecOpen);
  const [userMenu, setUserMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [sheet, setSheet] = useState<'more' | null>(null);
  useEffect(() => { setSheet(null); }, [screen]);
  // The gold menu highlight slides to the current page.
  const navRef = useRef<HTMLElement>(null);
  // Phone tab bar: a glass pill that glides to the open tab (like Apple's apps).
  useSwipeBack(screen, go);
  const tabRef = useRef<HTMLElement>(null);
  const [glass, setGlass] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const on = tabRef.current?.querySelector<HTMLElement>('button[aria-current="page"]');
      setGlass(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [screen]);
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
  // The status chip in the top bar: straight to the next evening step (or today's summary once submitted).
  const toNext = () => {
    if (submission) { go('submitted'); return; }
    if (stageFor(day)) continueEvening(day, go);
    else { signal('proc'); if (screen !== 'home') go('home'); } // the three steps, in the pop-up on the dashboard
  };
  const toggleRail = () => { const v = !mini; setMini(v); try { localStorage.setItem('ssms-rail', v ? 'mini' : 'full'); } catch { /* ignore */ } };

  // No first stock take needed to start: every store goes straight into the system.
  // Balances build up from Zoho deliveries and entries; a stock take later sets them to the count.
  const done = STEPS.filter((s) => s.key !== 'deliveries' && stepState(s.key) !== 'todo').length; // the three evening steps
  const urgent = !submission && min < 60;
  const trail = crumbs(screen);
  const dateChip = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`shell ${TABBAR.includes(screen) ? 'hasTab' : ''} ${mini ? 'mini' : ''} ${PHONE_OWN.includes(screen) ? 'pOwn' : ''}`} style={mini ? undefined : ({ '--railW': `${railW}px` } as React.CSSProperties)}>
      <ZohoAutoSync />
      <Celebrate />
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
      <aside className="rail r2" aria-label="Main menu">
        <div className="r2Top">
          <button type="button" className="railBrand comexBrand" title="Comex Builders Ltd · back to the dashboard" aria-label="Comex Builders · back to the dashboard" onClick={() => { if (catchUp) endCatchUp(); go('home'); }}>
            {mini ? <ComexLogo dark hatOnly width={36} /> : <ComexLogo dark width={128} />}
          </button>
          <button className="r2Collapse" onClick={toggleRail} aria-label={mini ? 'Expand the menu' : 'Collapse the menu'} title={mini ? 'Expand the menu' : 'Collapse the menu'}><Icon name="collapse" size={18} /></button>
        </div>
        <nav className="railNav r2Nav" ref={navRef}>
          <span className="railInk" aria-hidden="true" style={ink} />
          {([
            { s: 'home', l: 'Dashboard', i: 'home', on: screen === 'home' || screen === 'welcome' },
            { s: 'stocktake', l: 'Stock take', i: 'clip', on: screen === 'stocktake' },
            { s: 'dashboard', l: 'Items', i: 'box', on: screen === 'dashboard' || screen === 'balances' || screen === 'consumption' },
            { s: 'rec-deliveries', l: 'Deliveries', i: 'truck', on: screen === 'rec-deliveries' || screen === 'deliveries' },
            { s: 'rec-issued', l: 'Issued items', i: 'issue', on: screen === 'rec-issued' || screen === 'issued' },
            { s: 'rec-returns', l: 'Returned items', i: 'undo', on: screen === 'rec-returns' || screen === 'returns' },
            { s: 'rec-transfers', l: 'Project transfers', i: 'swap', on: screen === 'rec-transfers' || screen === 'transfers' },
            { s: 'reports', l: 'Reports', i: 'bars', on: screen === 'reports' },
          ] as { s: Screen; l: string; i: string; on: boolean }[]).filter((n) => canSee(user, n.s)).map((n) => (
            <button key={n.s} className="railLink" title={n.l} aria-current={n.on ? 'page' : undefined} onClick={() => go(n.s)}>
              <Icon name={n.i} size={19} /><span className="rlText">{n.l}</span>
              {n.s === 'home' && lowItems.length > 0 && <span className="r2Badge" title={`${lowItems.length} items running low`}>{lowItems.length}</span>}
              {n.s === 'rec-deliveries' && newDel > 0 && !n.on && <span className="newDot" title={`${newDel} new deliver${newDel === 1 ? 'y' : 'ies'} from Zoho`} aria-label={`${newDel} new from Zoho`} />}
            </button>
          ))}
          <span className="r2Rule" aria-hidden="true" />
{canEdit(user) && canSee(user, 'corrections') && (          <button className="railLink" title="Fix an error" aria-current={screen === 'corrections' ? 'page' : undefined} onClick={() => go('corrections')}>
            <Icon name="warn" size={19} /><span className="rlText">Fix an error</span>
          </button>)}
          <span className="r2Rule" aria-hidden="true" />
          <button className={`railLink r2Today ${urgent ? 'urgent' : ''}`} title="Today’s summary" aria-current={screen === 'submitted' ? 'page' : undefined} onClick={() => go('submitted')}>
            <Icon name="calendar" size={19} /><span className="rlText">Today’s summary</span>
            <span className="r2Prog mono rlText">{submission ? 3 : done}/3</span><span className="r2Chev rlText"><Icon name="chevR" size={15} /></span>
          </button>
        </nav>
        <div className="r2Site rlText">
          <span className="r2Dot" aria-hidden="true" />
          <span><small>Site: <b>{site || '–'}</b></small><small>{projectWeek != null ? <>Project week: <b>{projectWeek}</b></> : closeLabel(min)}</small></span>
        </div>
        <div className="railUserWrap">
          {userMenu && (
            <div className="railUserMenu" role="menu" onMouseLeave={() => setUserMenu(false)}>
              {user.role === 'admin' && <button className="railLink" role="menuitem" onClick={() => { setUserMenu(false); openAdmin(); }}><Icon name="user" /><span className="rlText">Admin</span></button>}
              <ZohoStatusLine compact />
              {(user.role === 'admin' || user.role === 'store') && <StartTraining user={user} label="Training mode" />}
              <button className="railLink" role="menuitem" onClick={() => { setUserMenu(false); setPwOpen(true); }}><Icon name="lock" /><span className="rlText">Change password</span></button>
              <button className="railLink signOut" role="menuitem" onClick={signOut}><Icon name="out" /><span className="rlText">Sign out</span></button>
            </div>
          )}
          <button className="railUser r2User" onClick={() => setUserMenu((v) => !v)} aria-expanded={userMenu} aria-haspopup="menu" title="Your account">
            <span className="avatar">{initials}</span>
            <div className="rlText"><b>{user.name}</b><span>{roleLabel(user)}{api.mode === 'demo' ? ' · demo' : ''}</span></div>
            <span className={`r2Chev rlText ${userMenu ? 'open' : ''}`} aria-hidden="true"><Icon name="chevR" size={15} /></span>
          </button>
        </div>
      </aside>

      {api.mode !== 'training' && <Tour />}
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
          <button type="button" className="tbComex" aria-label="Back to the dashboard" onClick={() => go('home')}><ComexLogo hatOnly width={36} /></button>
          <div className="siteSwitchWrap">
            <button className="siteSwitch" onClick={() => setSiteOpen((v) => !v)} aria-expanded={siteOpen} aria-haspopup="dialog" title={site ? `Site: ${site}` : 'Site'}>
              {site ? <SiteLogo name={site} height={26} /> : <b>Store</b>}
            </button>
            {siteOpen && (
              <div className="sitePop" role="dialog" aria-label="Site" onMouseLeave={() => setSiteOpen(false)}>
                {site && <div className="spLogo"><SiteLogo name={site} height={44} /></div>}
                <div className="spRow"><span>Site</span><b>{site || '–'}</b></div>
                {projectWeek != null && <div className="spRow"><span>Project week</span><b>{projectWeek}</b></div>}
                <div className="spRow"><span>Items in store</span><b>{balances.filter((b) => b.balance > 0).length}</b></div>
                <div className="spRow"><span>You</span><b>{user.name} · {roleLabel(user)}{user.headOffice ? ' · Head office' : ''}</b></div>
                {(user.headOffice || user.role === 'admin') && <SitePicker current={site} />}
                {user.role === 'admin' && <button className="btn ghost sm" onClick={() => { setSiteOpen(false); openAdmin(); }}>Manage sites</button>}
              </div>
            )}
          </div>
          <nav className="crumbs" aria-label="Breadcrumb">
            {trail.map((c, i) => (
              <span key={c} className="crPart"><span aria-hidden="true">/</span>
                {i < trail.length - 1 ? (c === 'Records' ? <span>{c}</span> : <button onClick={() => go(RECORDS.find((r) => r.label === c)?.screen ?? 'home')}>{c}</button>) : <b aria-current="page">{c}</b>}
              </span>
            ))}
          </nav>
          <button className={`tbMini ${submission ? 'ok' : min <= 0 ? 'late' : urgent ? 'soon' : ''}`} onClick={toNext} aria-label={submission ? 'Day submitted' : 'Go to the next step'}>
            {submission ? <><Icon name="check" size={13} />Submitted</> : <><b>{done}/3</b>{min <= 0 ? 'Closed' : 'today'}</>}
          </button>
          <button className="tbSearch" onClick={() => setPalette(true)} aria-label="Search items, pages and actions">
            <Icon name="search" size={16} /><span>Search items, pages, actions</span><kbd>Ctrl K</kbd>
          </button>
          <div className="tbChips">
            {syncing && <span className="tbChip sync" role="status"><span className="syncDot" aria-hidden="true" />Updating…</span>}
            {projectWeek != null && <span className="tbChip" title="Project week">Week {projectWeek}</span>}
            <DatePick trigger="top" label={dateChip} />

          </div>
        </header>
        <div className="screen" key={screen}>{children}</div>
        <EveningFlow screen={screen} />
      </div>

      {TABBAR.includes(screen) && (
        <nav className="tabbar glassBar" aria-label="Main menu" ref={tabRef}>
          <span className={`tbGlass ${glass ? '' : 'off'}`} aria-hidden="true" style={glass ? { transform: `translateX(${glass.x}px)`, width: glass.w } : undefined} />
          <button aria-current={CHECKIN.includes(screen) || ['balances', 'consumption', 'incoming', 'low'].includes(screen) ? 'page' : undefined} onClick={() => { setSheet(null); go('home'); }}>
            <span className="tbIcon"><Icon name="home" size={22} />{lowItems.length > 0 && <PulseDot />}</span>Home
          </button>
          <button aria-current={RECORDS.some((r) => r.screen === screen) || ['reports', 'records', 'dashboard'].includes(screen) ? 'page' : undefined} onClick={() => { setSheet(null); go('records'); }}>
            <span className="tbIcon"><Icon name="list" size={22} />{newDel > 0 && <span className="newDot tb" aria-label={`${newDel} new deliveries from Zoho`} />}</span>Records
          </button>
{canSee(user, 'stocktake') && (          <button aria-current={screen === 'stocktake' ? 'page' : undefined} onClick={() => { setSheet(null); go('stocktake'); }}>
            <span className="tbIcon"><Icon name="clip" size={22} /></span>Stock take
          </button>)}
          <button aria-current={screen === 'me' || screen === 'tofinish' || screen === 'corrections' ? 'page' : undefined} onClick={() => { setSheet(null); go('me'); }}>
            <span className="tbIcon"><span className="tbAv">{initials}</span>{toFinish > 0 && <span className="tbBadge" aria-label={`${toFinish} to finish`}>{toFinish}</span>}</span>Me
          </button>
        </nav>
      )}
      {sheet && (
        <div className="mSheetBack" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <section className="mSheet" role="dialog" aria-modal="true" aria-label="More">
            <span className="mGrab" aria-hidden="true" />
            {(
              <>
                <div className="mWho"><span className="avatar">{initials}</span><div><b>{user.name}</b><small>{roleLabel(user)}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</small></div></div>
                <button className="mToday" onClick={() => { setSheet(null); go('submitted'); }}>
                  <Ring done={submission ? 3 : done} total={3} size={44} />
                  <span><b>{submission ? 'Today’s summary' : done === 3 ? 'Ready to submit' : 'Today’s summary'}</b><small>{submission ? 'All three steps done' : closeLabel(min)}</small></span>
                </button>
                {toFinish > 0 && <div className="mFinish"><span className="mFinishH"><span className="fcDot" aria-hidden="true" />{toFinish} to finish</span><UnfinishedCard /></div>}
                <div className="mGrid">
                  <button onClick={() => { setSheet(null); go('balances'); }}><span className="mIc"><Icon name="box" size={20} /></span>Balances</button>
                  <button onClick={() => { setSheet(null); go('consumption'); }}><span className="mIc"><Icon name="chart" size={20} /></span>Consumption</button>
                  <button onClick={() => { setSheet(null); setPalette(true); }}><span className="mIc"><Icon name="search" size={20} /></span>Search</button>
                  <button onClick={() => { setSheet(null); go('reports'); }}><span className="mIc"><Icon name="report" size={20} /></span>Reports</button>
                </div>
                <div className="mList">
                  {user.role === 'admin' && <button className="railLink" onClick={() => { setSheet(null); openAdmin(); }}><Icon name="user" /><span className="rlText">Admin</span></button>}
                  <ZohoStatusLine compact />
                  {(user.role === 'admin' || user.role === 'store') && <StartTraining user={user} label="Training mode" />}
                  <button className="railLink" onClick={() => { setSheet(null); setPwOpen(true); }}><Icon name="lock" /><span className="rlText">Change password</span></button>
                  <button className="railLink signOut" onClick={signOut}><Icon name="out" /><span className="rlText">Sign out</span></button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

/** Head office (and the admin): switch the site being looked at. Everything reloads for that site. */
function SitePicker({ current }: { current: string }) {
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState('');
  useEffect(() => { api.signupSites().then((x) => setSites(x.map((y) => ({ id: y.id, name: y.name })))).catch(() => undefined); }, []);
  if (sites.length < 2) return null;
  const pick = async (id: string) => {
    setBusy(id);
    try {
      await api.viewSite(id);
      try { Object.keys(localStorage).filter((k) => k.startsWith('ssms-cache:') || k.startsWith('ostock-incoming')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
      location.hash = '/home'; location.reload();
    } catch (e) { setBusy(''); toast((e as Error).message, 'warn'); }
  };
  return (
    <div className="spSites"><span>Look at another site</span>
      {sites.map((x) => <button key={x.id} className={x.name === current ? 'on' : ''} disabled={!!busy || x.name === current} onClick={() => pick(x.id)}>{busy === x.id ? 'Opening…' : x.name}{x.name === current && ' ✓'}</button>)}
    </div>
  );
}
