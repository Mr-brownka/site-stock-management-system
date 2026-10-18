// Friendly period picker: quick chips for recent days/weeks/months, plus a calendar
// that marks the days when materials were issued.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { addDays, periodRange, type Period } from '../lib/dates';
import { Icon } from './fx';

const D = (d: string) => new Date(d + 'T00:00:00Z');
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => D(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const monthStart = (d: string) => `${d.slice(0, 8)}01`;
const addMonths = (d: string, n: number) => { const x = D(monthStart(d)); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const weekStart = (d: string) => addDays(d, -((D(d).getUTCDay() + 6) % 7));

function chipsFor(period: Period, today: string): { key: string; date: string; top: string; bottom: string }[] {
  if (period === 'day') return Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, -i);
    return { key: d, date: d, top: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmt(d, { weekday: 'short' }), bottom: fmt(d, { day: 'numeric', month: 'short' }) };
  });
  if (period === 'week') return Array.from({ length: 8 }, (_, i) => {
    const s = addDays(weekStart(today), -7 * i), e = addDays(s, 6);
    return { key: s, date: s, top: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} weeks ago`, bottom: `${fmt(s, { day: 'numeric', month: 'short' })} – ${fmt(e, { day: 'numeric', month: 'short' })}` };
  });
  return Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(today, -i);
    return { key: m, date: m, top: i === 0 ? 'This month' : i === 1 ? 'Last month' : fmt(m, { month: 'long' }), bottom: fmt(m, { month: 'short', year: 'numeric' }) };
  });
}

/** The plain-words sentence above the chips. */
export function periodSentence(period: Period, date: string, today: string): string {
  const r = periodRange(period, date);
  if (period === 'day') {
    const when = date === today ? 'today' : date === addDays(today, -1) ? 'yesterday' : `on ${fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}`;
    return `Showing what was used ${when}.`;
  }
  if (period === 'week') {
    const cur = weekStart(date) === weekStart(today);
    return `Showing what was used ${cur ? 'this week so far' : 'in the week'} (${fmt(r.from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${fmt(r.to, { weekday: 'short', day: 'numeric', month: 'short' })}).`;
  }
  const cur = monthStart(date) === monthStart(today);
  return `Showing what was used ${cur ? 'this month so far' : 'in'} ${cur ? `(${fmt(date, { month: 'long', year: 'numeric' })})` : fmt(date, { month: 'long', year: 'numeric' })}.`;
}

export function PeriodPicker({ period, date, today, onPeriod, onDate, activeDays }: {
  period: Period; date: string; today: string; onPeriod: (p: Period) => void; onDate: (d: string) => void; activeDays: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const chips = useMemo(() => chipsFor(period, today), [period, today]);
  const selectedKey = period === 'day' ? date : period === 'week' ? weekStart(date) : monthStart(date);
  const stripRef = useRef<HTMLDivElement>(null);
  // Bring the chosen day into view inside the strip only (never scroll the page).
  useEffect(() => {
    const strip = stripRef.current; const el = strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!strip || !el) return;
    const l = el.offsetLeft - strip.offsetLeft, r = l + el.offsetWidth;
    if (l < strip.scrollLeft) strip.scrollLeft = l - 8; else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 8;
  }, [selectedKey, period]);
  const inChips = chips.some((c) => c.key === selectedKey);

  return (
    <div className="pp">
      <div className="ppTop">
        <div className="seg" role="group" aria-label="Period">
          {([['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']] as [Period, string][]).map(([p, l]) => (
            <button key={p} aria-pressed={period === p} onClick={() => onPeriod(p)}>{l}</button>
          ))}
        </div>
        <button className={`ppCal ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <Icon name="clock" size={18} />{period === 'month' ? 'Pick a month' : period === 'week' ? 'Pick a week' : 'Pick a day'}
        </button>
      </div>
      <div className="ppSentence"><Icon name="search" size={16} />{periodSentence(period, date, today)}</div>
      <div className="ppStrip" ref={stripRef} role="group" aria-label="Quick choices">
        {!inChips && <button className="ppChip" aria-pressed="true"><span>Chosen</span><b>{periodRange(period, date).label}</b></button>}
        {chips.map((c) => (
          <button key={c.key} className="ppChip" aria-pressed={c.key === selectedKey} onClick={() => onDate(c.date)}>
            <span>{c.top}</span><b>{c.bottom}</b>
            {period === 'day' && activeDays.has(c.date) && <i className="ppDot" aria-label="Materials issued" />}
          </button>
        ))}
      </div>
      {open && <Calendar period={period} date={date} today={today} onPick={(d) => { onDate(d); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

function Calendar({ period, date, today, onPick, onClose }: { period: Period; date: string; today: string; onPick: (d: string) => void; onClose: () => void }) {
  const [view, setView] = useState(monthStart(date));
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const out = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.ppCal')) onClose(); };
    document.addEventListener('keydown', k); document.addEventListener('mousedown', out);
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('mousedown', out); };
  }, [onClose]);
  // Mark the days in this month when materials were issued.
  useEffect(() => {
    if (period === 'month') return;
    const to = addDays(addMonths(view, 1), -1);
    let live = true;
    api.linesBetween(view, to < today ? to : today).then((ls) => { if (live) setBusy(new Set(ls.filter((l) => l.kind === 'issue').map((l) => l.move_date))); }).catch(() => {});
    return () => { live = false; };
  }, [view, period, today]);

  if (period === 'month') {
    const year = view.slice(0, 4);
    return (
      <div className="cal" ref={ref} role="dialog" aria-label="Pick a month">
        <div className="calHead">
          <button className="iconBtn" onClick={() => setView(`${Number(year) - 1}-01-01`)} aria-label="Previous year">‹</button>
          <b>{year}</b>
          <button className="iconBtn" disabled={`${Number(year) + 1}-01-01` > today} onClick={() => setView(`${Number(year) + 1}-01-01`)} aria-label="Next year">›</button>
        </div>
        <div className="calMonths">
          {Array.from({ length: 12 }, (_, m) => {
            const d = `${year}-${String(m + 1).padStart(2, '0')}-01`;
            return <button key={d} disabled={d > today} aria-pressed={monthStart(date) === d} className={monthStart(today) === d ? 'now' : ''} onClick={() => onPick(d)}>{fmt(d, { month: 'short' })}</button>;
          })}
        </div>
      </div>
    );
  }

  const first = view, lead = (D(first).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const selWeek = weekStart(date), hovWeek = hover ? weekStart(hover) : null;
  return (
    <div className="cal" ref={ref} role="dialog" aria-label={period === 'week' ? 'Pick a week' : 'Pick a day'}>
      <div className="calHead">
        <button className="iconBtn" onClick={() => setView(addMonths(view, -1))} aria-label="Previous month">‹</button>
        <b>{fmt(view, { month: 'long', year: 'numeric' })}</b>
        <button className="iconBtn" disabled={addMonths(view, 1) > today} onClick={() => setView(addMonths(view, 1))} aria-label="Next month">›</button>
      </div>
      <div className={`calGrid ${period === 'week' ? 'weeks' : ''}`} onMouseLeave={() => setHover(null)}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => <span key={i} className="calWd">{w}</span>)}
        {days.map((d) => {
          const outside = d.slice(0, 7) !== view.slice(0, 7), future = d > today;
          const sel = period === 'day' ? d === date : weekStart(d) === selWeek;
          const hov = period === 'week' && hovWeek === weekStart(d);
          return (
            <button key={d} disabled={future} onMouseEnter={() => setHover(d)} onClick={() => onPick(d)}
              className={[outside && 'out', d === today && 'now', sel && 'sel', hov && 'hov', busy.has(d) && 'busy'].filter(Boolean).join(' ')}
              aria-pressed={sel} aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }) + (busy.has(d) ? ', materials issued' : '')}>
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="calKey small muted"><i className="ppDot" /> Materials were issued · <span className="calNowKey" /> Today</div>
    </div>
  );
}
