import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays, eachDay, niceDate, periodRange, weekdayName } from '../lib/dates';
import { HEADS, MONTHS, monthGrid, shiftMonth, ym } from './DatePick';
import { Icon } from './fx';

export type Range = { from: string; to: string } | null;
const short = (d: string) => niceDate(d).split(' ').slice(1).join(' ');
export const rangeLabel = (r: NonNullable<Range>) => (r.from === r.to ? niceDate(r.from) : `${short(r.from)} – ${short(r.to)}`);

/** "Choose a date": the same small chip and dark calendar everywhere a list is filtered by date.
 *  One click picks a day; a second click picks the end of a range. × clears it. */
export function DateRange({ value, onChange, max, marks, single }: {
  value: Range; onChange: (r: Range) => void; max: string;
  /** Days that have something (a dot under the day). */ marks?: Set<string>;
  /** One day only (no range). */ single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string | null>(null); // first click of a range, waiting for the second
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(ym(value?.to ?? max));
  const [dir, setDir] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { if (open) { setMonth(ym(value?.to ?? max)); setStart(null); setHover(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => { const r = wrap.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 10, left: Math.max(10, Math.min(r.left, window.innerWidth - 342)) }); };
    place(); window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const set = (r: Range) => { onChange(r); setOpen(false); setStart(null); };
  const click = (d: string) => {
    if (single) return set({ from: d, to: d });
    if (!start) { setStart(d); onChange({ from: d, to: d }); return; } // the day shows at once; a second click makes it a range
    set(d < start ? { from: d, to: start } : { from: start, to: d });
  };
  // While choosing the end, the range follows the pointer.
  const live: Range = start ? (hover ? (hover < start ? { from: hover, to: start } : { from: start, to: hover }) : { from: start, to: start }) : value;
  const show = live ?? (hover ? { from: hover, to: hover } : null);
  const days = show ? eachDay(show.from, show.to).length : 0;
  const n = show && marks ? eachDay(show.from, show.to).filter((d) => marks.has(d)).length : 0;
  const quick: [string, NonNullable<Range>][] = single
    ? [['Today', { from: max, to: max }], ['Yesterday', { from: addDays(max, -1), to: addDays(max, -1) }]]
    : [['Today', { from: max, to: max }], ['Yesterday', { from: addDays(max, -1), to: addDays(max, -1) }],
       ['This week', { from: periodRange('week', max).from, to: max }], ['This month', { from: periodRange('month', max).from, to: max }]];
  const [, mo] = month.split('-').map(Number);
  const go = (k: number) => { setDir(k); setMonth((m) => shiftMonth(m, k)); };

  return (
    <div className="dpWrap" ref={wrap}>
      <button type="button" className={`entryDay dpChip drChip ${value ? 'set' : ''} ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="calendar" size={14} />{value ? rangeLabel(value) : 'Choose a date'}
        {value && !single
          ? <span className="drClear" role="button" tabIndex={0} aria-label="Clear the date" onClick={(e) => { e.stopPropagation(); set(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); set(null); } }}>×</span>
          : <span className="dpCaret" aria-hidden="true">▾</span>}
      </button>
      {open && createPortal(<>
        <div className="dpScrim" aria-hidden="true" onClick={() => setOpen(false)} />
        <div ref={pop} className="dpPop drPop" role="dialog" aria-label="Choose a date" style={pos ? { top: pos.top, left: pos.left, right: 'auto' } : undefined}>
          <header className="dpHead">
            <span className="dpKick">{start ? 'Now pick the last day' : single ? 'Choose the day' : 'Pick a day, or two for a range'}</span>
            <b className="dpBig" key={show ? show.from + show.to : 'none'}>{show ? (show.from === show.to ? weekdayName(show.from) : `${short(show.from)} – ${short(show.to)}`) : 'All time'}</b>
            <span className="dpSub">{show ? `${show.from === show.to ? `${short(show.from)} ${show.from.slice(0, 4)}` : `${days} days`}${marks ? ` · ${n ? `${n} with entries` : 'no entries'}` : ''}` : 'Every entry, newest first'}</span>
          </header>
          <div className="dpQuick wrap">
            {quick.map(([l, r]) => <button type="button" key={l} className={value && value.from === r.from && value.to === r.to ? 'on' : ''} onMouseEnter={() => setHover(null)} onClick={() => set(r)}>{l}</button>)}
            {!single && <button type="button" className={!value ? 'on' : ''} onClick={() => set(null)}>All time</button>}
          </div>
          <div className="dpMonth">
            <button type="button" className="dpArrow" onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevL" size={16} /></button>
            <b key={month} className={dir < 0 ? 'fromL' : dir > 0 ? 'fromR' : ''}>{MONTHS[mo - 1]} <span>{month.slice(0, 4)}</span></b>
            <button type="button" className="dpArrow next" disabled={month >= ym(max)} onClick={() => go(1)} aria-label="Next month"><Icon name="chevL" size={16} /></button>
          </div>
          <div className="dpGrid" key={month}>
            {HEADS.map((h, i) => <span key={`h${i}`} className={`dpH ${i === 6 ? 'sun' : ''}`}>{h}</span>)}
            {monthGrid(month).map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const off = d > max;
              const inR = !!live && d >= live.from && d <= live.to;
              const edge = !!live && (d === live.from || d === live.to);
              const cls = ['dpDay', edge && 'sel', inR && !edge && 'inRange', d === max && 'today', off && 'off', new Date(d + 'T00:00:00Z').getUTCDay() === 0 && 'sun'].filter(Boolean).join(' ');
              return (
                <button type="button" key={d} className={cls} style={{ ['--i' as string]: i }} disabled={off}
                  onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onClick={() => click(d)} aria-label={niceDate(d)} aria-pressed={inR}>
                  <span>{Number(d.slice(8))}</span>{marks?.has(d) && <i />}
                </button>
              );
            })}
          </div>
          {marks && <footer className="dpFoot"><span><i /> has entries</span></footer>}
        </div>
      </>, document.body)}
    </div>
  );
}
