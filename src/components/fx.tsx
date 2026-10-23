// Small visual helpers: count-up numbers, pulse dot, progress ring, icons, confetti.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmt } from './ui';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates from the previous value to the new one. */
export function useCountUp(value: number, ms = 700): number {
  const [v, setV] = useState(reduced() ? value : 0);
  const from = useRef(reduced() ? value : 0);
  useEffect(() => {
    if (reduced()) { setV(value); return; }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return v;
}

export function Num({ value, ms, className }: { value: number; ms?: number; className?: string }) {
  const v = useCountUp(value, ms);
  const whole = Number.isInteger(value);
  return <span className={className}>{fmt(whole ? Math.round(v) : Math.round(v * 100) / 100)}</span>;
}

/** Red pulsing dot for low stock. */
export function PulseDot({ tone = 'red', label }: { tone?: 'red' | 'gold' | 'green'; label?: string }) {
  return <span className={`pulseDot ${tone}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function Ring({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const r = 26, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return (
    <svg className="ring" viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={`${done} of ${total} steps done`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={p >= 1 ? '#3FB27A' : 'var(--accent)'} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 32 32)" className="ringArc" />
      <text x="32" y="37" textAnchor="middle" className="ringText">{done}/{total}</text>
    </svg>
  );
}

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICONS: Record<string, ReactNode> = {
  checkin: <><rect x="4" y="3" width="16" height="18" rx="2" {...P} /><path d="M8 8h8M8 12h5" {...P} /><path d="M9 16.5l2 2 4-4" {...P} /></>,
  report: <><path d="M6 3h9l4 4v14H6z" {...P} /><path d="M14 3v5h5M9 13h7M9 17h5" {...P} /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" {...P} /></>,
  fix: <><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z" {...P} /><path d="M14 6l3 3" {...P} /></>,
  box: <><path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" {...P} /><path d="M3 7.5L12 12l9-4.5M12 12v9" {...P} /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" {...P} /><path d="M9 12l2 2 4-4" {...P} /></>,
  out: <><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" {...P} /></>,
  truck: <><path d="M2 6h11v10H2zM13 9h5l3 4v3h-8" {...P} /><circle cx="6" cy="18" r="2" {...P} /><circle cx="17" cy="18" r="2" {...P} /></>,
  card: <><rect x="3" y="4" width="18" height="16" rx="2" {...P} /><path d="M7 9h10M7 13h6" {...P} /></>,
  back: <><path d="M9 14l-5-5 5-5" {...P} /><path d="M4 9h11a5 5 0 010 10h-3" {...P} /></>,
  swap: <><path d="M4 8h14l-4-4M20 16H6l4 4" {...P} /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" {...P} /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" {...P} /></>,
  search: <><circle cx="11" cy="11" r="7" {...P} /><path d="M20 20l-4-4" {...P} /></>,
  clock: <><circle cx="12" cy="12" r="9" {...P} /><path d="M12 7v5l3 2" {...P} /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" {...P} /><path d="M9 4v16" {...P} /></>,
  print: <><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" {...P} /><rect x="7" y="14" width="10" height="7" {...P} /></>,
  download: <><path d="M12 4v11M7 10l5 5 5-5M4 20h16" {...P} /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4" {...P} /></>,
  alert: <><path d="M12 3l10 18H2L12 3z" {...P} /><path d="M12 10v5M12 18h.01" {...P} /></>,
  list: <><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" {...P} /></>,
  sort: <><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" {...P} /></>,
  check: <><path d="M5 12l5 5L20 7" {...P} /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" {...P} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...P} /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" {...P} /></>,
  plus: <><path d="M12 5v14M5 12h14" {...P} /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" {...P} /><path d="M4 7l8 6 8-6" {...P} /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5M5 20h14" {...P} /></>,
  arrowL: <><path d="M19 12H5M11 6l-6 6 6 6" {...P} /></>,
  chevL: <><path d="M15 6l-6 6 6 6" {...P} /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...P} /><path d="M3 10h18M8 3v4M16 3v4" {...P} /></>,
  user: <><circle cx="12" cy="8" r="4" {...P} /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...P} /></>,
};
export function Icon({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="ic">{ICONS[name]}</svg>;
}

/** A one-off burst of gold confetti. */
export function Confetti({ pieces = 36 }: { pieces?: number }) {
  if (reduced()) return null;
  const colors = ['#FCA72D', '#F2F3F1', '#3FB27A', '#FFD27A', '#9AA3A0'];
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: pieces }, (_, i) => {
        const x = (i * 37) % 100, d = 1.6 + ((i * 13) % 10) / 10, delay = ((i * 7) % 10) / 20, rot = (i * 47) % 360;
        return <i key={i} style={{ left: `${x}%`, background: colors[i % colors.length], animationDuration: `${d}s`, animationDelay: `${delay}s`, transform: `rotate(${rot}deg)` }} />;
      })}
    </div>
  );
}

/** "Good morning" / "Good afternoon" / "Good evening" in Nairobi time. */
export function greeting(): string {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Minutes until 6:00 pm Nairobi time (negative once past). */
export function useMinutesToClose(): number {
  const calc = () => {
    const [h, m] = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }).split(':').map(Number);
    return 18 * 60 - (h * 60 + m);
  };
  const [v, setV] = useState(calc);
  useEffect(() => { const t = setInterval(() => setV(calc()), 20000); return () => clearInterval(t); }, []);
  return v;
}
