import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../lib/store';
import { addDays, niceDate, periodRange, weekday } from '../lib/dates';
import { delta, type Balance } from '../lib/types';
import { api } from '../lib/api';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { BackPill } from '../components/BackPill';
import { useIsPhone } from '../components/Ring';
import { PSearchHead } from '../phone/PhoneUI';
import { ItemSheet } from '../components/ItemSheet';
import { PopNav, usePopKeys } from '../components/ListPop';

type F = 'all' | 'low' | 'out';
type S = 'name' | 'level' | 'days';

/** Balances: everything in the store now, how full each item is against its reorder level, and how long it lasts. */
export function Balances() {
  const { balances, isLow, daysLeft, recent, day, site, company, refresh, go } = useData();
  const [f, setF] = useState<F>(() => { try { const v = sessionStorage.getItem('ssms-bal-filter') as F | null; sessionStorage.removeItem('ssms-bal-filter'); return v ?? 'all'; } catch { return 'all'; } });
  const [sort, setSort] = useState<S>('name');
  const [q, setQ] = useState('');
  const phone = useIsPhone();
  const { avgUse } = useData();
  const topUsed = useMemo(() => [...avgUse.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => balances.find((b) => b.item_id === id)?.name).filter(Boolean) as string[], [avgUse, balances]);
  const [sel, setSel] = useState<number | null>(() => { try { const v = sessionStorage.getItem('ssms-bal-item'); sessionStorage.removeItem('ssms-bal-item'); return v ? Number(v) : null; } catch { return null; } });
  const [sheet, setSheet] = useState(false);
  /** The picked item opens as a pop-up (a sheet on phones). Opened from Consumption, it starts open. */
  const [phoneOpen, setPhoneOpen] = useState(() => sel != null);
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (phoneOpen) setSeen(true); }, [phoneOpen]);

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
  const idx = rows.findIndex((r) => r.item_id === sel);
  const close = useCallback(() => setPhoneOpen(false), []);
  const step = useCallback((d: 1 | -1) => { const n = rows[idx + d]; if (n) setSel(n.item_id); }, [rows, idx]);
  usePopKeys(phoneOpen && !sheet, close, step);

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
    <div className={`page consPage balPage ${phone ? 'hasPHead' : ''}`}>
      {phone ? <PSearchHead title="Balances" value={q} onChange={setQ} placeholder={`Which item? ${balances.length} in store`} chips={topUsed} onEnter={() => { if (rows[0]) { setSel(rows[0].item_id); setPhoneOpen(true); } }} /> : <BackPill />}
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
            <label className="recSearch consFind"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && rows[0]) { e.preventDefault(); setSel(rows[0].item_id); setPhoneOpen(true); } }} placeholder={`Search ${balances.length} items`} aria-label="Search items" />{s && rows.length > 0 && <kbd className="lpHint">↵ opens {rows.length === 1 ? 'it' : 'the first'}</kbd>}</label>
            <label className="balSort"><span className="sr">Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as S)}><option value="name">Sort: name</option><option value="level">Sort: lowest first</option><option value="days">Sort: runs out first</option></select>
            </label>
          </div>
          <div className="balRow th"><span>Item</span><span>Level · line = reorder</span><span className="r">In store</span><span className="r balLasts">Lasts about</span><span>Status</span><span className="balGo" /></div>
          <div className="consRows">
            {!rows.length && <div className="pad muted">{s ? `No item matches “${q}”.` : f === 'out' ? 'Nothing is finished.' : f === 'low' ? 'Nothing is running low.' : 'No items yet.'}</div>}
            {rows.map((b, i) => {
              const st = status(b);
              const fill = b.reorder_level ? Math.min(100, (b.balance / (b.reorder_level * 2.2)) * 100) : b.balance > 0 ? 60 : 0;
              return (
                <button key={b.item_id} className={`balRow ${seen && b.item_id === sel ? 'on' : ''}`} style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }} onClick={() => { setSel(b.item_id); setPhoneOpen(true); }}>
                  <span className="crName">{b.name}</span>
                  <span className={`balBar ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`} title={b.reorder_level ? `Reorder at ${fmt(b.reorder_level)}` : 'No reorder level set'}>
                    <i style={{ width: `${Math.max(b.balance > 0 ? 3 : 0, fill)}%` }} />{b.reorder_level ? <em style={{ left: `${100 / 2.2}%` }} /> : null}
                  </span>
                  <b className="mono crQty">{fmt(b.balance)} <small>{b.unit}</small></b>
                  <span className={`r balLasts ${st === 'Finished' ? 'out' : ''}`}>{st === 'Finished' ? 'Finished' : daysLeft(b) == null ? '—' : `${daysLeft(b)} day${daysLeft(b) === 1 ? '' : 's'}`}</span>
                  <span className={`stPill ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`}>{st}</span>
                  <span className="balGo" aria-hidden="true"><Icon name="arrow" size={14} /></span>
                </button>
              );
            })}
          </div>
        </section>

        {phoneOpen && <div className="consScrim" onClick={() => setPhoneOpen(false)} aria-hidden="true" />}
        <aside className={`panel consDetail popA ${phoneOpen ? 'open' : ''}`} role={phoneOpen ? 'dialog' : undefined} aria-modal={phoneOpen || undefined} aria-label="Item detail">
          <button className="cdClose" onClick={() => setPhoneOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
          {phoneOpen && <PopNav idx={idx} total={rows.length} step={step} close={close} />}
          {cur ? <Detail key={cur.item_id} b={cur} st={status(cur)} days={daysLeft(cur)} recent={recent} day={day} onHistory={() => { setSheet(true); }}
            onConsumption={() => { try { sessionStorage.setItem('ssms-cons-item', String(cur.item_id)); } catch { /* ignore */ } go('consumption'); }} />
            : <div className="pad muted">Pick an item.</div>}
        </aside>
      </div>
      {sheet && cur && <ItemSheet b={cur} mode="bal" rangeLabel="" onClose={() => setSheet(false)} onSaveReorder={async (v) => { await api.setReorder(cur.item_id, v); await refresh(); }} />}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { opening: 'Opening count', delivery: 'Delivery', issue: 'Card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };

/** How full the item is: 1 = at its reorder level, >1 = above it. Items without a level sort by balance. */
const level = (b: Balance) => (b.reorder_level ? b.balance / b.reorder_level : 1e6 + b.balance);

function Detail({ b, st, days, recent, day, onHistory, onConsumption }: { b: Balance; st: string; days: number | null; recent: ReturnType<typeof useData>['recent']; day: string; onHistory: () => void; onConsumption: () => void }) {
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
  const moves = recent.flatMap((d) => d.lines.filter((l) => l.item_id === b.item_id && l.kind !== 'correction').map((l) => ({ d, l, x: delta(l.kind, l.qty) })))
    .sort((a, c) => c.d.doc_date.localeCompare(a.d.doc_date) || c.d.created_at.localeCompare(a.d.created_at)).slice(0, 4);
  const color = st === 'Healthy' ? '#1F7A4D' : st === 'Finished' ? '#B42318' : '#B54708';
  return (
    <div className="cdIn">
      <div className="cdHead">
        <div><span className="cdKick">{b.name} · in store now</span>
          <div className="cdBig"><span className="mono">{fmt(b.balance)}</span><span>{b.unit}</span><span className={`stPill ${st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low'}`}>{st}</span></div></div>
      </div>
      <div className="popBody"><div className="popChart">
      <svg className="balChart" viewBox={`-4 -4 ${W + 8} ${H + 8}`} role="img" aria-label="Balance over the last working days">
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} opacity=".1" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" className="sparkLine" pathLength={1} />
        {b.reorder_level != null && <line x1="0" x2={W} y1={y(b.reorder_level)} y2={y(b.reorder_level)} stroke="#B42318" strokeDasharray="4 4" />}
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1]?.v ?? 0)} r="4.5" fill={color} />
      </svg>
      <span className="balChartNote">Last {pts.length} working days{b.reorder_level != null ? ` · dashed line = reorder at ${fmt(b.reorder_level)}` : ''}</span>
      </div>
      <div className="cdStats">
        <div><span>Reorder at</span><b className="mono">{b.reorder_level != null ? fmt(b.reorder_level) : 'Not set'}</b></div>
        <div><span>Lasts about</span><b className="mono">{days == null ? '—' : `${days} day${days === 1 ? '' : 's'}`}</b></div>
        <div><span>In this week</span><b className="mono">{fmt(inW)}</b></div>
        <div><span>Out this week</span><b className="mono">{fmt(outW)}</b></div>
      </div></div>
      {moves.length > 0 && (
        <div className="popMoves"><b>Latest movements</b>
          {moves.map(({ d, l, x }) => (
            <div key={l.id} className={`pmRow ${x > 0 ? 'in' : 'out'} k-${d.kind}`}>
              <span className="pmIc" aria-hidden="true">{d.kind === 'delivery' || d.kind === 'transfer_in' ? '↓' : d.kind === 'return' ? '↺' : '↑'}</span>
              <span className="pmT"><b>{KIND_LABEL[d.kind] ?? 'Entry'}{d.ref_no ? ` ${d.ref_no}` : ''}{d.party ? ` · ${d.party}` : ''}</b><small>{niceDate(d.doc_date)}{l.subphase ? ` · ${l.subphase}` : ''}</small></span>
              <b className="mono pmQ">{x > 0 ? '+' : '−'}{fmt(Math.abs(x))}</b>
            </div>
          ))}
        </div>
      )}
      <div className="popFoot"><small className="lpKeys">← → next item · Esc closes</small>
        <button className="btn ghost sm" onClick={onHistory}><Icon name="list" size={16} />History & reorder level</button>
        <button className="btn dark sm" onClick={onConsumption}>Open in Consumption<Icon name="arrow" size={16} /></button></div>
    </div>
  );
}
