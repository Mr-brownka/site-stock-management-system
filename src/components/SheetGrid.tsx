import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import type { Item } from '../lib/types';
import { toast } from './feedback';
import { fmt, ItemPicker, lineMiss, newLine, Suggest, type CardDraft, type LineDraft } from './ui';

/**
 * The rows of a paper sheet (issuance register, transfer note): #, item, qty, unit, balance after.
 * Item, quantity, Enter, next row. Two empty rows always wait at the bottom. Picking an item already on the
 * sheet empties that row and jumps to the item's quantity ("Edit here"); Enter there returns to the next empty row.
 */
export function SheetGrid({ lines, setLines, stock, effect, flag, onEmptyEnter, cards }: {
  lines: LineDraft[]; setLines: (f: (ls: LineDraft[]) => LineDraft[]) => void;
  /** What the store has of an item before this sheet. */ stock: (id: number) => number;
  effect: 'out' | 'in'; flag: boolean; onEmptyEnter: () => void;
  /** Demo: a Gemba column after the quantity, filled from the paper card (gemba, activity, supervisor, issued to). */
  cards?: boolean;
}) {
  const patch = (k: number, q: Partial<LineDraft>) => setLines((ls) => {
    const next = ls.map((l) => (l.key === k ? { ...l, ...q } : l));
    const empty = next.filter((l) => !l.item && !l.qty).length;
    return empty < 2 ? [...next, newLine(), newLine()] : next;
  });
  const firstEmpty = lines.findIndex((l) => !l.item);
  const totalFor = (id: number) => lines.reduce((a, l) => a + (l.item?.id === id ? Number(l.qty) || 0 : 0), 0);

  const [editHere, setEditHere] = useState<number | null>(null);
  const jump = useRef<string | null>(null);
  const pick = (k: number, i: number, it: Item | null) => {
    const j = it ? lines.findIndex((x, n) => n !== i && x.item?.id === it.id) : -1;
    if (j < 0) { patch(k, { item: it }); return; }
    setLines((ls) => ls.map((x) => (x.key === k ? newLine() : x)));
    setEditHere(lines[j].key);
    jump.current = `qty${j}`;
    toast(`${it!.name} is already on row ${j + 1}. Change its quantity there.`);
  };
  const root = useRef<HTMLDivElement>(null);
  const [guide, setGuide] = useState('item0');
  const goTo = (key: string, center = false) => {
    setGuide(key);
    const find = () => root.current?.querySelector<HTMLElement>(`[data-g="${key}"]`);
    const go = (el: HTMLElement | null | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: center });
      if (center) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const el = find();
    if (el) go(el); else requestAnimationFrame(() => go(find()));
  };
  const g = (key: string) => guide === key;
  const [cardRow, setCardRow] = useState<number | null>(null);

  return (
    <div ref={root} className={`mirGrid ${cards ? 'withCard' : ''}`} onFocusCapture={(e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g; if (k) setGuide(k); }}>
      <div className="mirTh c">#</div><div className="mirTh">Item</div><div className="mirTh r">Qty</div><div className="mirTh">Unit</div>{cards && <div className="mirTh">Gemba</div>}<div className="mirTh r">Balance{effect === 'in' ? ' after' : ''}</div>
      {lines.map((l, i) => {
        const q = Number(l.qty) || 0;
        const have = l.item ? stock(l.item.id) : 0;
        const after = l.item ? (effect === 'out' ? have - totalFor(l.item.id) : have + totalFor(l.item.id)) : 0;
        const over = effect === 'out' && !!l.item && after < 0;
        const ms = lineMiss(lines, i, flag);
        return [
          <div key={`n${l.key}`} className="mirTd c mono">{i + 1}</div>,
          <div key={`i${l.key}`} className="mirTd mirItem">
            <ItemPicker bare nav={`item${i}`} label={`Item ${i + 1}`} item={l.item} onPick={(it) => pick(l.key, i, it)} inputClass={`mirIn ${ms.item ? 'miss' : ''}`} placeholder={i === firstEmpty ? 'Item…' : ''} glow={g(`item${i}`)}
              onNext={() => { const k = jump.current; jump.current = null; goTo(k ?? `qty${i}`, !!k); if (k) setTimeout(() => root.current?.querySelector<HTMLInputElement>(`[data-g="${k}"]`)?.select(), 30); }} onEmptyEnter={onEmptyEnter} />
          </div>,
          <div key={`q${l.key}`} className="mirTd">
            <label className="field bare"><span className="sr">Qty for item {i + 1}</span>
              <input data-nav data-g={`qty${i}`} className={`input mirIn num ${over ? 'bad' : g(`qty${i}`) ? 'next' : ''} ${ms.qty ? 'miss' : ''} ${editHere === l.key ? 'editHere' : ''}`} inputMode="decimal" value={l.qty}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (editHere === l.key) { setEditHere(null); const n = lines.findIndex((x) => !x.item); goTo(`item${n < 0 ? i + 1 : n}`, true); } else if (cards && l.item && Number(l.qty) > 0) { goTo(`gemba${i}`); setCardRow(i); } else goTo(`item${i + 1}`); } }}
                onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} aria-invalid={over} />
            </label>
            {editHere === l.key && <span className="mirEditHere" role="status">Edit here</span>}
          </div>,
          <div key={`u${l.key}`} className="mirTd mirUnit">{l.item?.unit ?? ''}</div>,
          ...(cards ? [<div key={`g${l.key}`} className="mirTd mirGemba">
            <button type="button" data-nav data-g={`gemba${i}`} className={`mirGBtn ${l.cards?.length ? 'set' : ''} ${g(`gemba${i}`) ? 'next' : ''}`} disabled={!l.item} onClick={() => setCardRow(i)}>
              {(() => {
                const cs = (l.cards ?? []).filter((c) => c.gemba);
                if (!cs.length) return l.item ? <span className="mirGPh">Choose…</span> : '';
                if (cs.length === 1) return <><b>{cs[0].gemba}</b><small>{[cs[0].activity, cs[0].supervisor].filter(Boolean).join(' · ')}</small></>;
                const placed = cs.reduce((a, c) => a + (Number(c.qty) || 0), 0);
                return <><b>{cs[0].gemba} +{cs.length - 1}</b><small>{cs.length} gembas · {fmt(placed)} of {fmt(q)}</small></>;
              })()}
            </button>
          </div>] : []),
          <div key={`a${l.key}`} className={`mirTd r mono mirAfter ${over ? 'bad' : ''}`}>{l.item && q ? (over ? `Only ${fmt(have)}` : fmt(after)) : l.item ? fmt(have) : ''}</div>,
        ];
      })}
      {cards && cardRow != null && lines[cardRow] && (
        <CardPop line={lines[cardRow]} row={cardRow}
          onClose={() => { setCardRow(null); goTo(`gemba${cardRow}`); }}
          onSave={(cs) => { const i = cardRow; patch(lines[i].key, { cards: cs }); setCardRow(null); goTo(`item${i + 1}`); }} />
      )}
    </div>
  );
}

