import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useData } from '../lib/store';
import { SUBPHASES, type Item } from '../lib/types';

export const fmt = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

/** Enter moves to the next box, like Tab. */
export function focusNext(from: HTMLElement) {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).filter((el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null);
  const i = all.indexOf(from);
  const next = all[i + 1];
  next?.focus();
}

export function enterNext(e: KeyboardEvent<HTMLElement>) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    focusNext(e.currentTarget);
  }
}

export function Top({ kicker, title, sub, tone, onBack, right }: { kicker?: string; title: string; sub?: ReactNode; tone?: 'out' | 'in' | 'ok'; onBack?: () => void; right?: ReactNode }) {
  const { siteLabel } = useData();
  return (
    <header className={`top ${tone ?? ''}`}>
      {onBack && <button className="back" onClick={onBack}>← Back</button>}
      <div className="kicker"><span>{kicker ?? siteLabel}</span>{right}</div>
      <h1>{title}</h1>
      {sub && <div className="sub">{sub}</div>}
    </header>
  );
}

export function YesNo({ question, hint, onYes, onNo }: { question: string; hint?: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="card pad stack enter">
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1.1 }}>{question}</h2>
      {hint && <div className="muted small">{hint}</div>}
      <div className="yesno">
        <button className="yes" onClick={onYes} autoFocus>Yes</button>
        <button onClick={onNo}>No</button>
      </div>
    </div>
  );
}

/** Text box that suggests names typed before, and remembers new ones once saved. */
export function Suggest({ label, value, onChange, options, placeholder, autoFocus, glow }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string; autoFocus?: boolean; glow?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = value.trim().toLowerCase();
  const matches = useMemo(() => (q ? options.filter((o) => o.toLowerCase().includes(q) && o.toLowerCase() !== q) : options).slice(0, 6), [q, options]);
  const known = options.some((o) => o.toLowerCase() === q);
  const choose = (v: string) => { onChange(v); setOpen(false); setActive(-1); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); return; }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'Enter') {
      if (open && active >= 0 && matches[active]) choose(matches[active]);
      setOpen(false);
      enterNext(e);
    }
  };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} data-nav className={`input ${glow ? 'next' : ''}`} value={value} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        role="combobox" aria-expanded={open && matches.length > 0} aria-autocomplete="list" />
      {open && matches.length > 0 && (
        <div className="drop" role="listbox">
          {matches.map((m, i) => <button type="button" key={m} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(m)}>{m}</button>)}
        </div>
      )}
      {q && !known && <span className="hint new">New name. It will be remembered for next time.</span>}
    </label>
  );
}

