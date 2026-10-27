import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import type { Incoming, IncomingDismissed, IncomingOrder } from '../lib/types';
import { Icon } from './fx';
import { fmt } from './ui';
import { toast } from './feedback';
import { ZohoBooksMark } from './Zoho';
import { useData } from '../lib/store';

const KEY = 'ostock-incoming';
const FRESH = 30 * 60_000; // checked at most every 30 minutes unless Refresh is pressed
const short = (d: string) => niceDate(d).split(' ').slice(1).join(' ');
const ago = (iso?: string) => { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

let memo: Incoming | null = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; } })();

function useIncoming() {
  const [data, setData] = useState<Incoming | null>(memo);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (force = false) => {
    if (!force && memo?.checked_at && Date.now() - new Date(memo.checked_at).getTime() < FRESH) return;
    setBusy(true);
    const started = Date.now();
    try {
      const r = await api.incoming();
      if (!r.error || !memo) { memo = r; setData(r); try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* full */ } }
      else setData({ ...memo, error: r.error });
    } finally { setTimeout(() => setBusy(false), Math.max(0, 800 - (Date.now() - started))); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, busy, refresh: () => load(true) };
}

/** When it's due: red if the date has passed, amber if it's today. */
function due(o: IncomingOrder, today: string) {
  if (!o.expected) return { t: 'No date', k: '' };
  if (o.expected < today) return { t: o.expected === addDay(today, -1) ? 'Due yesterday' : `Due ${short(o.expected)}`, k: 'late' };
  if (o.expected === today) return { t: 'Due today', k: 'today' };
  return { t: niceDate(o.expected).split(' ').slice(0, 2).join(' '), k: '' };
}
const addDay = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function PoTag({ po }: { po: string }) { return <span className="incPo"><ZohoBooksMark size={14} />{po}</span>; }

const REASONS = ['Order cancelled', 'Supplier won’t bring the rest', 'Came on another PO', 'Other'];

/** "Not coming": why, then remove. Only hides it here; Zoho is not changed. */
function RemoveSheet({ o, onClose, onDone }: { o: IncomingOrder; onClose: () => void; onDone: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dayAsk incRm" role="dialog" aria-modal="true" aria-labelledby="rmTitle">
        <span className="incRmKick">Not coming</span>
        <h2 id="rmTitle">Remove {o.vendor ? `${o.vendor}’s ` : ''}{o.po} from incoming?</h2>
        <div className="incRmLines">{o.lines.map((l, i) => <div key={i}><span>{l.name}</span><b className="mono">{fmt(l.ordered - l.received)} of {fmt(l.ordered)} {l.unit ?? ''} owed</b></div>)}</div>
        <span className="incRmQ">Why? <small>(one tap)</small></span>
        <div className="incRmWhy">{REASONS.map((r) => <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>)}</div>
        <small className="muted">Only hides it here. Zoho doesn’t change, and you can bring it back from “Removed”.</small>
        <div className="incRmActs"><button className="btn ghost" onClick={onClose}>Keep it</button>
          <button className="btn danger" disabled={!reason || busy} onClick={async () => { setBusy(true); try { await onDone(reason); } finally { setBusy(false); } }}>{busy ? 'Removing…' : 'Remove'}</button></div>
      </section>
    </div>, document.body);
}

/** The order, opened from a card: ordered, received and still to come per item, and each delivery so far. */
function OrderSheet({ o, onClose }: { o: IncomingOrder; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); document.body.classList.add('noScroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noScroll'); };
  }, [onClose]);
  const anyIn = o.lines.some((l) => l.received > 0);
  return createPortal(
    <div className="sheetBack incBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="incSheet" role="dialog" aria-modal="true" aria-labelledby="incTitle">
        <span className="incGrab" aria-hidden="true" />
        <header className="incSHead">
          <div className="incSTop"><PoTag po={o.po} />{anyIn && <span className="incChip today">Part in</span>}<span className="abGrow" /><button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
          <h2 id="incTitle">{o.vendor ?? 'Vendor'}</h2>
          <div className="incDates">
            {[['Ordered', o.date], ['Expected', o.expected], ['Last in', o.lastIn]].filter(([, v]) => v).map(([k, v]) => <span key={k}><small>{k}</small><b>{niceDate(v!)}</b></span>)}
          </div>
        </header>
        <div className="incTbl">
          <div className="th"><span>Item</span><span>Ordered</span><span>In</span><span>To come</span></div>
          {o.lines.map((l, i) => (
            <div key={i} className="tr"><span><b>{l.name}</b><i className="incBar"><i style={{ width: `${Math.min(100, (l.received / (l.ordered || 1)) * 100)}%` }} /></i></span>
              <span className="mono">{fmt(l.ordered)}</span><span className="mono ok">{fmt(l.received)}</span><span className="mono strong">{l.ordered - l.received > 0 ? `${fmt(l.ordered - l.received)} ${l.unit ?? ''}` : '✓ all in'}</span></div>
          ))}
        </div>
        {!!o.grns?.length && <div className="incGrns"><span className="incGrnsT">Delivered so far</span>
          {o.grns.map((g) => <div key={g.grn + g.date}><span><PoTag po={g.grn} /> {short(g.date)}</span><small>{g.lines}</small></div>)}</div>}
        <footer className="incSFoot"><a className="btn ghost" href="https://books.zoho.com/app#/purchaseorders" target="_blank" rel="noreferrer">Open in Zoho Books ↗</a><button className="btn" onClick={onClose}>Close</button></footer>
      </section>
    </div>, document.body);
}

