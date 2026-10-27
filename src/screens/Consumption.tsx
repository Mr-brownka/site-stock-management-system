import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { addDays, eachDay, niceDate, periodRange, weekday } from '../lib/dates';
import { useData } from '../lib/store';
import { consumption, NO_FLOOR } from '../lib/consumption';
import { subphaseRank } from '../lib/structure';
import type { Line } from '../lib/types';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { BackPill } from '../components/BackPill';
import { DateRange } from '../components/DateRange';
import { PopNav, usePopKeys } from '../components/ListPop';

type P = 'day' | 'week' | 'month' | 'pick';
const PERIODS: [P, string][] = [['day', 'Today'], ['week', 'This week'], ['month', 'This month']];
const SHOWN = 3; // floor chips visible beside "All floors"

export function Consumption() {
  const { day, itemById, balanceOf, site, company, go } = useData();
  const [period, setPeriod] = useState<P>(() => { try { return (localStorage.getItem('ssms-cons-period') as P) || 'week'; } catch { return 'week'; } });
  const [from, setFrom] = useState(addDays(day, -13));
  const [to, setTo] = useState(day);
  const range = useMemo(() => {
    if (period === 'pick') return { from, to };
    const r = periodRange(period, day);
    return { from: r.from, to: r.to > day ? day : r.to };
  }, [period, from, to, day]);
  const len = eachDay(range.from, range.to).length;
  const prev = { from: addDays(range.from, -len), to: addDays(range.from, -1) };
  const [lines, setLines] = useState<Line[] | null>(null);
  const [prevLines, setPrevLines] = useState<Line[]>([]);
  const [floor, setFloor] = useState<string | null>(null);
  const [start, setStart] = useState(0); // first floor chip in view
  const [leaving, setLeaving] = useState<string | null>(null); // the chip that folds away on the left
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  /** Opened from Balances: this item's pop-up opens once the period has loaded. */
  const [want, setWant] = useState<number | null>(() => { try { const v = sessionStorage.getItem('ssms-cons-item'); sessionStorage.removeItem('ssms-cons-item'); return v ? Number(v) : null; } catch { return null; } });
  /** The picked item opens as a pop-up (a sheet on phones). */
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (phoneOpen) setSeen(true); }, [phoneOpen]);

  useEffect(() => { try { localStorage.setItem('ssms-cons-period', period); } catch { /* ignore */ } }, [period]);
  useEffect(() => {
    setLines(null);
    api.linesBetween(range.from, range.to).then(setLines).catch(() => setLines([]));
    api.linesBetween(prev.from, prev.to).then(setPrevLines).catch(() => setPrevLines([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const floors = useMemo(() => {
    const all = consumption(lines ?? []);
    const s = new Set<string>();
    for (const u of all.values()) for (const [f, v] of u.byFloor) if (v > 0) s.add(f);
    return [...s].sort((a, b) => (a === NO_FLOOR ? 1 : b === NO_FLOOR ? -1 : subphaseRank(a) - subphaseRank(b) || a.localeCompare(b)));
  }, [lines]);
  useEffect(() => { if (floor && !floors.includes(floor)) setFloor(null); setStart(0); }, [floors]); // eslint-disable-line react-hooks/exhaustive-deps

  const use = useMemo(() => consumption(lines ?? [], floor), [lines, floor]);
  const before = useMemo(() => consumption(prevLines, floor), [prevLines, floor]);
  // Biggest share of the stock first: what's going fastest compared with what the store holds.
  const rows = useMemo(() => [...use.entries()].filter(([, u]) => u.used > 0).map(([id, u]) => {
    const it = itemById.get(id); const bal = Math.max(0, balanceOf(id));
    return { id, u, name: it?.name ?? 'Item', unit: it?.unit ?? '', share: u.used / (u.used + bal || 1) };
  }).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name)), [use, itemById, balanceOf]);
  const s = q.trim().toLowerCase();
  const shown = rows.filter((r) => !s || r.name.toLowerCase().includes(s));
  useEffect(() => { if (!rows.length) setSel(null); else if (sel == null || !rows.some((r) => r.id === sel)) setSel(rows[0].id); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = rows.find((r) => r.id === sel) ?? null;
  const idx = shown.findIndex((r) => r.id === sel);
  const close = useCallback(() => setPhoneOpen(false), []);
  const stepItem = useCallback((d: 1 | -1) => { const n = shown[idx + d]; if (n) setSel(n.id); }, [shown, idx]);
  usePopKeys(phoneOpen, close, stepItem);
  useEffect(() => {
    if (want == null || lines === null) return;
    if (rows.some((r) => r.id === want)) { setSel(want); setPhoneOpen(true); }
    else toast(`${itemById.get(want)?.name ?? 'That item'} wasn’t used ${periodText}`);
    setWant(null);
  }, [want, lines, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = () => { if (floors.length <= SHOWN) return; setLeaving(floors[start % floors.length]); setStart((x) => (x + 1) % floors.length); };
  const visible = floors.length <= SHOWN ? floors : Array.from({ length: SHOWN }, (_, i) => floors[(start + i) % floors.length]);
  const periodText = period === 'day' ? 'today' : period === 'week' ? 'this week' : period === 'month' ? 'this month' : `${niceDate(range.from)} – ${niceDate(range.to)}`;

  const download = async () => {
    const XLSX = await import('xlsx');
    const head = [[`${company || 'Comex Builders'} · ${site}`], [`Consumption${floor ? ` · ${floor}` : ''}`], [`${niceDate(range.from)} – ${niceDate(range.to)}`], []];
    const body = [['Item', 'Unit', 'Issued', 'Returned', 'Used', 'Balance now'], ...rows.map((r) => [r.name, r.unit, r.u.issued, r.u.returned, r.u.used, balanceOf(r.id)])];
    const ws = XLSX.utils.aoa_to_sheet([...head, ...body]);
    ws['!cols'] = [36, 8, 10, 10, 10, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Consumption');
    XLSX.writeFile(wb, `${site || 'Site'} - Consumption - ${range.from} to ${range.to}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
    toast('Excel file downloaded');
  };

  return (
    <div className="page consPage">
      <BackPill />
      <header className="pageHead enter">
        <div className="phText"><h1>Consumption</h1><span className="phLead">What the site used {periodText}: issued minus what came back. Click an item to see its days.</span></div>
        <div className="phActions">
          <span className="seg consSeg" role="group" aria-label="Period">{PERIODS.map(([p, l]) => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{l}</button>)}</span>
          <DateRange allLabel="" value={period === 'pick' ? { from, to } : null} max={day} onChange={(r) => { if (r) { setFrom(r.from); setTo(r.to); setPeriod('pick'); } else setPeriod('week'); }} />
          <button className="btn ghost sm" onClick={download} disabled={!rows.length}><Icon name="download" size={16} />Excel</button>
        </div>
      </header>

      <div className="consGrid">
        <section className="panel consList" aria-label="Items used">
          <div className="consBar">
            <label className="recSearch consFind"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${rows.length} item${rows.length === 1 ? '' : 's'} used`} aria-label="Search items used" onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); setSel(shown[0].id); setPhoneOpen(true); } }} />{s && shown.length > 0 && <kbd className="lpHint">↵ opens {shown.length === 1 ? 'it' : 'the first'}</kbd>}</label>
            <div className="floorNav" role="group" aria-label="Floor">
              <button className={`fChip ${floor === null ? 'on' : ''}`} onClick={() => setFloor(null)}>All floors</button>
              <div className="fTrack">
                {leaving && <span key={`out-${start}`} className="fChip leave" aria-hidden="true" onAnimationEnd={() => setLeaving(null)}>{leaving.replace(/ floor$/i, '')}</span>}
                {visible.map((f, i) => <button key={f} className={`fChip ${floor === f ? 'on' : ''} ${leaving && i === SHOWN - 1 ? 'arrive' : ''}`} onClick={() => setFloor(f)}>{f.replace(/ floor$/i, '')}</button>)}
              </div>
              {floors.length > SHOWN && <button className="fMore" onClick={step} aria-label="More floors" title="More floors">···</button>}
            </div>
          </div>
          <div className="consRows">
            {lines === null && Array.from({ length: 6 }, (_, i) => <div key={i} className="consRow"><i className="skel" style={{ width: 20 }} /><i className="skel" style={{ width: `${40 + i * 7}%` }} /><i className="skel" /><i className="skel" style={{ width: 60 }} /></div>)}
            {lines && !shown.length && <div className="pad muted">{s ? `No item matches “${q}”.` : `Nothing was used ${floor ? `on ${floor} ` : ''}${periodText}.`}</div>}
            {shown.map((r, i) => (
              <button key={r.id} className={`consRow ${seen && r.id === sel ? 'on' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} onClick={() => { setSel(r.id); setPhoneOpen(true); }}>
                <span className="mono crNo">{i + 1}</span>
                <span className="crName">{r.name}</span>
                <span className="crBar" title={`${Math.round(r.share * 100)}% of the stock it had`}><i style={{ width: `${Math.max(4, r.share * 100)}%` }} /></span>
                <b className="mono crQty">{fmt(r.u.used)} <small>{r.unit}</small></b>
              </button>
            ))}
          </div>
          {rows.length > 0 && <div className="consFoot">Bars show how much of its stock each item used{floor ? ` · ${floor}` : ''}.</div>}
        </section>

        {phoneOpen && <div className="consScrim" onClick={() => setPhoneOpen(false)} aria-hidden="true" />}
        <aside className={`panel consDetail popA ${phoneOpen ? 'open' : ''}`} role={phoneOpen ? 'dialog' : undefined} aria-modal={phoneOpen || undefined} aria-label="Item detail">
          <button className="cdClose" onClick={() => setPhoneOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
          {phoneOpen && <PopNav idx={idx} total={shown.length} step={stepItem} close={close} />}
          {!cur ? <div className="pad muted">{lines === null ? 'Loading…' : 'Pick an item to see its days.'}</div> : <ItemDetail key={`${cur.id}-${floor}-${range.from}`} r={cur} before={before.get(cur.id)?.used ?? 0} days={eachDay(range.from, range.to).filter((d) => weekday(d) !== 'Sun' || (cur.u.byDay.get(d) ?? 0) > 0)} periodText={periodText} floor={floor} balance={balanceOf(cur.id)}
            onBalances={() => { try { sessionStorage.setItem('ssms-bal-item', String(cur.id)); } catch { /* ignore */ } go('balances'); }} />}
        </aside>
      </div>
    </div>
  );
}

function ItemDetail({ r, before, days, periodText, floor, balance, onBalances }: { onBalances: () => void; r: { id: number; name: string; unit: string; u: ReturnType<typeof consumption> extends Map<number, infer U> ? U : never }; before: number; days: string[]; periodText: string; floor: string | null; balance: number }) {
  const vals = days.map((d) => Math.max(0, r.u.byDay.get(d) ?? 0));
  const mx = Math.max(1, ...vals);
  const peak = vals.indexOf(Math.max(...vals));
  // Per day = used ÷ the days it was actually used (days with no work don't count).
  const worked = days.filter((d) => (r.u.byDay.get(d) ?? 0) > 0).length || 1;
  const change = before > 0 ? Math.round(((r.u.used - before) / before) * 100) : null;
  const floors = [...r.u.byFloor.entries()].filter(([, v]) => v > 0).sort((a, b) => (a[0] === NO_FLOOR ? 1 : b[0] === NO_FLOOR ? -1 : subphaseRank(a[0]) - subphaseRank(b[0])));
  const fmx = Math.max(1, ...floors.map(([, v]) => v));
  const thin = days.length > 10;
  return (
    <div className="cdIn">
      <div className="cdHead">
        <div><span className="cdKick">{r.name} · {periodText}{floor ? ` · ${floor}` : ''}</span>
          <div className="cdBig"><span className="mono">{fmt(r.u.used)}</span><span>{r.unit} used</span></div></div>
        {change !== null && change !== 0 && <span className={`cdChange ${change > 0 ? 'up' : 'down'}`}>{change > 0 ? '▲' : '▼'} {Math.abs(change)}% vs before</span>}
      </div>
      <div className="popBody"><div className="popChart">
      <div className={`cdBars ${thin ? 'thin' : ''}`}>
        {days.map((d, i) => (
          <div key={d} className="cdCol" title={`${niceDate(d)}: ${fmt(vals[i])} ${r.unit}`}>
            {!thin && <span className="mono cdVal">{vals[i] ? fmt(vals[i]) : ''}</span>}
            <i className={i === peak && vals[i] ? 'peak' : ''} style={{ height: `${(vals[i] / mx) * 100}%`, animationDelay: `${i * 30}ms` }} />
            <span className="cdDay">{thin ? (i % Math.ceil(days.length / 7) === 0 ? d.slice(8) : '') : weekday(d)}</span>
          </div>
        ))}
      </div>
      <small className="balChartNote">~{fmt(r.u.used / worked >= 10 ? Math.round(r.u.used / worked) : Math.round((r.u.used / worked) * 10) / 10)} {r.unit} a day on the {worked} day{worked === 1 ? '' : 's'} it was used</small>
      </div>
      <div className="cdStats">
        <div><span>Issued</span><b className="mono">{fmt(r.u.issued)}</b></div>
        <div><span>Returned</span><b className="mono">{fmt(r.u.returned)}</b></div>
        <div><span>Per day</span><b className="mono">~{fmt(r.u.used / worked >= 10 ? Math.round(r.u.used / worked) : Math.round((r.u.used / worked) * 10) / 10)}</b></div>
        <div><span>In store now</span><b className="mono">{fmt(balance)}</b></div>
      </div></div>
      {floors.length > 0 && !floor && (
        <div className="cdFloors"><b>Where it went</b>
          {floors.map(([f, v]) => <div key={f} className="cdFloor"><span>{f}</span><span className="cdFBar"><i style={{ width: `${(v / fmx) * 100}%` }} /></span><b className="mono">{fmt(v)}</b></div>)}
        </div>
      )}
      <div className="popFoot"><small className="lpKeys">← → next item · Esc closes</small>
        <button className="btn dark sm" onClick={onBalances}>Open in Balances<Icon name="arrow" size={16} /></button></div>
    </div>
  );
}