function rank(items: Item[], q: string): Item[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const words = s.split(/\s+/);
  const scored: [number, Item][] = [];
  for (const it of items) {
    const n = it.name.toLowerCase();
    if (!words.every((w) => n.includes(w))) continue;
    const score = n.startsWith(s) ? 0 : n.split(/[\s(/-]+/).some((p) => p.startsWith(words[0])) ? 1 : 2;
    scored.push([score * 1000 + n.length, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
}

/** Search the project item list. The unit comes with the item and cannot be changed. */
export function ItemPicker({ item, onPick, autoFocus, glow }: { item: Item | null; onPick: (it: Item | null) => void; autoFocus?: boolean; glow?: boolean }) {
  const { items, addItem } = useData();
  const id = useId();
  const [q, setQ] = useState(item?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState(false);
  const [unit, setUnit] = useState('Pcs');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setQ(item?.name ?? ''); }, [item]);
  const matches = useMemo(() => (item && q === item.name ? [] : rank(items, q)), [items, q, item]);
  const exact = items.some((i) => i.name.toLowerCase() === q.trim().toLowerCase());
  const units = useMemo(() => [...new Set(items.map((i) => i.unit))].sort(), [items]);
  const choose = (it: Item) => { onPick(it); setQ(it.name); setOpen(false); if (ref.current) focusNext(ref.current); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
      else if (item) focusNext(e.currentTarget);
    }
  };
  const create = async () => {
    setBusy(true);
    try { const it = await addItem(q.trim(), unit); setAdding(false); choose(it); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <label htmlFor={id}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Item</span></label>
      <input id={id} ref={ref} data-nav className={`input ${glow && !item ? 'next' : ''}`} value={q} placeholder="Search the item list" autoComplete="off" autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); if (item) onPick(null); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        role="combobox" aria-expanded={open && (matches.length > 0 || !!q)} aria-autocomplete="list" />
      {open && q.trim() && !item && (
        <div className="drop" role="listbox">
          {matches.map((m, i) => (
            <button type="button" key={m.id} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(m)}>
              <span>{m.name}</span><span className="unit">{m.unit}</span>
            </button>
          ))}
          {!exact && <button type="button" className="add" onMouseDown={(e) => e.preventDefault()} onClick={() => { setAdding(true); setOpen(false); }}>+ Add “{q.trim()}” as a new item</button>}
        </div>
      )}
      {adding && (
        <div className="note stack" style={{ marginTop: 6 }}>
          <b>New item: {q.trim()}</b>
          <label className="field"><span>Unit (fixed once added)</span>
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select>
          </label>
          <div className="row"><button type="button" className="btn accent" disabled={busy} onClick={create}>Add item</button><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

export interface LineDraft { key: number; item: Item | null; qty: string; subphase: string }
let lineKey = 1;
export const newLine = (subphase = ''): LineDraft => ({ key: lineKey++, item: null, qty: '', subphase });

/** Rows of item · quantity · unit (locked) · subphase. */
export function LineEditor({ lines, setLines, withSubphase, stockCheck, subphaseLabel = 'Subphase' }: {
  lines: LineDraft[]; setLines: (l: LineDraft[]) => void; withSubphase: boolean; stockCheck?: boolean; subphaseLabel?: string;
}) {
  const { balanceOf } = useData();
  const patch = (k: number, p: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));
  return (
    <div className="lines">
      {lines.map((l, i) => {
        const q = Number(l.qty);
        const have = l.item ? balanceOf(l.item.id) : 0;
        const over = stockCheck && l.item && q > have;
        return (
          <div className="lineCard" key={l.key}>
            <div className="full between"><span className="label">Item {i + 1}</span>{lines.length > 1 && <button type="button" className="x" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>Remove</button>}</div>
            <div className="full"><ItemPicker item={l.item} onPick={(it) => patch(l.key, { item: it })} autoFocus={i > 0 && !l.item} glow /></div>
            <label className="field" style={{ gridColumn: '1 / 2' }}>
              <span>{stockCheck && l.item ? `In store: ${fmt(have)}` : ' '}</span>
            </label>
            <label className="field"><span>Qty</span>
              <input data-nav className={`input num ${over ? 'bad' : l.item && !l.qty ? 'next' : ''}`} inputMode="decimal" value={l.qty} onKeyDown={enterNext}
                onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} aria-invalid={!!over} />
            </label>
            <label className="field"><span>Unit</span><input className="input locked" value={l.item?.unit ?? ''} readOnly tabIndex={-1} aria-label="Unit (fixed)" /></label>
            {over && <div className="full hint bad">Only {fmt(have)} {l.item!.unit} in store. Check the quantity.</div>}
            {withSubphase && (
              <label className="field full"><span>{subphaseLabel}</span>
                <select data-nav className="select" value={l.subphase} onChange={(e) => patch(l.key, { subphase: e.target.value })} onKeyDown={enterNext}>
                  <option value="">Choose…</option>
                  {SUBPHASES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>
        );
      })}
      <button type="button" data-nav className="btn ghost" onClick={() => setLines([...lines, newLine(lines[lines.length - 1]?.subphase ?? '')])}>+ Add another item</button>
    </div>
  );
}

/** Returns a message for the first problem, or null when the lines can be saved. */
export function checkLines(lines: LineDraft[], opts: { subphase?: boolean; stock?: (id: number) => number }): string | null {
  const used = lines.filter((l) => l.item || l.qty);
  if (!used.length) return 'Add at least one item.';
  for (const l of used) {
    if (!l.item) return 'Pick each item from the list.';
    const q = Number(l.qty);
    if (!l.qty || !(q > 0)) return `Enter the quantity for ${l.item.name}.`;
    if (opts.subphase && !l.subphase) return `Choose the subphase for ${l.item.name}.`;
    if (opts.stock) {
      const total = used.filter((x) => x.item?.id === l.item!.id).reduce((a, x) => a + Number(x.qty), 0);
      if (total > opts.stock(l.item.id)) return `Only ${fmt(opts.stock(l.item.id))} ${l.item.unit} of ${l.item.name} in store.`;
    }
  }
  return null;
}
