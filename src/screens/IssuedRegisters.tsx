import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { Doc } from '../lib/types';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';

export type RegRow = { doc: Doc; ref: string };

/** What came back against each line of an issue (returns point at the line they came back for). */
export function useReturned(all: Doc[] | null) {
  return useMemo(() => {
    const m = new Map<number, number>();
    for (const d of all ?? []) if (d.kind === 'return') for (const l of d.lines) if (l.return_of != null) m.set(l.return_of, (m.get(l.return_of) ?? 0) + l.qty);
    return m;
  }, [all]);
}

/** Issued items, one row a day (that day's Material Issuance Register). Old withdrawal cards fold away at the bottom. */
export function IssuedTable({ rows, all, onOpen }: { rows: RegRow[]; all: Doc[] | null; onOpen: (id: string) => void }) {
  const { itemById, realToday } = useData();
  const returned = useReturned(all);
  const [subs, setSubs] = useState<Set<string>>(new Set());
  const [showOld, setShowOld] = useState(false);
  const regs = rows.filter((r) => !r.doc.ref_no);
  const old = rows.filter((r) => r.doc.ref_no);
  useEffect(() => {
    const ds = rows.map((r) => r.doc.doc_date).sort();
    if (!ds.length) return;
    api.submittedDays(ds[0], ds[ds.length - 1]).then((x) => setSubs(new Set(x))).catch(() => undefined);
  }, [rows]);
  const oldRange = old.length ? `${niceDate(old[old.length - 1].doc.doc_date).split(' ').slice(1).join(' ')} – ${niceDate(old[0].doc.doc_date).split(' ').slice(1).join(' ')}` : '';
  const row = (r: RegRow) => {
    const d = r.doc;
    const back = d.lines.filter((l) => (returned.get(l.id) ?? 0) > 0).length;
    const top = d.lines.slice(0, 3);
    const st = d.doc_date === realToday && !subs.has(d.doc_date) ? { t: 'Today · open', k: 'open' } : subs.has(d.doc_date) ? { t: 'Submitted', k: 'ok' } : { t: 'Not submitted', k: 'no' };
    return (
      <button key={d.id} className="regRow" onClick={() => onOpen(d.id)}>
        <b className="recRef">{r.ref}</b>
        <span>{niceDate(d.doc_date)}</span>
        <b className="mono">{d.lines.length}</b>
        <span className="regOut">{top.map((l, i) => { const it = itemById.get(l.item_id); return <span key={l.id}>{i > 0 && ' · '}{it?.name ?? 'Item'} <b className="mono">{fmt(l.qty)}</b></span>; })}{d.lines.length > 3 && <em> +{d.lines.length - 3} more</em>}</span>
        <span className="muted">{back ? `${back} item${back === 1 ? '' : 's'}` : '—'}</span>
        <span className="muted regStore">{d.ref_no ? `Card ${d.ref_no}` : d.authorised_by || '—'}</span>
        <span><span className={`regPill ${st.k}`}>{st.t}</span></span>
        <span className="regChev" aria-hidden="true">›</span>
      </button>
    );
  };
  return (
    <section className="recTable regTable" aria-label="Issued items">
      <div className="regRow regTh"><span>Ref</span><span>Date</span><span>Items</span><span>What went out</span><span>Returned</span><span>Store</span><span>Day</span><span /></div>
      {!rows.length && <div className="recEmpty">Nothing issued in this period.</div>}
      {regs.map(row)}
      {old.length > 0 && (
        <>
          <button className="regOld" onClick={() => setShowOld((v) => !v)} aria-expanded={showOld}>
            <b>Before the register</b><span>{old.length} withdrawal card{old.length === 1 ? '' : 's'}{oldRange ? `, ${oldRange}` : ''}</span><em>{showOld ? 'Hide the old cards ▴' : 'Show the old cards ▾'}</em>
          </button>
          {showOld && old.map(row)}
        </>
      )}
    </section>
  );
}

/** One day's register as the sheet: what went out, what came back, what was used. */
export function RegisterSheet({ row, all, onClose, onFix }: { row: RegRow; all: Doc[] | null; onClose: () => void; onFix?: () => void }) {
  const { itemById, realToday, startCatchUp, go } = useData();
  const returned = useReturned(all);
  const [submitted, setSubmitted] = useState<boolean | null>(null);
  const d = row.doc;
  useEffect(() => { api.submittedDays(d.doc_date, d.doc_date).then((x) => setSubmitted(x.length > 0)).catch(() => setSubmitted(null)); }, [d.doc_date]);
  const open = !submitted;
  const saved = new Date(d.created_at).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
  const addTo = () => {
    if (submitted) { toast('That day is submitted. Use Fix an error to add a missed line.'); return; }
    if (d.doc_date !== realToday) startCatchUp(d.doc_date);
    go('issued');
  };
  return (
    <section className="recDetail regSheet">
      <header>
        <div><span className="recKicker">{d.ref_no ? `Withdrawal card ${d.ref_no}` : 'Material Issuance Register'} · Stock out</span><h2>{niceDate(d.doc_date)}</h2>
          <small className="muted">{row.ref} · store {d.authorised_by || '—'} · {d.lines.length} item{d.lines.length === 1 ? '' : 's'}</small></div>
        {submitted !== null && <span className={`regPill ${open ? (d.doc_date === realToday ? 'open' : 'no') : 'ok'}`}>{open ? (d.doc_date === realToday ? 'Today · open' : 'Not submitted') : 'Submitted'}</span>}
        {!d.ref_no && onFix && <button className="btn ghost sm" onClick={addTo}><Icon name="plus" size={16} />Add to it</button>}
        {onFix && <button className="btn ghost sm" onClick={onFix}><Icon name="fix" size={16} />Fix an error</button>}
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>
        <button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      </header>
      {d.ref_no && <dl className="recKv">{([['Activity', d.activity], ['Issued to', d.party], ['Gemba', d.gemba], ['SM / Supervisor', d.supervisor]] as [string, string | null | undefined][]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>)}</dl>}
      <div className="regLines">
        <div className="regLine th"><span>#</span><span>Item</span><span>Qty</span><span>Unit</span><span>Returned</span><span>Used</span></div>
        {d.lines.map((l, i) => { const it = itemById.get(l.item_id); const b = returned.get(l.id) ?? 0; return (
          <div key={l.id} className="regLine"><span className="muted mono">{i + 1}</span><b>{it?.name ?? 'Item'}</b><span className="mono strong">{fmt(l.qty)}</span><span className="muted">{it?.unit}</span><span className={`mono ${b ? 'back' : 'muted'}`}>{b ? `+${fmt(b)}` : '—'}</span><span className="mono">{fmt(l.qty - b)}</span></div>
        ); })}
      </div>
      <div className="regFoot muted">Entered {saved}{d.authorised_by ? ` by ${d.authorised_by}` : ''}</div>
    </section>
  );
}
