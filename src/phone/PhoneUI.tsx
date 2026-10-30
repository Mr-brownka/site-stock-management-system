import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../components/fx';
import { useData, type Screen } from '../lib/store';
import './phone.css';

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
