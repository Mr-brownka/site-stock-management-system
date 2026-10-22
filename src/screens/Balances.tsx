import { useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { addDays, niceDate, periodRange, weekday } from '../lib/dates';
import { delta, type Balance } from '../lib/types';
import { api } from '../lib/api';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { BackPill } from '../components/BackPill';
import { ItemSheet } from '../components/ItemSheet';

type F = 'all' | 'low' | 'out';
type S = 'name' | 'level' | 'days';

/** Balances: everything in the store now, how full each item is against its reorder level, and how long it lasts. */
export function Balances() {
  const { balances, isLow, daysLeft, recent, day, site, company, refresh } = useData();
  const [f, setF] = useState<F>(() => { try { const v = sessionStorage.getItem('ssms-bal-filter') as F | null; sessionStorage.removeItem('ssms-bal-filter'); return v ?? 'all'; } catch { return 'all'; } });
  const [sort, setSort] = useState<S>('name');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  /** Phones: the picked item opens as a sheet over the list. */
  const [phoneOpen, setPhoneOpen] = useState(false);

  const status = (b: Balance) => (b.balance <= 0 ? 'Finished' : isLow(b) ? 'Running low' : 'Healthy');
  const counts = { all: balances.length, low: balances.filter((b) => b.balance > 0 && isLow(b)).length, out: balances.filter((b) => b.balance <= 0).length };
  const s = q.trim().toLowerCase();
  const rows = useMemo(() => balances
    .filter((b) => (f === 'all' || (f === 'out' ? b.balance <= 0 : b.balance > 0 && isLow(b))) && (!s || b.name.toLowerCase().includes(s)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
      : sort === 'days' ? (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9) || a.name.localeCompare(b.name)
        : level(a) - level(b) || a.name.localeCompare(b.name)), [balances, f, s, sort, isLow, daysLeft]);
  useEffect(() => { if (!rows.length) setSel(null); else if (sel == null || !rows.some((r) => r.item_id === sel)) setSel(rows[0].item_id); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = balances.find((b) => b.item_id === sel) ?? null;

  const download = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([[`${company || 'Comex Builders'} · ${site}`], ['Balances'], [niceDate(day)], [],
      ['Item', 'Unit', 'In store', 'Reorder at', 'Lasts about (days)', 'Status'],
      ...rows.map((b) => [b.name, b.unit, b.balance, b.reorder_level ?? '', daysLeft(b) ?? '', status(b)])]);
    ws['!cols'] = [38, 8, 10, 11, 16, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Balances');
    XLSX.writeFile(wb, `${site || 'Site'} - Balances - ${day}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
    toast('Excel file downloaded');
  };

  return (
    <div className="page consPage balPage">
      <BackPill />
      <header className="pageHead enter">
        <div className="phText"><h1>Balances</h1><span className="phLead">What is in the store right now, and how long it lasts.</span></div>
        <div className="phActions">
          <span className="seg consSeg" role="group" aria-label="Show">
            <button aria-pressed={f === 'all'} onClick={() => setF('all')}>All {counts.all}</button>
            <button aria-pressed={f === 'low'} onClick={() => setF('low')}>Running low {counts.low}</button>
            <button aria-pressed={f === 'out'} onClick={() => setF('out')}>Finished {counts.out}</button>
          </span>
          <button className="btn ghost sm" onClick={download} disabled={!rows.length}><Icon name="download" size={16} />Excel</button>
        </div>
      </header>

      <div className="consGrid">
        <section className="panel consList" aria-label="Items">
          <div className="consBar">
            <label className="recSearch consFind"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${balances.length} items`} aria-label="Search items" /></label>
            <label className="balSort"><span className="sr">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as S)}><option value="name">Sort: name</option><option value="level">Sort: lowest first</option><option value="days">Sort: runs out first</option></select>
            </label>
          </div>
          <div className="balRow th"><span>Item</span><span>Level · line = reorder</span><span className="r">In store</span><span>Status</span></div>
          <div className="consRows">
            {!rows.length && <div className="pad muted">{s ? `No item matches “${q}”.` : f === 'out' ? 'Nothing is finished.' : f === 'low' ? 'Nothing is running low.' : 'No items yet.'}</div>}
            {rows.map((b, i) => {
              const st = status(b);
              const fill = b.reorder_level ? Math.min(100, (b.balance / (b.reorder_level * 2.2)) * 100) : b.balance > 0 ? 60 : 0;
              return (
                <button key={b.item_id} className={`balRow ${b.item_id === sel ? 'on' : ''}`} style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }} onClick={() => { setSel(b.item_id); setPhoneOpen(true); }}>
                  <span className="crName">{b.name}</span>
                  <span className={`balBar ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`} title={b.reorder_level ? `Reorder at ${fmt(b.reorder_level)}` : 'No reorder level set'}>
                    <i style={{ width: `${Math.max(b.balance > 0 ? 3 : 0, fill)}%` }} />{b.reorder_level ? <em style={{ left: `${100 / 2.2}%` }} /> : null}
                  </span>
                  <b className="mono crQty">{fmt(b.balance)} <small>{b.unit}</small></b>
                  <span className={`stPill ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`}>{st}</span>
                </button>
              );
            })}
          </div>
        </section>

        {phoneOpen && <div className="consScrim" onClick={() => setPhoneOpen(false)} aria-hidden="true" />}
        <aside className={`panel consDetail ${phoneOpen ? 'open' : ''}`} aria-label="Item detail">
          <button className="cdClose" onClick={() => setPhoneOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
          {cur ? <Detail key={cur.item_id} b={cur} st={status(cur)} days={daysLeft(cur)} recent={recent} day={day} onHistory={() => { setPhoneOpen(false); setSheet(true); }} />
            : <div className="pad muted">Pick an item.</div>}
        </aside>
      </div>
      {sheet && cur && <ItemSheet b={cur} mode="bal" rangeLabel="" onClose={() => setSheet(false)} onSaveReorder={async (v) => { await api.setReorder(cur.item_id, v); await refresh(); }} />}
    </div>
  );
}

/** How full the item is: 1 = at its reorder level, >1 = above it. Items without a level sort by balance. */
const level = (b: Balance) => (b.reorder_level ? b.balance / b.reorder_level : 1e6 + b.balance);

function Detail({ b, st, days, recent, day, onHistory }: { b: Balance; st: string; days: number | null; recent: ReturnType<typeof useData>['recent']; day: string; onHistory: () => void }) {
  // Balance at the end of each of the last 7 working days, from today's balance backwards.
  const byDay = new Map<string, number>();
  for (const d of recent) for (const l of d.lines) if (l.item_id === b.item_id) byDay.set(d.doc_date, (byDay.get(d.doc_date) ?? 0) + delta(l.kind, l.qty));
  const pts: { d: string; v: number }[] = [];
  let v = b.balance;
  for (let i = 0; pts.length < 7 && i < 14; i++) { const d = addDays(day, -i); if (weekday(d) === 'Sun') { v -= byDay.get(d) ?? 0; continue; } pts.unshift({ d, v }); v -= byDay.get(d) ?? 0; }
  const wk = periodRange('week', day).from;
  let inW = 0, outW = 0;
  for (const d of recent) if (d.doc_date >= wk && d.doc_date <= day) for (const l of d.lines) if (l.item_id === b.item_id) { const x = delta(l.kind, l.qty); if (x > 0) inW += x; else outW -= x; }
  const vals = pts.map((p) => p.v).concat(b.reorder_level ?? []);
  const mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
  const W = 320, H = 120;
  const x = (i: number) => (i / Math.max(1, pts.length - 1)) * W;
  const y = (n: number) => H - 6 - ((n - mn) / (mx - mn || 1)) * (H - 14);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const color = st === 'Healthy' ? '#1F7A4D' : st === 'Finished' ? '#B42318' : '#B54708';
  return (
    <div className="cdIn">
      <div className="cdHead">
        <div><span className="cdKick">{b.name} · in store now</span>
          <div className="cdBig"><span className="mono">{fmt(b.balance)}</span><span>{b.unit}</span></div></div>
        <span className={`stPill ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`}>{st}</span>
      </div>
      <svg className="balChart" viewBox={`-4 -4 ${W + 8} ${H + 8}`} role="img" aria-label="Balance over the last working days">
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} opacity=".1" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="sparkLine" pathLength={1} />
        {b.reorder_level != null && <line x1="0" x2={W} y1={y(b.reorder_level)} y2={y(b.reorder_level)} stroke="#B42318" strokeDasharray="4 4" />}
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1]?.v ?? 0)} r="4.5" fill={color} />
      </svg>
      <span className="balChartNote">Last {pts.length} working days{b.reorder_level != null ? ` · dashed line = reorder at ${fmt(b.reorder_level)}` : ''}</span>
      <div className="cdStats">
        <div><span>Reorder at</span><b className="mono">{b.reorder_level != null ? fmt(b.reorder_level) : 'Not set'}</b></div>
        <div><span>Lasts about</span><b className="mono">{days == null ? '—' : `${days} day${days === 1 ? '' : 's'}`}</b></div>
        <div><span>In this week</span><b className="mono">{fmt(inW)}</b></div>
        <div><span>Out this week</span><b className="mono">{fmt(outW)}</b></div>
      </div>
      <button className="btn ghost sm" onClick={onHistory}><Icon name="list" size={16} />History & reorder level</button>
    </div>
  );
}
