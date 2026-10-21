import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt } from '../components/ui';
import { Icon } from '../components/fx';
import { BackPill } from '../components/BackPill';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { CorrectionRequest, Doc } from '../lib/types';

type View = 'find' | 'fix' | 'recount' | 'mine';
type KindKey = 'all' | 'deliveries' | 'issued' | 'returns' | 'transfers';
const FIX_REASONS = ['Typing mistake', 'Wrong item', 'Wrong card / note', 'Other'];
const COUNT_REASONS = ['Damaged / spoilt', 'Lost / not found', 'Delivery not entered', 'Issue not entered', 'Counting error'];
const KINDS: { key: KindKey; label: string; kinds: Doc['kind'][] }[] = [
  { key: 'all', label: 'All', kinds: [] },
  { key: 'deliveries', label: 'Deliveries', kinds: ['delivery'] },
  { key: 'issued', label: 'Issued', kinds: ['issue'] },
  { key: 'returns', label: 'Returns', kinds: ['return'] },
  { key: 'transfers', label: 'Transfers', kinds: ['transfer_in', 'transfer_out'] },
];
const PREFIX: Record<string, string> = { delivery: 'DLV', issue: 'ISS', return: 'RET', transfer_in: 'TRF', transfer_out: 'TRF' };
const PAPER: Record<string, string> = { delivery: 'Delivery note', issue: 'Card', return: 'Return on card', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };
const TONE: Record<string, string> = { delivery: 'in', issue: 'out', return: 'back', transfer_in: 'trf', transfer_out: 'trf' };
const OUT_KINDS = ['issue', 'transfer_out'];
const LOOKBACK = 60;

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="fxChips" role="group">
      {options.map((o) => <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(o)}>{o}</button>)}
    </div>
  );
}

