import { useEffect, useState, type ReactNode } from 'react';
import { Icon, Num } from '../components/fx';
import { fmt } from '../components/ui';
import { useData, type Screen } from '../lib/store';
import './phone.css';
import { buzz } from '../components/feedback';

// Tapping a card: it sinks a little, a soft gold ripple spreads from the finger, and the phone gives a tiny buzz.
const TAP = '.pCard, .pTileB, .pHubRow, .pRow, .pSetRow, .pItemRow, .pLowCard, .pStrip, .pCheck, .pBtn, .evPYes, .evPNo';
if (typeof window !== 'undefined' && !(window as unknown as { __pRipple?: boolean }).__pRipple) {
  (window as unknown as { __pRipple?: boolean }).__pRipple = true;
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(TAP);
    if (!el || (el as HTMLButtonElement).disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement('i');
    dot.className = 'pRipple';
    const size = Math.max(r.width, r.height) * 2;
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
    buzz(6);
  }, { passive: true });
}

/** Phone pages: a plain top bar (← title · right), nothing floating over the page. */
export function PTop({ title, back, right }: { title: ReactNode; back?: Screen | (() => void) | false; right?: ReactNode }) {
  const { go } = useData();
  const onBack = back === false ? null : typeof back === 'function' ? back : () => go(back ?? 'home');
  return (
    <header className="pTop">
      {onBack && <button className="pBack" onClick={onBack} aria-label="Back"><Icon name="chevL" size={24} /></button>}
      <h1 className="pTitle">{title}</h1>
      {right}
    </header>
  );
}

/** A detail page inside a list page. Opening it adds a step to the phone's history, so the phone's own Back closes it. */
export function useSub(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => (history.state as { sub?: string } | null)?.sub ?? null);
  useEffect(() => {
    const on = () => setId((history.state as { sub?: string } | null)?.sub ?? null);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const open = (v: string | null) => {
    if (v) { history.pushState({ sub: v }, ''); setId(v); window.scrollTo(0, 0); }
    else if ((history.state as { sub?: string } | null)?.sub) history.back();
    else setId(null);
  };
  return [id, open];
}

export function Pill({ tone, children }: { tone: 'ok' | 'amb' | 'red' | 'grey' | 'blue'; children: ReactNode }) {
  return <span className={`pPill ${tone}`}>{children}</span>;
}

export function Chips<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: [K, string][] }) {
  return (
    <div className="pChips" role="tablist">
      {items.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}

export function PSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="pSearch"><Icon name="search" size={19} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button onClick={() => onChange('')} aria-label="Clear"><Icon name="close" size={16} /></button>}</label>
  );
}

/** "Fri 30 Oct" */
export const shortDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const timeOf = (doc: { doc_time?: string | null; created_at: string }) => doc.doc_time?.slice(0, 5) ?? new Date(doc.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

/** Balances and Consumption on the phone: the search box is the dark page top, with the most-used items as one-tap chips.
 *  It glows once, slowly (8 s), as the page opens. */
export function PSearchHead({ title, value, onChange, placeholder, chips, onEnter }: { title: string; value: string; onChange: (v: string) => void; placeholder: string; chips: string[]; onEnter?: () => void }) {
  const { go } = useData();
  return (
    <div className="pSHead">
      <div className="pSHeadTop"><button className="pBack" onClick={() => go('home')} aria-label="Back to the dashboard"><Icon name="chevL" size={24} /></button><h1>{title}</h1></div>
      <label className="pSHeadBox">
        <Icon name="search" size={20} />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />
        {value && <button onClick={() => onChange('')} aria-label="Clear"><Icon name="close" size={16} /></button>}
      </label>
      {chips.length > 0 && <div className="pSHeadChips"><small>Most used</small>{chips.map((c) => <button key={c} className={value === c ? 'on' : ''} onClick={() => onChange(value === c ? '' : c)}>{c}</button>)}</div>}
    </div>
  );
}

/** While loading: grey placeholder rows with a soft shimmer, instead of "Loading…". */
export function Skel({ rows = 5, card = false }: { rows?: number; card?: boolean }) {
  return (
    <div className={`pSkel ${card ? 'card' : ''}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="pSkelRow"><i className="sk av" /><span><i className="sk" style={{ width: `${55 + ((i * 17) % 35)}%` }} /><i className="sk sm" style={{ width: `${30 + ((i * 11) % 25)}%` }} /></span><i className="sk n" /></div>
      ))}
    </div>
  );
}

/** A number that counts up when it first shows, and rolls to the new value (with a green or orange flash) when it changes. */
export function FlipNum({ value }: { value: number }) {
  const [shown, setShown] = useState<{ now: number; was: number | null; key: number }>({ now: value, was: null, key: 0 });
  useEffect(() => {
    setShown((s) => (s.now === value ? s : { now: value, was: s.now, key: s.key + 1 }));
  }, [value]);
  if (shown.was == null) return <Num value={value} />;
  return (
    <span className={`pFlip ${shown.now > shown.was ? 'up' : 'down'}`} key={shown.key}>
      <span className="pFlipOld">{fmt(shown.was)}</span><span className="pFlipNew">{fmt(shown.now)}</span>
    </span>
  );
}