type Tab = 'this' | 'next' | 'part';
const SHOW = 5; // rows shown before "Show all"

/** Incoming deliveries: expected this week and next (by expected date), and part deliveries of the last 4 weeks still owed. */
export function IncomingPanel() {
  const { data, busy, refresh } = useIncoming();
  const { projectWeek } = useData();
  // Named by the project's week number (Week 121, Week 122) when the site has one.
  const wkName = (k: 0 | 1) => (projectWeek != null ? `Week ${projectWeek + k}` : k ? 'Next week' : 'This week');
  const [tab, setTab] = useState<Tab>('this');
  const [open, setOpen] = useState<IncomingOrder | null>(null);
  const [removing, setRemoving] = useState<IncomingOrder | null>(null);
  const [all, setAll] = useState(false);
  const [gone, setGone] = useState<IncomingDismissed[]>([]);
  const [showGone, setShowGone] = useState(false);
  const loadGone = useCallback(() => api.dismissedIncoming().then(setGone).catch(() => undefined), []);
  useEffect(() => { loadGone(); }, [loadGone]);
  if (data && !data.connected) return null;
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const goneIds = new Set(gone.map((g) => g.po_id));
  const keepFrom = addDay(today, -13);
  const partList = (data?.part ?? []).filter((o) => !goneIds.has(o.id) && (!o.firstIn || o.firstIn >= keepFrom));
  const remove = async (o: IncomingOrder, reason: string) => {
    await api.dismissIncoming({ po_id: o.id, po: o.po, vendor: o.vendor, reason });
    setRemoving(null); await loadGone();
    toast(`${o.po} removed from incoming`, 'ok', { label: 'Undo', run: () => { api.restoreIncoming(o.id).then(loadGone).catch(() => undefined); } });
  };
  const bringBack = async (g: IncomingDismissed) => { await api.restoreIncoming(g.po_id); await loadGone(); toast(`${g.po ?? 'Order'} is back in part-delivered`); };
  const cols: { k: Tab; title: string; sub: string; list: IncomingOrder[]; part?: boolean; empty: string }[] = [
    { k: 'this', title: wkName(0), sub: data?.week ? `${short(data.week.from)} – ${short(data.week.to)}` : 'By expected date', list: data?.thisWeek ?? [], empty: `Nothing expected in ${wkName(0)}` },
    { k: 'next', title: wkName(1), sub: data?.next ? `${short(data.next.from)} – ${short(data.next.to)}` : '', list: data?.nextWeek ?? [], empty: `Nothing expected in ${wkName(1)}` },
    { k: 'part', title: 'Part-delivered', sub: 'Part came in, the rest still owed · kept 2 weeks', list: partList, part: true, empty: 'No part deliveries waiting' },
  ];
  return (
    <section className="panel incPanel enter" aria-label="Incoming deliveries">
      <header className="incHead incHead2">
        <span className="incIc"><Icon name="truck" size={16} /></span>
        <b className="incT2">Incoming deliveries</b>
        <div className="incTabs2" role="tablist">
          {cols.map((c) => <button key={c.k} role="tab" className={c.k} aria-selected={tab === c.k} onClick={() => { setTab(c.k); setAll(false); }}>{c.title}<span className="mono">{c.list.length}</span></button>)}
        </div>
        <button className={`incRef2 ${busy ? 'busy' : ''}`} onClick={refresh} disabled={busy} aria-label="Refresh incoming deliveries from Zoho Books" title={data?.error ? 'Zoho didn’t answer · showing last check' : data?.checked_at ? `Checked ${ago(data.checked_at)}` : 'Refresh'}>
          <Icon name="refresh" size={15} />
        </button>
      </header>
      {(() => {
        const c = cols.find((x) => x.k === tab)!;
        const list = all ? c.list : c.list.slice(0, SHOW);
        return (
          <div className={`incTbl2 ${c.k}`} role="tabpanel">
            {!data && busy && <div className="incSkel" />}
            {data && !c.list.length && <div className="incEmpty2">{c.empty}</div>}
            {list.map((o) => {
              const dd = due(o, today);
              const first = o.lines[0];
              const more = o.lines.length - 1;
              return (
                <div key={o.id + c.k} className="incRow2">
                  <button type="button" className="incRowBtn" onClick={() => setOpen(o)}>
                    <b className="irV">{o.vendor ?? 'Vendor'}</b>
                    <span className="irPo mono">{o.po}</span>
                    <span className="irIt">{first?.name}{more > 0 ? ` · +${more}` : ''}</span>
                    <b className="irQ mono">{first ? (c.part ? <>{fmt(first.ordered - first.received)}<small>/{fmt(first.ordered)}</small> {first.unit ?? ''}</> : `${fmt(first.ordered - first.received)} ${first.unit ?? ''}`) : ''}</b>
                    {c.part ? <span className="irWhen">{o.lastIn ? `Last in ${short(o.lastIn)}` : ''}</span> : <span className={`irDue ${dd.k}`}>{dd.k === 'late' && o.expected === addDay(today, -1) ? 'Yesterday' : dd.k === 'today' ? 'Today' : dd.t}</span>}
                  </button>
                  {c.part && <button type="button" className="incNot" onClick={() => setRemoving(o)} title="This won’t be delivered"><Icon name="close" size={12} />Not coming</button>}
                </div>
              );
            })}
            {c.list.length > SHOW && <button type="button" className="incAll" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${c.list.length} →`}</button>}
            {c.part && gone.length > 0 && (
              <div className="incGone">
                <button type="button" className="incGoneBtn" onClick={() => setShowGone(!showGone)}>Removed: {gone.length} · {showGone ? 'Hide' : 'Show'}</button>
                {showGone && gone.map((g) => (
                  <div key={g.po_id} className="incGoneRow"><span><b>{g.po ?? 'Order'}</b>{g.vendor ? ` · ${g.vendor}` : ''}<small>{g.reason}</small></span><button type="button" className="btn link" onClick={() => bringBack(g)}>Bring back</button></div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {open && <OrderSheet o={open} onClose={() => setOpen(null)} />}
      {removing && <RemoveSheet o={removing} onClose={() => setRemoving(null)} onDone={(r) => remove(removing, r)} />}
    </section>
  );
}

/** Low items that are on their way (by name), for "Needs attention". */
export function useOnTheWay() {
  const [m, setM] = useState<Incoming | null>(memo);
  const { projectWeek } = useData();
  useEffect(() => { const t = setInterval(() => { if (memo !== m) setM(memo); }, 2000); return () => clearInterval(t); }, [m]);
  const names = new Map<string, string>();
  (m?.thisWeek ?? []).forEach((o) => o.lines.forEach((l) => names.set(l.name.toLowerCase(), o.expected ? niceDate(o.expected).split(' ')[0] + ' ' + short(o.expected) : 'this week')));
  (m?.nextWeek ?? []).forEach((o) => o.lines.forEach((l) => { if (!names.has(l.name.toLowerCase())) names.set(l.name.toLowerCase(), projectWeek != null ? `week ${projectWeek + 1}` : 'next week'); }));
  (m?.part ?? []).forEach((o) => o.lines.forEach((l) => { if (!names.has(l.name.toLowerCase())) names.set(l.name.toLowerCase(), 'part-delivered'); }));
  return names;
}

/** How many orders are expected this week, and how many of those are late, for the dashboard strip. */
export function useIncomingCounts() {
  const [m, setM] = useState<Incoming | null>(memo);
  useEffect(() => { const t = setInterval(() => { if (memo !== m) setM(memo); }, 500); return () => clearInterval(t); }, [m]);
  if (!m || !m.connected) return null;
  const today = m.today ?? new Date().toISOString().slice(0, 10);
  const wk = m.thisWeek ?? [];
  return { week: wk.length, late: wk.filter((o) => o.expected && o.expected < today).length, today: wk.filter((o) => o.expected === today).length, part: (m.part ?? []).length };
}