const FLOORS = ['Preliminaries', 'Ground floor', ...Array.from({ length: 15 }, (_, k) => `${k + 1}${['st', 'nd', 'rd'][k] ?? 'th'} floor`), 'Roof'];
const ACTS = ['Walling', 'Plaster & Screed', 'Steel fixing', 'Formwork', 'Slab casting', 'Fabrication', 'Scaffolding', 'Tiling', 'Waterproofing', 'Plumbing', 'Electrical', 'Repairs'];
const SUPS = ['Hamisi - Supervisor', 'Peter Supervisor', 'Mary - Site admin', 'Macharia - Site manager'];

/** Demo: the paper Material Withdrawal Cards behind one register row. The row's total can be split by gemba:
 * 5 bags 6th floor (Plaster), 2 bags 4th floor (Repairs), … one line each. */
function CardPop({ line, row, onSave, onClose }: { line: LineDraft; row: number; onSave: (c: CardDraft[]) => void; onClose: () => void }) {
  const total = Number(line.qty) || 0;
  const blank = (qty = ''): CardDraft => ({ qty, gemba: '', activity: '', supervisor: '', issued_to: '' });
  const [cs, setCs] = useState<CardDraft[]>(line.cards?.length ? line.cards : [blank(String(total))]);
  const [opts, setOpts] = useState<{ act: string[]; sup: string[]; to: string[] }>({ act: ACTS, sup: SUPS, to: [] });
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const mix = (a: string[], b: string[]) => [...new Set([...b, ...a])];
    Promise.all([api.remembered('activity').catch(() => []), api.remembered('supervisor').catch(() => []), api.remembered('issued_to').catch(() => [])])
      .then(([a, s, t]) => setOpts({ act: mix(ACTS, a), sup: mix(SUPS, s), to: t }));
  }, []);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const set = (k: number, q: Partial<CardDraft>) => setCs((xs) => xs.map((x, n) => (n === k ? { ...x, ...q } : x)));
  const placed = cs.reduce((a, c) => a + (Number(c.qty) || 0), 0);
  const left = total - placed;
  const add = () => {
    setCs((xs) => [...xs, blank(left > 0 ? String(left) : '')]);
    setTimeout(() => box.current?.querySelector<HTMLElement>('.cardRow:last-child select')?.focus(), 30);
  };
  const done = () => {
    if (placed > total + 1e-9) return;
    onSave(cs.map((c) => ({ qty: c.qty.trim(), gemba: c.gemba.trim(), activity: c.activity.trim(), supervisor: c.supervisor.trim(), issued_to: c.issued_to.trim() })).filter((c) => Number(c.qty) > 0 && c.gemba));
  };
  const unit = line.item?.unit ?? '';
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={box} className="cardPop wide" role="dialog" aria-modal="true" aria-labelledby="cardPopT">
        <header><span className="daKicker">Row {row + 1} · {line.item?.name} · {fmt(total)} {unit}</span><h2 id="cardPopT">Where did it go?</h2></header>
        <div className="cardTbl" role="table">
          <div className="cardRow head" role="row"><span>Qty</span><span>Gemba</span><span>Activity</span><span>Supervisor</span><span>Issued to</span><span /></div>
          {cs.map((c, k) => (
            <div className="cardRow" role="row" key={k}>
              <input className="input num" inputMode="decimal" aria-label={`Quantity ${k + 1}`} value={c.qty} onChange={(e) => set(k, { qty: e.target.value.replace(/[^0-9.]/g, '') })} autoFocus={k === 0 && !line.cards?.length} />
              <select className="select input" aria-label={`Gemba ${k + 1}`} value={c.gemba} onChange={(e) => set(k, { gemba: e.target.value })}>
                <option value="">Gemba…</option>{FLOORS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <Suggest bare label={`Activity ${k + 1}`} value={c.activity} onChange={(v) => set(k, { activity: v })} options={opts.act} placeholder="Activity" />
              <Suggest bare label={`Supervisor ${k + 1}`} value={c.supervisor} onChange={(v) => set(k, { supervisor: v })} options={opts.sup} placeholder="Supervisor" />
              <Suggest bare label={`Issued to ${k + 1}`} value={c.issued_to} onChange={(v) => set(k, { issued_to: v })} options={opts.to} placeholder="Issued to" onNext={() => (k === cs.length - 1 && left > 0 ? add() : done())} />
              <button type="button" className="iconBtn cardDel" aria-label={`Remove line ${k + 1}`} disabled={cs.length === 1} onClick={() => setCs((xs) => xs.filter((_, n) => n !== k))}>×</button>
            </div>
          ))}
        </div>
        <div className="cardFoot">
          <button type="button" className="btn ghost sm" onClick={add}>+ Add a line</button>
          <span className={`cardLeft ${placed > total + 1e-9 ? 'over' : left > 1e-9 ? 'open' : 'ok'}`}>
            {placed > total + 1e-9 ? `${fmt(placed - total)} ${unit} more than the ${fmt(total)} issued` : left > 1e-9 ? `${fmt(placed)} of ${fmt(total)} ${unit} placed · ${fmt(left)} left` : `All ${fmt(total)} ${unit} placed`}
          </span>
        </div>
        <footer><button type="button" className="btn ghost" onClick={onClose}>Skip</button><button type="button" className="btn accent" onClick={done} disabled={placed > total + 1e-9}>Done</button></footer>
      </section>
    </div>, document.body);
}
