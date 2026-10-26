import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import { longDate, weekdayName } from '../lib/dates';
import { signal, useSignal } from '../lib/signals';
import { ComexLogo, SiteLogo } from './Brand';
import { ZohoAutoSync, ZohoStatusLine } from './Zoho';
import { DatePick } from './DatePick';
import { continueEvening, EveningFlow, stageFor } from './EveningFlow';
import { Icon, PulseDot, Ring, useMinutesToClose } from './fx';
import { StartTraining } from './Training';
import { CommandPalette } from './CommandPalette';
import { Welcome } from '../screens/Welcome';
import { isTrained } from '../lib/trainingPlan';
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
const TABBAR: Screen[] = ['home', 'dashboard', 'corrections', 'submitted', 'reports', 'stocktake', 'rec-deliveries', 'rec-issued', 'rec-returns', 'rec-transfers', 'consumption', 'balances', 'records'];

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
  return [NAV.find((n) => n.match.includes(screen))?.label ?? ''];
}

const readRail = () => { try { return localStorage.getItem('ssms-rail') === 'mini'; } catch { return false; } };
const readRailW = () => { try { const v = Number(localStorage.getItem('ssms-rail-w')); return v >= 180 && v <= 340 ? v : 212; } catch { return 212; } };

export function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const { user, site, go, signOut, openAdmin, stepState, submission, lowItems, balances, day, projectWeek, syncing, catchUp, endCatchUp, unconfirmed, drafts } = useData();
  const toFinish = unconfirmed.length + drafts.length;
  const [mini, setMini] = useState(readRail);
  // The menu can be dragged wider or narrower by its right edge; each person's width is remembered.
  const [railW, setRailW] = useState(readRailW);
  const dragRail = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = railW;
    document.body.classList.add('railDrag');
    let w = w0;
    const move = (ev: PointerEvent) => { w = Math.max(180, Math.min(340, w0 + ev.clientX - x0)); setRailW(w); };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.body.classList.remove('railDrag'); try { localStorage.setItem('ssms-rail-w', String(w)); } catch { /* ignore */ } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  };
  const [recOpen, setRecOpen] = useState(readRecOpen);
  const [userMenu, setUserMenu] = useState(false);
  const toggleRec = () => { const v = !recOpen; setRecOpen(v); try { localStorage.setItem('ssms-records', v ? 'open' : 'closed'); } catch { /* ignore */ } };
  const [palette, setPalette] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [sheet, setSheet] = useState<'more' | null>(null);
  useEffect(() => { setSheet(null); }, [screen]);
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
  // The status chip in the top bar: straight to the next evening step (or today's summary once submitted).
  const toNext = () => {
    if (submission) { go('submitted'); return; }
    if (stageFor(day)) continueEvening(day, go);
    else { signal('proc'); if (screen !== 'home') go('home'); } // the three steps, in the pop-up on the dashboard
  };
  const toggleRail = () => { const v = !mini; setMini(v); try { localStorage.setItem('ssms-rail', v ? 'mini' : 'full'); } catch { /* ignore */ } };

  // A store with no stock take yet starts on the welcome page.
  // New store members stay on the welcome page until the training days are done and the store has stock
  // (a store with no stock unlocks its first stock take after training).
  const onboarding = api.mode !== 'training' && user.role !== 'admin' && (!isTrained(user) || !balances.length);
  if (onboarding && !(screen === 'stocktake' && isTrained(user))) return <><ZohoAutoSync /><Welcome /></>;
  if (screen === 'welcome' || (!balances.length && (screen === 'home' || screen === 'dashboard'))) return <><ZohoAutoSync /><Welcome /></>;
  const done = STEPS.filter((s) => s.key !== 'deliveries' && stepState(s.key) !== 'todo').length; // the three evening steps
  const urgent = !submission && min < 60;
  const trail = crumbs(screen);
  const dateChip = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`shell ${TABBAR.includes(screen) ? 'hasTab' : ''} ${mini ? 'mini' : ''}`} style={mini ? undefined : ({ '--railW': `${railW}px` } as React.CSSProperties)}>
      <ZohoAutoSync />
      <aside className="rail" aria-label="Main menu">
        {!mini && <span className="railGrip" role="separator" aria-orientation="vertical" aria-label="Drag to make the menu wider or narrower" title="Drag to resize · double-click to reset" onPointerDown={dragRail} onDoubleClick={() => { setRailW(212); try { localStorage.removeItem('ssms-rail-w'); } catch { /* ignore */ } }} />}
        <button type="button" className="railBrand comexBrand" title="Comex Builders Ltd · back to the dashboard" aria-label="Comex Builders · back to the dashboard" onClick={() => { if (catchUp) endCatchUp(); go('home'); }}>
          {mini ? <ComexLogo dark hatOnly width={44} /> : <ComexLogo dark width={172} />}
        </button>
        <nav className="railNav" ref={navRef}>
          <span className="railInk" aria-hidden="true" style={ink} />
          <span className="railSec">Operations</span>
          {NAV.slice(0, 2).map((n) => (
            <button key={n.screen} className="railLink" title={n.label} aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <Icon name={n.icon} /><span className="rlText">{n.label}</span>
              {n.screen === 'home' && lowItems.length > 0 && <span className="railLow"><PulseDot />{lowItems.length}</span>}
            </button>
          ))}
          <button className="railSec railSecBtn" aria-expanded={recOpen} onClick={toggleRec} title={recOpen ? 'Hide records' : 'Show records'}>
            Records<span className={`rgChev ${recOpen ? 'open' : ''}`} aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </button>
          {recOpen && <>
            <button className="railLink railSub items" title="Items" aria-current={screen === 'dashboard' ? 'page' : undefined} onClick={() => go('dashboard')}>
              <span className="rsDot" aria-hidden="true" /><span className="rlText">Items</span>
            </button>
            {RECORDS.map((r) => (
              <button key={r.screen} className={`railLink railSub ${r.tone}`} title={r.label} aria-current={screen === r.screen || screen === r.entry ? 'page' : undefined} onClick={() => go(r.screen)}>
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
          <Ring done={submission ? 3 : done} total={3} size={44} />
          <div className="rlText">
            <b>{submission ? 'Today’s summary' : done === 3 ? 'Ready to submit' : 'Today’s summary'}</b>
            <span>{submission ? 'All three steps done' : closeLabel(min)}</span>
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
          <button type="button" className="tbComex" aria-label="Back to the dashboard" onClick={() => go('home')}><ComexLogo hatOnly width={36} /></button>
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
                {i < trail.length - 1 ? (c === 'Records' ? <span>{c}</span> : <button onClick={() => go(RECORDS.find((r) => r.label === c)?.screen ?? 'home')}>{c}</button>) : <b aria-current="page">{c}</b>}
              </span>
            ))}
          </nav>
          <button className={`tbMini ${submission ? 'ok' : min <= 0 ? 'late' : urgent ? 'soon' : ''}`} onClick={toNext} aria-label={submission ? 'Day submitted' : 'Go to the next step'}>
            {submission ? <><Icon name="check" size={13} />Submitted</> : <><b>{done}/3</b>{min <= 0 ? 'Closed' : closeLabel(min).replace('Register closes in ', '')}</>}
          </button>
          <button className="tbSearch" onClick={() => setPalette(true)} aria-label="Search items, pages and actions">
            <Icon name="search" size={16} /><span>Search items, pages, actions</span><kbd>Ctrl K</kbd>
          </button>
          <div className="tbChips">
            {syncing && <span className="tbChip sync" role="status"><span className="syncDot" aria-hidden="true" />Updating…</span>}
            {projectWeek != null && <span className="tbChip" title="Project week">Week {projectWeek}</span>}
            <DatePick trigger="top" label={dateChip} />
            {!catchUp && <button className={`tbChip status ${submission ? 'ok' : min <= 0 ? 'late' : urgent ? 'soon' : ''}`} onClick={toNext} title={submission ? 'Today’s summary' : 'Go to the next step'}>
              {submission ? <><Icon name="check" size={14} />Submitted</> : <>{min <= 0 ? <PulseDot /> : <Icon name="clock" size={14} />}{closeLabel(min).replace('Register ', '')}</>}
            </button>}
          </div>
        </header>
        <div className="screen" key={screen}>{children}</div>
        <EveningFlow screen={screen} />
      </div>

      {TABBAR.includes(screen) && (
        <nav className="tabbar" aria-label="Main menu">
          <button aria-current={CHECKIN.includes(screen) ? 'page' : undefined} onClick={() => { setSheet(null); go('home'); }}>
            <span className="tbIcon"><Icon name="checkin" size={22} />{lowItems.length > 0 && <PulseDot />}</span>Dashboard
          </button>
          <button aria-current={RECORDS.some((r) => r.screen === screen) || screen === 'reports' || screen === 'records' ? 'page' : undefined} onClick={() => { setSheet(null); go('records'); }}>
            <span className="tbIcon"><Icon name="list" size={22} /></span>Records
          </button>
          <button aria-current={screen === 'stocktake' ? 'page' : undefined} onClick={() => { setSheet(null); go('stocktake'); }}>
            <span className="tbIcon"><Icon name="box" size={22} /></span>Stock take
          </button>
          <button aria-current={screen === 'corrections' ? 'page' : undefined} onClick={() => { setSheet(null); go('corrections'); }}>
            <span className="tbIcon"><Icon name="fix" size={22} /></span>Fix
          </button>
          <button aria-current={screen === 'balances' || screen === 'consumption' || sheet === 'more' ? 'page' : undefined} onClick={() => setSheet(sheet === 'more' ? null : 'more')}>
            <span className="tbIcon"><span className="tbAv">{initials}</span>{toFinish > 0 && <span className="tbBadge" aria-label={`${toFinish} to finish`}>{toFinish}</span>}</span>More
          </button>
        </nav>
      )}
      {sheet && (
        <div className="mSheetBack" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <section className="mSheet" role="dialog" aria-modal="true" aria-label="More">
            <span className="mGrab" aria-hidden="true" />
            {(
              <>
                <div className="mWho"><span className="avatar">{initials}</span><div><b>{user.name}</b><small>{user.role === 'admin' ? 'Admin' : 'Store'}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</small></div></div>
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
                  <StartTraining user={user} label="Training mode" />
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
