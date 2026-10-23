import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import type { Incoming, IncomingOrder } from '../lib/types';
import { Icon } from './fx';
import { fmt } from './ui';
import { ZohoBooksMark } from './Zoho';

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

function OrderCard({ o, today, part, onOpen }: { o: IncomingOrder; today: string; part?: boolean; onOpen: () => void }) {
  const d = due(o, today);
  return (
    <button type="button" className={`incCard ${part ? 'part' : ''} ${d.k}`} onClick={onOpen}>
      <span className="incTop"><b>{o.vendor ?? 'Vendor'}</b><span className={`incChip ${part ? 'today' : d.k}`}>{part ? 'Part in' : d.t}</span></span>
      <PoTag po={o.po} />
      {o.lines.slice(0, 3).map((l, i) => part ? (
        <span key={i} className="incLine part"><span className="incLn"><span>{l.name}</span><b className="mono">{fmt(l.ordered - l.received)}<small>/{fmt(l.ordered)} {l.unit ?? ''}</small></b></span><i className="incBar"><i style={{ width: `${Math.min(100, (l.received / (l.ordered || 1)) * 100)}%` }} /></i></span>
      ) : (
        <span key={i} className="incLine"><span>{l.name}</span><b className="mono">{fmt(l.ordered - l.received)} {l.unit ?? ''}</b></span>
      ))}
      {o.lines.length > 3 && <small className="incMore">+{o.lines.length - 3} more</small>}
      {part && o.lastIn && <small className="incFoot">Still owed / ordered · last in {short(o.lastIn)}</small>}
    </button>
  );
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

/** Incoming deliveries: expected this week and next (by expected date), and part deliveries of the last 4 weeks still owed. */
export function IncomingPanel() {
  const { data, busy, refresh } = useIncoming();
  const [tab, setTab] = useState<Tab>('this');
  const [open, setOpen] = useState<IncomingOrder | null>(null);
  if (data && !data.connected) return null;
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const cols: { k: Tab; title: string; sub: string; list: IncomingOrder[]; part?: boolean; empty: string }[] = [
    { k: 'this', title: 'This week', sub: data?.week ? `${short(data.week.from)} – ${short(data.week.to)} · by expected date` : 'By expected date', list: data?.thisWeek ?? [], empty: 'Nothing expected this week' },
    { k: 'next', title: 'Next week', sub: data?.next ? `${short(data.next.from)} – ${short(data.next.to)}` : '', list: data?.nextWeek ?? [], empty: 'Nothing expected next week' },
    { k: 'part', title: 'Part-delivered', sub: 'Came in the last 4 weeks, rest still owed', list: data?.part ?? [], part: true, empty: 'No part deliveries waiting' },
  ];
  return (
    <section className="panel incPanel enter" aria-label="Incoming deliveries">
      <header className="incHead">
        <span className="incIc"><Icon name="truck" size={18} /></span>
        <div className="incHT"><b>Incoming deliveries</b><span>Zoho purchase orders: what’s expected these two weeks, and what’s still owed on part deliveries</span></div>
        <span className="incRef">
          <button className={`recNew zohoRefresh ${busy ? 'busy' : ''}`} onClick={refresh} disabled={busy} aria-label="Refresh incoming deliveries from Zoho Books">
            <span className="zrLogo"><ZohoBooksMark size={20} /></span>{busy ? 'Refreshing…' : 'Refresh'}<span className="zrSpin" aria-hidden="true"><Icon name="refresh" size={16} /></span>
          </button>
          <small>{data?.error ? <span className="incErr" title={data.error}>Zoho didn’t answer · showing last check</span> : data?.checked_at ? `checked ${ago(data.checked_at)}` : busy ? 'checking…' : ''}</small>
        </span>
      </header>
      <div className="incTabs" role="tablist">
        {cols.map((c) => <button key={c.k} role="tab" aria-selected={tab === c.k} onClick={() => setTab(c.k)}>{c.title} <span className="mono">{c.list.length}</span></button>)}
      </div>
      <div className="incCols">
        {cols.map((c) => (
          <div key={c.k} className={`incCol ${c.k} ${tab === c.k ? 'on' : ''}`}>
            <div className="incColHead"><b>{c.title}</b><span className="mono">{c.list.length}</span><small>{c.sub}</small></div>
            {!data && busy && <div className="incSkel" />}
            {data && !c.list.length && <div className="incEmpty">{c.empty}</div>}
            {c.list.map((o) => <OrderCard key={o.id + c.k} o={o} today={today} part={c.part} onOpen={() => setOpen(o)} />)}
          </div>
        ))}
      </div>
      {open && <OrderSheet o={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Low items that are on their way (by name), for "Needs attention". */
export function useOnTheWay() {
  const [m, setM] = useState<Incoming | null>(memo);
  useEffect(() => { const t = setInterval(() => { if (memo !== m) setM(memo); }, 2000); return () => clearInterval(t); }, [m]);
  const names = new Map<string, string>();
  (m?.thisWeek ?? []).forEach((o) => o.lines.forEach((l) => names.set(l.name.toLowerCase(), o.expected ? niceDate(o.expected).split(' ')[0] + ' ' + short(o.expected) : 'this week')));
  (m?.nextWeek ?? []).forEach((o) => o.lines.forEach((l) => { if (!names.has(l.name.toLowerCase())) names.set(l.name.toLowerCase(), 'next week'); }));
  (m?.part ?? []).forEach((o) => o.lines.forEach((l) => { if (!names.has(l.name.toLowerCase())) names.set(l.name.toLowerCase(), 'part-delivered'); }));
  return names;
}
