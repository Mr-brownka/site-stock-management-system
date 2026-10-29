import { useRef, useState } from 'react';
import type { Item } from '../lib/types';
import { toast } from './feedback';
import { fmt, ItemPicker, lineMiss, newLine, type LineDraft } from './ui';

/**
 * The rows of a paper sheet (issuance register, transfer note): #, item, qty, unit, balance after.
 * Item, quantity, Enter, next row. Two empty rows always wait at the bottom. Picking an item already on the
 * sheet empties that row and jumps to the item's quantity ("Edit here"); Enter there returns to the next empty row.
 */
export function SheetGrid({ lines, setLines, stock, effect, flag, onEmptyEnter }: {
  lines: LineDraft[]; setLines: (f: (ls: LineDraft[]) => LineDraft[]) => void;
  /** What the store has of an item before this sheet. */ stock: (id: number) => number;
  effect: 'out' | 'in'; flag: boolean; onEmptyEnter: () => void;
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

  return (
    <div ref={root} className="mirGrid" onFocusCapture={(e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g; if (k) setGuide(k); }}>
      <div className="mirTh c">#</div><div className="mirTh">Item</div><div className="mirTh r">Qty</div><div className="mirTh">Unit</div><div className="mirTh r">Balance{effect === 'in' ? ' after' : ''}</div>
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
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (editHere === l.key) { setEditHere(null); const n = lines.findIndex((x) => !x.item); goTo(`item${n < 0 ? i + 1 : n}`, true); } else goTo(`item${i + 1}`); } }}
                onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} aria-invalid={over} />
            </label>
            {editHere === l.key && <span className="mirEditHere" role="status">Edit here</span>}
          </div>,
          <div key={`u${l.key}`} className="mirTd mirUnit">{l.item?.unit ?? ''}</div>,
          <div key={`a${l.key}`} className={`mirTd r mono mirAfter ${over ? 'bad' : ''}`}>{l.item && q ? (over ? `Only ${fmt(have)}` : fmt(after)) : l.item ? fmt(have) : ''}</div>,
        ];
      })}
    </div>
  );
}
