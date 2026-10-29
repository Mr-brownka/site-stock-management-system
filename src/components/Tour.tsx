import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../lib/store';
import type { User } from '../lib/types';
import type { Screen } from '../lib/store';
import { Icon } from './fx';

// The guide for a new store keeper (instead of training days): a short spotlight tour on the real screens,
// then a "Get started" checklist on the dashboard until their first day is submitted.
// Only Stores get it on their own; "Show me around" in the account menu starts it again for anyone.

const key = (u: User, k: string) => `ssms-guide:${k}:${u.email}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

let openTour: () => void = () => undefined;
/** Start the tour again (account menu: "Show me around"). */
export const showMeAround = () => openTour();

/** Pages the new person has opened, for the checklist. */
export function noteVisit(u: User, screen: string) {
  const k = key(u, 'seen'); const seen = new Set((read(k) ?? '').split(',').filter(Boolean));
  if (!seen.has(screen)) { seen.add(screen); write(k, [...seen].join(',')); window.dispatchEvent(new Event('ssms-guide')); }
}

type Step = { sel: string[]; kicker: string; title: string; text: string; screen?: Screen };
const STORE_STEPS: Step[] = [
  { sel: [], kicker: 'Welcome', title: 'SiteStock keeps the store’s balance true', text: 'Deliveries come in from Zoho on their own. You record what goes out and what comes back. Each evening you submit the day, and every balance is up to date. This takes 2 minutes.' },
  { sel: ['.kStrip'], kicker: 'The store at a glance', title: 'Balances, consumption, orders on the way', text: 'What is in the store now, what was used this week, what Zoho says is coming and when the store was last counted. Tap any of them to open it.' },
  { sel: ['.incPanel'], kicker: 'Incoming this week', title: 'Orders on their way from Zoho', text: 'What Zoho says arrives this week, late ones included. When goods are received in Zoho Books they come into the store by themselves. You don’t type deliveries in.' },
  { sel: ['section[aria-label="Needs attention"]'], kicker: 'Needs attention', title: 'Items running low', text: 'Anything at or under its reorder level shows here. Send the list to the site manager on WhatsApp in one tap.' },
  { sel: ['.railLink[title="Issued items"]', '.phA', '.tabbar'], kicker: 'During the day', title: 'What goes out: the issuance register', text: 'One register a day. Add items as they leave the store; adding later continues the same sheet. Returns and transfers sit just below it.' },
  { sel: ['.r2Today', '.phASum', '.phA'], kicker: 'Every evening', title: 'Check in and submit the day', text: 'Open Today’s summary, go through the register, returns and transfers, then submit. Submitting locks the day and makes the balances final.' },
  { sel: ['.railLink[title="Fix an error"]', '.tabbar'], kicker: 'Made a mistake?', title: 'Fix an error', text: 'Open the entry and change it, or delete it. The balances follow. Your checklist on the dashboard shows what to try first.' },
];

/** Procurement and site managers: two moves, from 30 Oct 2026 (earlier sign-ins don't count). */
const viewerSteps = (site: string): Step[] => [
  { screen: 'home', sel: ['.kpi3.green'], kicker: 'Stock balances', title: 'View stock balances here', text: 'What is in the store right now. Tap it to see every item and its balance.' },
  { screen: 'stocktake', sel: ['.stLiveBtn'], kicker: 'Stock take', title: `Import ${site || 'the site'}’s stock take here`, text: 'Press Print live balances to download today’s stock take as Excel or PDF.' },
];
const VIEWER_FROM = '2026-10-30';

function target(s: Step): HTMLElement | null {
  for (const q of s.sel) {
    const el = document.querySelector<HTMLElement>(q);
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return el; }
  }
  return null;
}

export function Tour() {
  const { user, go, site, realToday } = useData();
  const viewer = user.role === 'procurement' || user.role === 'site_manager';
  const STEPS = useMemo(() => (viewer ? viewerSteps(site) : STORE_STEPS), [viewer, site]);
  const doneKey = viewer ? 'tourViewer' : 'tour';
  const [i, setI] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const isStore = user.role === 'store';
  const start = useCallback(() => { go('home'); setTimeout(() => setI(0), 250); }, [go]);
  useEffect(() => { openTour = start; return () => { openTour = () => undefined; }; }, [start]);
  // First time a store keeper opens the app: start on its own.
  useEffect(() => {
    const due = viewer ? realToday >= VIEWER_FROM && !read(key(user, doneKey)) : isStore && !user.trainingWaived && !read(key(user, doneKey));
    if (!due) return;
    const t = setTimeout(() => setI(0), 900);
    return () => clearTimeout(t);
  }, [isStore, viewer, user, realToday, doneKey]);

  const end = (how: 'done' | 'skipped') => { write(key(user, doneKey), how); setI(null); setRect(null); window.dispatchEvent(new Event('ssms-guide')); };
  const step = i == null ? null : STEPS[i];
  const goRef = useRef(go); goRef.current = go;
  useLayoutEffect(() => {
    if (!step) return;
    if (step.screen) goRef.current(step.screen);
    let el: HTMLElement | null = null, tries = 0, alive = true;
    const put = () => { if (el) setRect(el.getBoundingClientRect()); };
    // The page may still be opening: look for the part to light for up to 3 seconds.
    const find = () => {
      if (!alive) return;
      el = target(step);
      if (!el) { setRect(null); if (++tries < 30) setTimeout(find, 100); return; }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      put(); setTimeout(put, 300);
    };
    find();
    window.addEventListener('resize', put); window.addEventListener('scroll', put, true);
    return () => { alive = false; window.removeEventListener('resize', put); window.removeEventListener('scroll', put, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  useEffect(() => {
    if (i == null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') end('skipped'); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft' && i > 0) setI(i - 1); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  if (i == null || !step) return null;
  const last = i === STEPS.length - 1;
  const next = () => (last ? end('done') : setI(i + 1));
  const pad = 8;
  // Desktop pages are zoomed to 95%: fixed positions are measured in the zoomed space.
  const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
  const vw = window.innerWidth / z, vh = window.innerHeight / z;
  const hole = rect ? { left: rect.left / z - pad, top: rect.top / z - pad, width: rect.width / z + pad * 2, height: rect.height / z + pad * 2 } : null;
  // The card sits beside the lit part when there is room, otherwise below or above it; centred when nothing is lit.
  const W = Math.min(380, vw - 32);
  let card: React.CSSProperties;
  if (!hole || vw < 760) card = vw < 760 ? { left: 16, right: 16, bottom: 16 } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 460 };
  else if (hole.left + hole.width + 20 + W < vw) card = { left: hole.left + hole.width + 20, top: Math.max(16, Math.min(hole.top, vh - 280)), width: W };
  else if (hole.top + hole.height + 240 < vh) card = { left: Math.max(16, Math.min(hole.left, vw - W - 16)), top: hole.top + hole.height + 16, width: W };
  else card = { left: Math.max(16, Math.min(hole.left, vw - W - 16)), top: Math.max(16, hole.top - 250), width: W };

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tourT">
      {hole ? <div className="tourHole" style={hole} /> : <div className="tourDim" />}
      <div className={`tourCard ${hole ? '' : 'center'}`} style={card}>
        <span className="tourKick">Step {i + 1} of {STEPS.length} · {step.kicker}</span>
        <b id="tourT">{i === 0 && !viewer ? `Welcome, ${user.name.split(' ')[0]}. ` : ''}{step.title}</b>
        <p>{step.text}</p>
        <span className="tourDots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'done' : ''} />)}</span>
        <span className="tourActs">
          <button className="btn link" onClick={() => end('skipped')}>Skip the tour</button>
          <span className="abGrow" />
          {i > 0 && <button className="btn ghost sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="btn accent sm" onClick={next} autoFocus>{last ? 'Done' : 'Next'}<Icon name="arrow" size={15} /></button>
        </span>
      </div>
    </div>, document.body);
}

/** "Get started": the first five things to do for real, on the dashboard until the first day is submitted. */
export function GetStarted() {
  const { user, go, recent, submission } = useData();
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); window.addEventListener('ssms-guide', f); return () => window.removeEventListener('ssms-guide', f); }, []);
  if (user.role !== 'store' || user.trainingWaived) return null;
  const tour = read(key(user, 'tour'));
  if (!tour || read(key(user, 'list')) === 'off') return null;
  const seen = new Set((read(key(user, 'seen')) ?? '').split(','));
  const mine = (k: string) => recent.some((d) => d.kind === k);
  const tasks: { t: string; p: string; done: boolean; go: () => void }[] = [
    { t: 'Look at what’s in the store', p: 'Items · balances', done: seen.has('balances') || seen.has('dashboard'), go: () => go('balances') },
    { t: 'See a delivery from Zoho', p: 'Deliveries', done: seen.has('rec-deliveries'), go: () => go('rec-deliveries') },
    { t: 'Fill today’s issuance register', p: 'Issued items', done: mine('issue') && seen.has('issued'), go: () => go('issued') },
    { t: 'Look at returned items', p: 'Returned items', done: seen.has('rec-returns') || seen.has('returns'), go: () => go('rec-returns') },
    { t: 'Submit the day', p: 'Today’s summary', done: !!submission || read(key(user, 'submitted')) === '1', go: () => go('submitted') },
  ];
  if (submission) write(key(user, 'submitted'), '1');
  const n = tasks.filter((x) => x.done).length;
  if (n === tasks.length) { write(key(user, 'list'), 'off'); return null; }
  return (
    <section className="gsCard enter" aria-label="Get started">
      <header><b>Get started with SiteStock</b><small className="muted">{n} of {tasks.length} done</small><span className="abGrow" />
        <span className="gsBar" aria-hidden="true"><i style={{ width: `${(n / tasks.length) * 100}%` }} /></span>
        <button className="btn link" onClick={() => { write(key(user, 'list'), 'off'); tick((x) => x + 1); }}>Skip</button></header>
      <div className="gsList">
        {tasks.map((x, k) => (
          <button key={x.t} className={`gsTask ${x.done ? 'done' : ''}`} onClick={x.go} disabled={x.done}>
            <span className="gsN">{x.done ? <Icon name="check" size={13} /> : k + 1}</span><b>{x.t}</b><small>{x.p}{x.done ? '' : ' →'}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
