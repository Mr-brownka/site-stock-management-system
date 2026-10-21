import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { weekStart } from '../lib/projectWeek';
import { signal } from '../lib/signals';
import { useData, type Screen } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { checkZohoNow, useZohoDeliveries, ZohoTag } from '../components/Zoho';

export type RecKey = 'deliveries' | 'issued' | 'returns' | 'transfers';
type Row = { doc: Doc; ref: string; paper: string; who: string; where: string };

/** One list per kind of entry. Same columns everywhere: system ref · date · paper number · who · where. */
const CFG: Record<RecKey, { title: string; tag: string; prefix: string; kinds: Doc['kind'][]; paper: string; who: string; where: string; newLabel: string; icon: string }> = {
  deliveries: { title: 'Deliveries', tag: 'Stock in', prefix: 'DLV', kinds: ['delivery'], paper: 'Delivery note', who: 'Vendor name', where: 'Sub-phase', newLabel: 'New delivery', icon: 'M12 4v12M6 10l6 6 6-6M5 20h14' },
  issued: { title: 'Issued items', tag: 'Stock out', prefix: 'ISS', kinds: ['issue'], paper: 'Card no.', who: 'Activity · issued to', where: 'Gemba', newLabel: 'New card', icon: 'M12 20V8M6 14l6-6 6 6M5 4h14' },
  returns: { title: 'Returned items', tag: 'Back in', prefix: 'RET', kinds: ['return'], paper: 'Card no.', who: 'Returned by', where: 'Gemba', newLabel: 'New return', icon: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  transfers: { title: 'Project transfers', tag: 'In / out', prefix: 'TRF', kinds: ['transfer_in', 'transfer_out'], paper: 'Transfer note', who: 'From / to project', where: 'Direction', newLabel: 'New transfer', icon: 'M4 8h14l-4-4M20 16H6l4 4' },
};
export const REC_SCREENS: { screen: Screen; key: RecKey; label: string }[] = [
  { screen: 'rec-deliveries', key: 'deliveries', label: 'Deliveries' },
  { screen: 'rec-issued', key: 'issued', label: 'Issued items' },
  { screen: 'rec-returns', key: 'returns', label: 'Returned items' },
  { screen: 'rec-transfers', key: 'transfers', label: 'Project transfers' },
];
const STEP_SCREEN: Record<RecKey, Screen> = { deliveries: 'deliveries', issued: 'issued', returns: 'returns', transfers: 'transfers' };

type Period = 'today' | 'week' | '30' | 'month' | 'all' | 'pick';
const PERIODS: [Period, string][] = [['today', 'Today'], ['week', 'This week'], ['30', 'Last 30 days'], ['month', 'This month'], ['all', 'All time'], ['pick', 'Pick dates']];

const Svg = ({ d, size = 20 }: { d: string; size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export function Records({ recKey: key }: { recKey: RecKey }) {
  const { day, itemById, go, site, company } = useData();
  const C = CFG[key];
  const [all, setAll] = useState<Doc[] | null>(null);
  const [period, setPeriod] = useState<Period>('30');
  const [from, setFrom] = useState(addDays(day, -29));
  const [to, setTo] = useState(day);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const zohoOnly = useZohoDeliveries() && key === 'deliveries';

  useEffect(() => { setOpenId(null); setQ(''); }, [key]);
  useEffect(() => { api.documents('2000-01-01', day).then(setAll).catch(() => setAll([])); }, [day]);

  // System ref: Bohari numbers each kind of entry in the order it was saved, per project.
  const rows = useMemo<Row[]>(() => {
    if (!all) return [];
    const mine = all.filter((d) => C.kinds.includes(d.kind)).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const cards = new Map(all.filter((d) => d.kind === 'issue' && d.ref_no).map((d) => [d.ref_no!.trim(), d]));
    return mine.map((d, i) => {
      const subs = [...new Set(d.lines.map((l) => l.subphase).filter(Boolean))] as string[];
      const card = key === 'returns' ? cards.get((d.ref_no ?? '').trim()) : undefined;
      const who = key === 'deliveries' ? d.party ?? '' : key === 'issued' ? [d.activity, d.party].filter(Boolean).join(' · ')
        : key === 'returns' ? (d.ref_no === 'No card' ? 'Without a card' : card?.party ?? '') : `${d.kind === 'transfer_out' ? 'To' : 'From'} ${d.party ?? '…'}`;
      const where = key === 'transfers' ? (d.kind === 'transfer_out' ? '↗ Out' : '↙ In') : key === 'issued' ? d.gemba ?? subs.join(', ') : subs.join(', ') || card?.gemba || '';
      return { doc: d, ref: `${C.prefix}-${String(d.sys_no ?? i + 1).padStart(4, '0')}`, paper: d.ref_no ?? '', who, where };
    }).reverse();
  }, [all, C, key]);

  const range = useMemo(() => {
    if (period === 'today') return [day, day];
    if (period === 'week') return [weekStart(day), day];
    if (period === '30') return [addDays(day, -29), day];
    if (period === 'month') return [day.slice(0, 8) + '01', day];
    if (period === 'all') return ['2000-01-01', day];
    return [from, to];
  }, [period, day, from, to]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => r.doc.doc_date >= range[0] && r.doc.doc_date <= range[1] && (!s || [r.ref, r.paper, r.who, r.where, ...r.doc.lines.map((l) => itemById.get(l.item_id)?.name ?? '')].some((x) => x.toLowerCase().includes(s))));
  }, [rows, range, q, itemById]);
  const open = rows.find((r) => r.doc.id === openId) ?? null;
  // Deliveries show where each came from once any came from Zoho.
  const src = key === 'deliveries' && rows.some((r) => r.doc.zoho_grn);
  const fromZoho = shown.filter((r) => r.doc.zoho_grn).length;
  const periodLabel = PERIODS.find(([p]) => p === period)![1];

  const addNew = () => { signal('step-form', key as StepKey); go(STEP_SCREEN[key]); };
  const download = async () => {
    setMenu(false);
    const XLSX = await import('xlsx');
    const head = [[`${company || 'Comex Builders'} · ${site}`], [C.title], [period === 'all' ? 'All time' : `${niceDate(range[0])} – ${niceDate(range[1])}`], []];
    const body = [['System ref', 'Date', C.paper, C.who, C.where, 'Item', 'Qty', 'Unit', 'Sub-phase'],
      ...shown.flatMap((r) => r.doc.lines.map((l) => { const it = itemById.get(l.item_id); return [r.ref, r.doc.doc_date, r.paper, r.who, r.where, it?.name ?? '', l.qty, it?.unit ?? '', l.subphase ?? '']; }))];
    const ws = XLSX.utils.aoa_to_sheet([...head, ...body]);
    ws['!cols'] = [10, 12, 16, 28, 18, 32, 8, 8, 16].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, C.title.slice(0, 31));
    XLSX.writeFile(wb, `${site || 'Site'} - ${C.title} - ${range[0]} to ${range[1]}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
    toast('Excel file downloaded');
  };

  return (
    <div className={`recPage ${key}`}>
      <header className="recHead">
        <span className="recIco"><Svg d={C.icon} /></span>
        <h1>{C.title}</h1>
        <label className="recPeriod">
          <span className="sr">Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>{PERIODS.map(([p, l]) => <option key={p} value={p}>{l}</option>)}</select>
        </label>
        {period === 'pick' && <span className="recDates"><input type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" /> – <input type="date" className="input" value={to} min={from} max={day} onChange={(e) => setTo(e.target.value)} aria-label="To" /></span>}
        <span className="abGrow" />
        <label className="recSearch"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${C.title.toLowerCase()}`} aria-label={`Search ${C.title}`} /></label>
        {zohoOnly
          ? <button className="recNew" onClick={checkZohoNow} title="Deliveries are received in Zoho and come in by themselves"><span><Icon name="download" size={16} /></span>Check Zoho now</button>
          : <button className="recNew" onClick={addNew}><span><Icon name="plus" size={16} /></span>New</button>}
        <div className="recMore">
          <button className="recDots" onClick={() => setMenu((v) => !v)} aria-label="More" aria-expanded={menu}>···</button>
          {menu && <div className="recMenu" onMouseLeave={() => setMenu(false)}><button onClick={download}><Icon name="download" size={16} />Download as Excel</button></div>}
        </div>
      </header>

      {all === null ? <div className="recEmpty">Loading…</div> : !open ? (
        <section className="recTable" aria-label={C.title}>
          <div className={`recRow recTh ${src ? 'src' : ''}`}><span>System ref</span><span>Date</span><span>{C.paper}</span><span>{C.who}</span><span>{C.where}</span>{src && <span>Source</span>}</div>
          {!shown.length && <div className="recEmpty">No {C.title.toLowerCase()} {period === 'all' ? 'yet' : `in ${periodLabel.toLowerCase()}`}{q ? ' matching your search' : ''}.</div>}
          {shown.map((r) => (
            <button key={r.doc.id} className={`recRow ${src ? 'src' : ''}`} onClick={() => setOpenId(r.doc.id)}>
              <b className="recRef">{r.ref}</b>
              <span>{niceDate(r.doc.doc_date)}</span>
              <span className="mono">{r.paper || '—'}</span>
              <span className="recWho">{r.who || '—'}</span>
              <span className="recWhere">{r.where || '—'}{!!r.doc.to_confirm?.length && <span className="fcTag confirm">To confirm</span>}</span>
              {src && (r.doc.zoho_grn ? <ZohoTag grn={r.doc.zoho_grn} /> : <span className="small muted">Typed in Bohari</span>)}
            </button>
          ))}
          {shown.length > 0 && <div className="recFoot">{shown.length} {shown.length === 1 ? 'entry' : 'entries'} · {periodLabel.toLowerCase()}{src && fromZoho ? ` · ${fromZoho} from Zoho` : ''}{src && <button className="btn link inline" onClick={checkZohoNow}>Check Zoho now</button>}</div>}
        </section>
      ) : (
        <div className="recSplit">
          <aside className="recSide" aria-label={C.title}>
            {shown.map((r) => (
              <button key={r.doc.id} className={`recMini ${r.doc.id === open.doc.id ? 'on' : ''}`} onClick={() => setOpenId(r.doc.id)}>
                <span><b>{r.who || r.paper || r.ref}</b><small>{niceDate(r.doc.doc_date).split(' ').slice(1).join(' ')}</small></span>
                <span><span className="recRef">{r.ref}</span><small className="mono">{r.paper}</small></span>
              </button>
            ))}
          </aside>
          <Detail row={open} cfg={C} onClose={() => setOpenId(null)} onFix={() => go('corrections')} />
        </div>
      )}
    </div>
  );
}

