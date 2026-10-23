import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../lib/store';
import { addDays, niceDate, weekdayName } from '../lib/dates';
import { Icon } from './fx';
import { toast } from './feedback';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const BACK_DAYS = 90; // how far back an entry can be dated

const ym = (d: string) => d.slice(0, 7);
const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + n, 1)); return t.toISOString().slice(0, 7); };
/** The month as rows of weeks, Monday first; null pads the edges. */
function monthGrid(m: string): (string | null)[] {
  const [y, mo] = m.split('-').map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const pad = (first.getUTCDay() + 6) % 7;
  const out: (string | null)[] = Array(pad).fill(null);
  for (let i = 1; i <= days; i++) out.push(`${m}-${String(i).padStart(2, '0')}`);
  while (out.length % 7) out.push(null);
  return out;
}

/** "Choose a date": the small chip on an entry page. Opens a calendar to enter a paper for another day
 *  (a card that came in late, a photo that was unclear). Picking today goes back to normal. */
export function DatePick({ trigger = 'chip', label }: { trigger?: 'chip' | 'top'; label?: string } = {}) {
  const { day, realToday, catchUp, startCatchUp, endCatchUp, recent, pendingDays, submission } = useData();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(ym(day));
  const [dir, setDir] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // The calendar lives on the page body (nothing can cover or clip it), placed under the chip; on phones it is a bottom sheet.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => { const r = wrap.current?.getBoundingClientRect(); if (r) setPos({ top: r.bottom + 10, right: Math.max(10, window.innerWidth - r.right) }); };
    place();
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);
  const floor = addDays(realToday, -BACK_DAYS);

  useEffect(() => { if (open) { setMonth(ym(day)); setHover(null); } }, [open, day]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  // What each day already holds: entries typed, and days still waiting to be submitted.
  const count = useMemo(() => { const m = new Map<string, number>(); recent.forEach((d) => m.set(d.doc_date, (m.get(d.doc_date) ?? 0) + 1)); return m; }, [recent]);
  const missed = useMemo(() => new Set(pendingDays.map((p) => p.day)), [pendingDays]);

  const pick = (d: string) => {
    setOpen(false);
    if (d === day) return;
    if (d === realToday) { endCatchUp(); toast('Back to today'); return; }
    startCatchUp(d);
    toast(`Entering for ${weekdayName(d)} ${niceDate(d).split(' ').slice(1).join(' ')}`);
  };
  const go = (n: number) => { setDir(n); setMonth((m) => shiftMonth(m, n)); };
  const canBack = month > ym(floor), canNext = month < ym(realToday);
  const show = hover ?? day;
  const quick: [string, string][] = [[realToday, 'Today'], [addDays(realToday, -1), 'Yesterday'], [addDays(realToday, -2), weekdayName(addDays(realToday, -2))]];
  const [, mo] = month.split('-').map(Number);

  return (
    <div className="dpWrap" ref={wrap}>
      {trigger === 'top' ? (
        <button type="button" className={`tbChip dpTop ${catchUp ? 'catch' : ''} ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open} title="Change the working date">
          <Icon name="calendar" size={14} />{label ?? niceDate(day)}<span className="dpCaret" aria-hidden="true">▾</span>
        </button>
      ) : (
        <button type="button" className={`entryDay dpChip ${catchUp ? 'catch' : ''} ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}
          title={catchUp ? `Entering for ${niceDate(day)}` : 'Enter this for another day'}>
          <Icon name="calendar" size={14} />
          {catchUp ? niceDate(day) : 'Choose a date'}
          {submission ? <span className="dpLate">day submitted</span> : null}
          <span className="dpCaret" aria-hidden="true">▾</span>
        </button>
      )}
      {open && createPortal(<>
        <div className="dpScrim" aria-hidden="true" />
        <div ref={pop} className="dpPop" role="dialog" aria-label="Choose the date for this entry" style={pos ? { top: pos.top, right: pos.right } : undefined}>
          <header className="dpHead">
            <span className="dpKick">{show === realToday ? 'Today' : show < realToday ? 'Enter it for' : ''}</span>
            <b className="dpBig" key={show}>{weekdayName(show)}</b>
            <span className="dpSub">{niceDate(show).split(' ').slice(1).join(' ')} {show.slice(0, 4)}{count.get(show) ? ` · ${count.get(show)} entr${count.get(show) === 1 ? 'y' : 'ies'} already` : ''}{missed.has(show) ? ' · not submitted' : ''}</span>
          </header>
          <div className="dpQuick">
            {quick.map(([d, l]) => <button type="button" key={d} className={d === day ? 'on' : ''} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onClick={() => pick(d)}>{l}</button>)}
          </div>
          <div className="dpMonth">
            <button type="button" className="dpArrow" disabled={!canBack} onClick={() => go(-1)} aria-label="Previous month"><Icon name="chevL" size={16} /></button>
            <b key={month} className={dir < 0 ? 'fromL' : dir > 0 ? 'fromR' : ''}>{MONTHS[mo - 1]} <span>{month.slice(0, 4)}</span></b>
            <button type="button" className="dpArrow next" disabled={!canNext} onClick={() => go(1)} aria-label="Next month"><Icon name="chevL" size={16} /></button>
          </div>
          <div className="dpGrid" key={month} data-dir={dir}>
            {HEADS.map((h, i) => <span key={`h${i}`} className={`dpH ${i === 6 ? 'sun' : ''}`}>{h}</span>)}
            {monthGrid(month).map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const off = d > realToday || d < floor;
              const n = count.get(d) ?? 0;
              const cls = ['dpDay', d === day && 'sel', d === realToday && 'today', missed.has(d) && 'miss', off && 'off', new Date(d + 'T00:00:00Z').getUTCDay() === 0 && 'sun'].filter(Boolean).join(' ');
              return (
                <button type="button" key={d} className={cls} style={{ ['--i' as string]: i }} disabled={off}
                  onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d)} onClick={() => pick(d)}
                  aria-label={`${niceDate(d)}${n ? `, ${n} entries` : ''}${missed.has(d) ? ', not submitted' : ''}`} aria-pressed={d === day}>
                  <span>{Number(d.slice(8))}</span>
                  {(n > 0 || missed.has(d)) && <i className={missed.has(d) ? 'm' : ''} />}
                </button>
              );
            })}
          </div>
          <footer className="dpFoot">
            <span><i /> has entries</span><span><i className="m" /> not submitted</span>
            {catchUp && <button type="button" className="dpToday" onClick={() => pick(realToday)}>Back to today</button>}
          </footer>
        </div>
      </>, document.body)}
    </div>
  );
}
