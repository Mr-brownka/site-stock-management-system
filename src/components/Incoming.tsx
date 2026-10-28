import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import type { Incoming, IncomingDismissed, IncomingOrder } from '../lib/types';
import { Icon } from './fx';
import { fmt } from './ui';
import { toast } from './feedback';
import { ZohoBooksMark, ZohoOpen, openInZoho } from './Zoho';
import { useData } from '../lib/store';
import { useIsPhone } from './Ring';
import { BackPill } from './BackPill';

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

/** One order: ordered, received and still to come per item, each delivery so far, and Open in Zoho Books. */
function OrderView({ o, onClose, onNot }: { o: IncomingOrder; onClose: () => void; onNot?: () => void }) {
  const anyIn = o.lines.some((l) => l.received > 0);
  return (
    <>
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
        {o.grns.map((g) => <div key={g.grn + g.date}><span><button type="button" className="incGrnLink" title="Open this receive in Zoho Books" onClick={() => openInZoho({ receive_id: g.id, grn: g.grn })}><PoTag po={g.grn} /></button> {short(g.date)}</span><small>{g.lines}</small></div>)}</div>}
      <footer className="incSFoot"><ZohoOpen zref={{ po_id: o.id, po: o.po }} label={`Open ${o.po} in Zoho Books ↗`} />{onNot && <button className="btn ghost incNotBig" onClick={onNot}>Not coming</button>}</footer>
    </>
  );
}

/** The order as a sheet (dashboard panel, and the page on phones). */
function OrderSheet({ o, onClose, onNot }: { o: IncomingOrder; onClose: () => void; onNot?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); document.body.classList.add('noScroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noScroll'); };
  }, [onClose]);
  return createPortal(
    <div className="sheetBack incBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="incSheet" role="dialog" aria-modal="true" aria-labelledby="incTitle">
        <span className="incGrab" aria-hidden="true" />
        <OrderView o={o} onClose={onClose} onNot={onNot} />
      </section>
    </div>, document.body);
}

type Tab = 'this' | 'next' | 'part';
const SHOW = 11; // rows shown before "Show all"