function Detail({ row, cfg, onClose, onFix }: { row: Row; cfg: (typeof CFG)[RecKey]; onClose: () => void; onFix: () => void }) {
  const { itemById } = useData();
  const d = row.doc;
  const saved = new Date(d.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
  const kv: [string, string | null | undefined][] = [
    ['Date', niceDate(d.doc_date)],
    [cfg.paper, d.ref_no],
    ...(d.kind === 'delivery' ? [['Vendor', d.party], ['Vehicle / driver', d.vehicle]] as [string, string | null | undefined][] : []),
    ...(d.kind === 'issue' ? [['Activity', d.activity], ['Issued to', d.party], ['Gemba', d.gemba], ['Time on the card', d.doc_time?.slice(0, 5)], ['SM / Supervisor', d.supervisor], ['Card no. (printed)', d.card_no]] as [string, string | null | undefined][] : []),
    ...(d.kind === 'return' ? [['Returned by', row.who], ['Gemba', row.where]] as [string, string | null | undefined][] : []),
    ...(d.kind === 'transfer_in' || d.kind === 'transfer_out' ? [[d.kind === 'transfer_out' ? 'Sent to' : 'Received from', d.party], ['Authorised by', d.authorised_by], ['Vehicle', d.vehicle]] as [string, string | null | undefined][] : []),
    ...(d.source === 'zoho' ? [['Zoho receive', d.zoho_grn], ['Purchase order', d.zoho_po], ['Checked in Bohari', d.checked_at ? new Date(d.checked_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : 'Not yet']] as [string, string | null | undefined][] : []),
    [d.source === 'zoho' ? 'Brought in from Zoho' : 'Saved', saved],
  ];
  const showSub = d.kind === 'delivery' || d.kind === 'return' || d.lines.some((l) => l.subphase && l.subphase !== d.gemba);
  return (
    <section className="recDetail">
      <header>
        <div><span className="recKicker">{d.source === 'zoho' && <ZohoTag />} {{ DLV: 'Delivery', ISS: 'Withdrawal card', RET: 'Return', TRF: 'Project transfer' }[cfg.prefix]} · {cfg.tag}</span><h2>{row.ref}</h2></div>
        <button className="btn ghost sm" onClick={onFix}><Icon name="fix" size={16} />Fix an error</button>
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>
        <button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>
      {d.source === 'zoho' && <div className="recZoho">Came in from Zoho by itself. If something on it is wrong, correct it in Zoho, then use Fix an error here.</div>}
      {!!d.to_confirm?.length && <div className="recConfirm">Some details are still to confirm on this entry. Fill them in from the check-in page.</div>}
      <dl className="recKv">{kv.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>)}</dl>
      <div className="recLines">
        <div className={`recLine th ${showSub ? 'sub' : ''}`}><span>#</span><span>Item</span><span className="num">Qty</span><span>Unit</span>{showSub && <span>Sub-phase</span>}</div>
        {d.lines.map((l, i) => { const it = itemById.get(l.item_id); return (
          <div key={l.id} className={`recLine ${showSub ? 'sub' : ''}`}><span className="muted">{i + 1}</span><b>{it?.name ?? 'Item'}</b><span className="num mono">{fmt(l.qty)}</span><span className="muted">{it?.unit}</span>{showSub && <span>{l.subphase ?? '—'}</span>}</div>
        ); })}
      </div>
    </section>
  );
}