/** Fix an error: one search box finds the entry, then the app's numbers sit next to the paper's. The admin approves. */
export function Corrections() {
  const { day, go, itemById, balances, balanceOf, refresh } = useData();
  const [view, setView] = useState<View>('find');
  const [kind, setKind] = useState<KindKey>('all');
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [mine, setMine] = useState<CorrectionRequest[]>([]);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [counted, setCounted] = useState('');
  const [q, setQ] = useState('');
  const [iq, setIq] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const findRef = useRef<HTMLInputElement>(null);

  const loadMine = () => api.myCorrections().then(setMine).catch(() => setMine([]));
  useEffect(() => {
    api.documents(addDays(day, -(LOOKBACK - 1)), day).then((ds) => setDocs(ds.filter((d) => d.kind !== 'correction' && d.kind !== 'opening'))).catch(() => setDocs([]));
    loadMine();
  }, [day]);

  const pendingLines = useMemo(() => new Set(mine.filter((m) => m.status === 'pending' && m.movement_id).map((m) => m.movement_id)), [mine]);
  const waiting = mine.filter((m) => m.status === 'pending').length;
  const approved = mine.filter((m) => m.status === 'approved' && m.decided_at && m.decided_at.slice(0, 7) === day.slice(0, 7)).length;

  // Bohari's own number (DLV-0012 …). Older entries without one are numbered in the order they were made.
  const order = useMemo(() => {
    const m = new Map<string, number>(); const n: Record<string, number> = {};
    for (const d of [...(docs ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) { const p = PREFIX[d.kind] ?? 'ENT'; n[p] = (n[p] ?? 0) + 1; m.set(d.id, n[p]); }
    return m;
  }, [docs]);
  const sysRef = (d: Doc) => `${PREFIX[d.kind] ?? 'ENT'}-${String(d.sys_no ?? order.get(d.id) ?? 0).padStart(4, '0')}`;
  const paperTitle = (d: Doc) => `${PAPER[d.kind] ?? 'Entry'}${d.ref_no ? ` ${d.ref_no}` : ''}`;
  const linesText = (d: Doc) => d.lines.slice(0, 2).map((l) => { const it = itemById.get(l.item_id); return `${it?.name ?? 'Item'} ${fmt(l.qty)} ${it?.unit ?? ''}`.trim(); }).join(', ') + (d.lines.length > 2 ? ` +${d.lines.length - 2} more` : '');
  const who = (d: Doc) => [d.activity, d.party, d.gemba].filter(Boolean).join(' · ');

  const s = q.trim().toLowerCase();
  const matches = useMemo(() => {
    const K = KINDS.find((k) => k.key === kind)!;
    return (docs ?? []).filter((d) => {
      if (K.kinds.length && !K.kinds.includes(d.kind)) return false;
      if (!s) return true;
      const hay = [d.ref_no, d.card_no, sysRef(d), d.party, d.activity, d.gemba, d.supervisor, d.doc_date, niceDate(d.doc_date), PAPER[d.kind],
        ...d.lines.map((l) => itemById.get(l.item_id)?.name)].filter(Boolean).join(' ').toLowerCase();
      return s.split(/\s+/).every((w) => hay.includes(w));
    }).sort((a, b) => b.doc_date.localeCompare(a.doc_date) || b.created_at.localeCompare(a.created_at));
  }, [docs, kind, s, itemById]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setVals({}); setReason(''); setNote(''); setErr(''); setCounted(''); };
  const toFind = () => { setView('find'); setOpenDoc(null); setItemId(null); reset(); setTimeout(() => findRef.current?.focus(), 50); };
  const openFix = (d: Doc) => { reset(); setOpenDoc(d); setView('fix'); window.scrollTo({ top: 0 }); };

  const changed = openDoc ? openDoc.lines.filter((l) => vals[l.id] !== undefined && vals[l.id] !== '' && Number(vals[l.id]) !== l.qty) : [];
  const sign = (d: Doc) => (OUT_KINDS.includes(d.kind) ? -1 : 1);
  const sendFix = async () => {
    if (!openDoc) return;
    if (!changed.length) { setErr('Type the number from the paper on the line that is wrong.'); return; }
    if (!reason) { setErr('Tap why it was wrong.'); return; }
    setBusy(true); setErr('');
    try {
      for (const l of changed) {
        await api.requestCorrection({ kind: 'fix', movement_id: l.id, item_id: l.item_id, from_qty: l.qty, to_qty: Number(vals[l.id]), reason, note: note.trim() || null });
      }
      await loadMine();
      const l0 = changed[0]; const it = itemById.get(l0.item_id);
      setSent(`${paperTitle(openDoc)} · ${it?.name} ${fmt(l0.qty)} → ${fmt(Number(vals[l0.id]))} ${it?.unit ?? ''}${changed.length > 1 ? ` and ${changed.length - 1} more` : ''}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const bal = balances.find((b) => b.item_id === itemId);
  const diff = bal && counted !== '' ? Number(counted) - bal.balance : 0;
  const sendRecount = async () => {
    if (!bal) { setErr('Pick the item you counted.'); return; }
    if (counted === '' || Number(counted) === bal.balance) { setErr('Type what you counted. It must be different from the app’s number.'); return; }
    if (!reason) { setErr('Tap what happened.'); return; }
    setBusy(true); setErr('');
    try {
      await api.requestCorrection({ kind: 'recount', item_id: bal.item_id, from_qty: bal.balance, to_qty: Number(counted), reason, note: note.trim() || null });
      await loadMine(); refresh();
      setSent(`Recount · ${bal.name} ${fmt(bal.balance)} → ${fmt(Number(counted))} ${bal.unit}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const shownItems = balances.filter((b) => !iq.trim() || b.name.toLowerCase().includes(iq.trim().toLowerCase())).slice(0, 60);

  const head = view === 'fix' && openDoc
    ? { title: `${paperTitle(openDoc)} · ${niceDate(openDoc.doc_date)}`, lead: [sysRef(openDoc), who(openDoc)].filter(Boolean).join(' · ') }
    : view === 'recount' ? { title: 'Recount an item', lead: 'When the shelf doesn’t match the app and no single entry is to blame.' }
      : view === 'mine' ? { title: 'My requests', lead: 'Everything you sent to the admin, and what they decided.' }
        : { title: 'Fix an error', lead: 'Find the entry, say what the paper says. The admin approves; nothing is deleted.' };

  return (
    <div className="page fxPage">
      {view === 'find' ? <BackPill /> : <BackPill label="Fix an error" onClick={toFind} />}
      <header className="pageHead enter">
        <div className="phText"><h1>{head.title}</h1><span className="phLead">{head.lead}</span></div>
      </header>

      {view === 'find' && (
        <div className="fxStack enter">
          <section className="panel fxFind">
            <b className="fxQ">Which entry is wrong?</b>
            <label className="fxSearch">
              <Icon name="search" size={20} />
              <input ref={findRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card no., delivery note, item or date" aria-label="Find the entry" />
              {q && <button className="fxClear" onClick={() => { setQ(''); findRef.current?.focus(); }} aria-label="Clear">×</button>}
            </label>
            <div className="fxKinds">
              {KINDS.map((k) => <button key={k.key} className={`fxKind ${k.key}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>{k.label}</button>)}
              <button className="fxRecount" onClick={() => { reset(); setView('recount'); }}>The shelf doesn’t match → Recount an item</button>
            </div>
          </section>

          <section className="panel fxResults" aria-label="Entries">
            <div className="fxResHead">{docs === null ? 'Loading…' : s ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : `Recent entries · last ${LOOKBACK} days`}</div>
            {docs !== null && !matches.length && <div className="pad muted">{s ? `Nothing matches “${q}” in the last ${LOOKBACK} days.` : 'No entries yet.'}</div>}
            {matches.slice(0, 40).map((d, i) => {
              const waitingHere = d.lines.some((l) => pendingLines.has(l.id));
              return (
                <button key={d.id} className="fxRow" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }} onClick={() => openFix(d)}>
                  <b className={`mono fxRef ${TONE[d.kind]}`}>{sysRef(d)}</b>
                  <span className="fxWhat"><span><b>{paperTitle(d)}</b>{who(d) ? ` · ${who(d)}` : ''}</span><small>{linesText(d)}</small></span>
                  <span className="fxDate">{niceDate(d.doc_date)}</span>
                  {waitingHere ? <span className="pill">Fix waiting</span> : <span className="fxGo">Fix this →</span>}
                </button>
              );
            })}
          </section>

          <div className="fxMine">
            <span>My requests: <b>{waiting} waiting</b>{approved ? ` · ${approved} approved this month` : ''}</span>
            <button className="btn link" onClick={() => setView('mine')}>Open my requests</button>
          </div>
        </div>
      )}

      {view === 'fix' && openDoc && (
        <div className="fxFix enter">
          <section className="panel fxCompare">
            <div className="fxCmp th"><span>Item</span><span className="r">In the app</span><span className="r">On the paper</span></div>
            {openDoc.lines.map((l) => {
              const it = itemById.get(l.item_id);
              const v = vals[l.id] ?? String(l.qty);
              const ch = v !== '' && Number(v) !== l.qty;
              return (
                <div key={l.id} className={`fxCmp ${ch ? 'changed' : ''}`}>
                  <span>{it?.name} <small>{it?.unit}</small></span>
                  <span className="mono r fxApp">{fmt(l.qty)}</span>
                  {pendingLines.has(l.id) ? <span className="pill" style={{ justifySelf: 'end' }}>Fix waiting</span>
                    : <input className="input num" inputMode="decimal" aria-label={`${it?.name} on the paper`} value={v} onFocus={(e) => e.target.select()} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value.replace(/[^0-9.]/g, '') })} />}
                </div>
              );
            })}
            <div className="fxWhy">
              <span>Why? <small>(one tap)</small></span>
              <Chips options={FIX_REASONS} value={reason} onPick={setReason} />
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. the card says 10, I typed 12" />
            </div>
          </section>

          <aside className="panel fxEffect">
            <b>What changes</b>
            {!changed.length && <span className="muted">Nothing yet. Change the number on the line that is different from the paper.</span>}
            {changed.map((l) => {
              const it = itemById.get(l.item_id); const to = Number(vals[l.id]); const now = balanceOf(l.item_id); const eff = (to - l.qty) * sign(openDoc);
              return (
                <div key={l.id} className="fxEff">
                  <span>{it?.name}: <s className="mono">{fmt(l.qty)}</s> → <b className="mono">{fmt(to)}</b> {it?.unit}</span>
                  <span>Balance: <span className="mono">{fmt(now)}</span> → <b className={`mono ${eff > 0 ? 'up' : 'down'}`}>{fmt(now + eff)}</b></span>
                </div>
              );
            })}
            <small className="muted">Only after the admin approves. The original stays in the record.</small>
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn dark" disabled={busy || !changed.length} onClick={sendFix}>{busy ? 'Sending…' : 'Send to admin'}</button>
          </aside>
        </div>
      )}

      {view === 'recount' && (
        <div className="fxFix enter">
          <section className="panel fxPick">
            <label className="fxSearch sm"><Icon name="search" size={18} /><input autoFocus value={iq} onChange={(e) => setIq(e.target.value)} placeholder="Find the item you counted" aria-label="Find item" /></label>
            <div className="fxItems">
              {shownItems.map((b) => (
                <button key={b.item_id} className={`fxItem ${b.item_id === itemId ? 'on' : ''}`} onClick={() => { setItemId(b.item_id); setCounted(''); setErr(''); }}>
                  <span>{b.name}</span><b className="mono">{fmt(b.balance)}</b><small>{b.unit}</small>
                </button>
              ))}
              {!shownItems.length && <div className="pad muted">No item matches.</div>}
            </div>
          </section>
          <aside className="panel fxEffect">
            {!bal ? <span className="muted">Pick the item on the left.</span> : (
              <>
                <b>{bal.name}</b>
                <div className="fxCount">
                  <div><span>The app says</span><b className="mono">{fmt(bal.balance)}</b><small>{bal.unit}</small></div>
                  <label><span>You counted</span><input className="input num" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus /></label>
                </div>
                {counted !== '' && diff !== 0 && <div className={`note ${diff < 0 ? 'err' : 'ok'}`}><b>{fmt(Math.abs(diff))} {bal.unit} {diff < 0 ? 'missing' : 'extra'}</b></div>}
                <div className="fxWhy"><span>What happened?</span><Chips options={COUNT_REASONS} value={reason} onPick={setReason} />
                  <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. 3 bags hardened after rain" /></div>
                {err && <div className="note err" role="alert">{err}</div>}
                <button className="btn dark" disabled={busy} onClick={sendRecount}>{busy ? 'Sending…' : 'Send to admin'}</button>
              </>
            )}
          </aside>
        </div>
      )}

      {view === 'mine' && (
        <section className="panel fxReqs enter">
          {!mine.length && <div className="pad muted">No requests yet.</div>}
          {mine.map((m) => {
            const it = itemById.get(m.item_id);
            const st = m.status === 'pending' ? 'Waiting for admin' : m.status === 'approved' ? 'Approved' : 'Rejected';
            return (
              <div key={m.id} className="fxReq">
                <span className={`fxDot ${m.status}`} aria-hidden />
                <span className="fxWhat"><b>{m.kind === 'fix' ? 'Fix' : 'Recount'} · {it?.name}</b><small>{m.reason}{m.note ? ` · ${m.note}` : ''}{m.decision_note ? ` · Admin: ${m.decision_note}` : ''}</small></span>
                <span className="mono">{fmt(m.from_qty)} → {fmt(m.to_qty)} <small>{it?.unit}</small></span>
                <span className="fxDate">{niceDate(m.created_at.slice(0, 10))}</span>
                <span className={`stPill ${m.status === 'approved' ? 'ok' : m.status === 'rejected' ? 'out' : 'low'}`}>{st}</span>
              </div>
            );
          })}
        </section>
      )}

      {sent && createPortal(
        <div className="sheetBack dayAskBack">
          <section className="dayAsk fixAgain" role="dialog" aria-modal="true" aria-labelledby="againTitle">
            <div className="faSent"><span className="faTick" aria-hidden>✓</span><div><b>Sent to the admin</b><small>{sent} · waiting for approval</small></div></div>
            <h2 id="againTitle">Fix another error?</h2>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn dark" onClick={() => { setSent(null); toFind(); }}>Yes, find another</button>
              <button className="btn ghost" onClick={() => { setSent(null); go('home'); }}>No, I’m done</button>
            </div>
          </section>
        </div>, document.body)}
    </div>
  );
}