/** Incoming deliveries: expected this week and next (by expected date), and part deliveries of the last 4 weeks still owed. */
export function IncomingPanel() {
  const { data, busy, refresh } = useIncoming();
  const { projectWeek, go } = useData();
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
    <section className="panel incPanel enter" aria-label="Deliveries to expect">
      <header className="incHead incHead2">
        <span className="incIc"><Icon name="truck" size={16} /></span>
        <b className="incT2">Deliveries to expect</b>
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
            {data && <button type="button" className="incAll incPageLink" onClick={() => go('incoming')}>See all {cols.reduce((a, x) => a + x.list.length, 0)} on the Coming in page →</button>}
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
      {open && <OrderSheet o={open} onClose={() => setOpen(null)} onNot={tab === 'part' ? () => { setRemoving(open); setOpen(null); } : undefined} />}
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

type PTab = 'this' | 'next' | 'part' | 'all';
/** Coming in: every order Zoho expects at this site, in one table. The order opens on the right (a sheet on phones). */
export function ComingInPage() {
  const { data, busy, refresh } = useIncoming();
  const { projectWeek, site } = useData();
  const phone = useIsPhone();
  const wkName = (k: 0 | 1) => (projectWeek != null ? `Week ${projectWeek + k}` : k ? 'Next week' : 'This week');
  const [tab, setTab] = useState<PTab>('this');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<IncomingOrder | null>(null);
  const [gone, setGone] = useState<IncomingDismissed[]>([]);
  const loadGone = useCallback(() => api.dismissedIncoming().then(setGone).catch(() => undefined), []);
  useEffect(() => { loadGone(); }, [loadGone]);
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const goneIds = new Set(gone.map((g) => g.po_id));
  const keepFrom = addDay(today, -13);
  const lists: Record<Exclude<PTab, 'all'>, IncomingOrder[]> = {
    this: data?.thisWeek ?? [], next: data?.nextWeek ?? [],
    part: (data?.part ?? []).filter((o) => !goneIds.has(o.id) && (!o.firstIn || o.firstIn >= keepFrom)),
  };
  const all: { o: IncomingOrder; k: Exclude<PTab, 'all'> }[] = [];
  const seen = new Set<string>();
  (['this', 'next', 'part'] as const).forEach((k) => lists[k].forEach((o) => { if (!seen.has(o.id)) { seen.add(o.id); all.push({ o, k }); } }));
  const rows = (tab === 'all' ? all : lists[tab].map((o) => ({ o, k: tab }))).filter(({ o }) => {
    const s = q.trim().toLowerCase();
    return !s || [o.vendor, o.po, ...o.lines.map((l) => l.name)].some((x) => (x ?? '').toLowerCase().includes(s));
  });
  const late = lists.this.filter((o) => o.expected && o.expected < today);
  const dueToday = lists.this.filter((o) => o.expected === today).length;
  const sel = all.find((x) => x.o.id === selId) ?? null;
  const remove = async (o: IncomingOrder, reason: string) => {
    await api.dismissIncoming({ po_id: o.id, po: o.po, vendor: o.vendor, reason });
    setRemoving(null); setSelId(null); await loadGone();
    toast(`${o.po} removed from incoming`, 'ok', { label: 'Undo', run: () => { api.restoreIncoming(o.id).then(loadGone).catch(() => undefined); } });
  };
  const kp = [
    { l: 'Due this week', n: lists.this.length, s: `${late.length ? `${late.length} late` : 'None late'}${dueToday ? ` · ${dueToday} today` : ''}`, t: '' },
    { l: wkName(1), n: lists.next.length, s: data?.next ? `${short(data.next.from)} – ${short(data.next.to)}` : 'Next week', t: '' },
    { l: 'Part-delivered', n: lists.part.length, s: 'rest still owed', t: 'blue' },
    { l: 'Late', n: late.length, s: late.slice(0, 2).map((o) => (o.vendor ?? '').split(' ')[0]).join(' · ') || 'Nothing late', t: late.length ? 'red' : '' },
  ];
  const tabs: { k: PTab; t: string; n: number }[] = [
    { k: 'this', t: wkName(0), n: lists.this.length }, { k: 'next', t: wkName(1), n: lists.next.length },
    { k: 'part', t: 'Part-delivered', n: lists.part.length }, { k: 'all', t: 'All', n: all.length },
  ];
  if (data && !data.connected) return <div className="page cinPage"><BackPill /><h1>Coming in</h1><div className="panel pad muted">Zoho Books isn’t connected for this site yet.</div></div>;
  return (
    <div className="page cinPage">
      <BackPill />
      <header className="cinHead">
        <div><h1>Coming in</h1><p className="muted">Every order Zoho expects at {site || 'this site'}. Fully received items drop off by themselves.</p></div>
        <button className={`btn ghost sm cinRef ${busy ? 'busy' : ''}`} onClick={refresh} disabled={busy}><Icon name="refresh" size={15} />{busy ? 'Checking Zoho…' : data?.checked_at ? `Checked ${ago(data.checked_at)}` : 'Check Zoho'}</button>
      </header>
      {data?.error && <div className="note" role="status">Zoho didn’t answer just now. Showing the last check.</div>}
      <div className="cinKpis">{kp.map((k) => <div key={k.l} className={k.t}><small>{k.l}</small><b className="mono">{k.n}<span>{k.n === 1 ? ' order' : ' orders'}</span></b><small className="muted">{k.s}</small></div>)}</div>
      <div className={`cinGrid ${sel && !phone ? 'open' : ''}`}>
        <section className="panel cinList">
          <div className="cinBar">
            <div className="cinTabs" role="tablist">{tabs.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}>{t.t}<span className="mono">{t.n}</span></button>)}</div>
            <label className="cinFind"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vendor, PO or item" aria-label="Find a vendor, PO or item" /></label>
          </div>
          <div className="cinTh" aria-hidden="true"><span>Vendor</span><span>PO</span><span>Items still to come</span><span>Qty</span><span>Expected</span></div>
          {!data && busy && <div className="incSkel" />}
          {data && !rows.length && <div className="incEmpty2">{q ? `Nothing matches “${q}”.` : tab === 'part' ? 'No part deliveries waiting.' : 'Nothing expected here.'}</div>}
          {rows.map(({ o, k }) => {
            const dd = due(o, today); const first = o.lines[0]; const more = o.lines.length - 1;
            const owed = first ? first.ordered - first.received : 0;
            return (
              <button key={o.id + k} type="button" className={`cinRow ${selId === o.id ? 'on' : ''}`} onClick={() => setSelId(selId === o.id && !phone ? null : o.id)}>
                <b className="cinV">{o.vendor ?? 'Vendor'}</b>
                <span className="cinPo"><PoTag po={o.po} /></span>
                <span className="cinIt">{first?.name}{more > 0 && <em> · +{more} more</em>}</span>
                <b className="cinQ mono">{first ? <>{fmt(owed)}{k === 'part' && <small>/{fmt(first.ordered)}</small>} <small>{first.unit ?? ''}</small></> : ''}</b>
                <span className="cinDue">{k === 'part' ? <span className="incChip part">{o.lastIn ? `Last in ${short(o.lastIn)}` : 'Part in'}</span> : <span className={`incChip ${dd.k}`}>{dd.k === 'late' && o.expected === addDay(today, -1) ? 'Yesterday' : dd.k === 'today' ? 'Today' : dd.t.replace('Due ', '')}</span>}</span>
              </button>
            );
          })}
        </section>
        {sel && !phone && <aside className="panel cinSide" aria-label={`Order ${sel.o.po}`}><OrderView o={sel.o} onClose={() => setSelId(null)} onNot={sel.k === 'part' ? () => setRemoving(sel.o) : undefined} /></aside>}
      </div>
      {sel && phone && <OrderSheet o={sel.o} onClose={() => setSelId(null)} onNot={sel.k === 'part' ? () => setRemoving(sel.o) : undefined} />}
      {removing && <RemoveSheet o={removing} onClose={() => setRemoving(null)} onDone={(r) => remove(removing, r)} />}
    </div>
  );
}
