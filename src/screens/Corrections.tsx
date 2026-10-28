import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt } from '../components/ui';
import { Icon } from '../components/fx';
import { BackPill } from '../components/BackPill';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { CorrectionRequest, Doc, DocField, EditChanges, Item } from '../lib/types';
import { deleteEffects, describeEdit, fieldLabel, paperName, requestTitle } from '../lib/editFix';
import { toast } from '../components/feedback';
import { ItemPicker, Suggest } from '../components/ui';
import { DateRange } from '../components/DateRange';

type View = 'find' | 'fix' | 'recount' | 'mine';
type KindKey = 'all' | 'deliveries' | 'issued' | 'returns' | 'transfers';
const FIX_REASONS = ['Typing mistake', 'Wrong date', 'Wrong item', 'Wrong card / note', 'Other'];
const DEL_REASONS = ['Entered twice', 'Never happened', 'Wrong project', 'Test entry', 'Other'];

/** Delete an entry entirely: shows what each balance goes back to, asks why, then deletes (admin) or asks the admin. */
function DeleteSheet({ doc, admin, onClose, onDone }: { doc: Doc; admin: boolean; onClose: () => void; onDone: (r: 'deleted' | 'asked') => void }) {
  const { itemById, balances } = useData();
  const [why, setWhy] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const eff = deleteEffects(doc.kind, doc.lines, (id) => itemById.get(id));
  const bal = (id: number) => balances.find((b) => b.item_id === id)?.balance;
  const go = async () => {
    setBusy(true); setErr('');
    try { onDone(await api.deleteEntry(doc.id, why, note.trim() || null)); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dayAsk delSheet" role="dialog" aria-modal="true" aria-labelledby="delTitle">
        <span className="delKick"><Icon name="trash" size={15} />Delete entry</span>
        <h2 id="delTitle">Delete {paperName(doc)} of {niceDate(doc.doc_date)}?</h2>
        <div className="delTbl">
          <div className="th"><span>Item</span><span>Now</span><span>After</span></div>
          {eff.map((e) => { const b = bal(e.item_id); return (
            <div key={e.item_id}><span>{e.name}</span><span className="mono muted">{b != null ? fmt(b) : '—'}</span>
              <b className={`mono ${e.change > 0 ? 'up' : 'down'}`}>{b != null ? fmt(b + e.change) : '—'} <small>{e.change > 0 ? '+' : '−'}{fmt(Math.abs(e.change))} {e.unit}</small></b></div>); })}
        </div>
        <span className="delQ">Why? <small>(one tap)</small></span>
        <div className="incRmWhy">{DEL_REASONS.map((r) => <button key={r} type="button" aria-pressed={why === r} onClick={() => setWhy(r)}>{r}</button>)}</div>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        {err && <div className="note err" role="alert">{err}</div>}
        <small className="muted">{admin ? 'The entry and its lines are removed and the balances go back. A copy stays in Your fixes.' : 'Nothing is removed until the admin approves. A copy stays on the request.'}</small>
        <div className="incRmActs"><button className="btn ghost" onClick={onClose}>Keep it</button>
          <button className="btn danger" disabled={!why || busy} onClick={go}>{busy ? 'Deleting…' : admin ? 'Delete entry' : 'Send to admin'}</button></div>
      </section>
    </div>, document.body);
}
const CAT_TITLE: Record<string, string> = { issued: 'Issuance registers', deliveries: 'Deliveries', returns: 'Returns', transfers: 'Project transfers' };
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
  const { day, go, itemById, balances, refresh, user } = useData();
  const [delDoc, setDelDoc] = useState<Doc | null>(null);
  const [view, setView] = useState<View>('find');
  const [kind, setKind] = useState<KindKey>('all');
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [mine, setMine] = useState<CorrectionRequest[]>([]);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [, setVals] = useState<Record<number, string>>({});
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
  const itemOf = (id: number) => itemById.get(id);
  const docById = useMemo(() => new Map((docs ?? []).map((d) => [d.id, d])), [docs]);
  const pendingDocs = useMemo(() => new Set(mine.filter((m) => m.status === 'pending' && m.document_id).map((m) => m.document_id!)), [mine]);
  const waitingOn = (d: Doc) => pendingDocs.has(d.id) || d.lines.some((l) => pendingLines.has(l.id));

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
    ? { title: `${paperTitle(openDoc)} · ${niceDate(openDoc.doc_date)}`, lead: `${sysRef(openDoc)} · tap any box to change it, the date too` }
    : view === 'recount' ? { title: 'Recount an item', lead: 'When the shelf doesn’t match the app and no single entry is to blame.' }
      : view === 'mine' ? { title: 'My requests', lead: 'Everything you sent to the admin, and what they decided.' }
        : { title: 'Fix an error', lead: 'Find the entry, say what the paper says. Fix it, or delete it with the bin icon.' };

  return (
    <div className="page fxPage">
      {view === 'find' ? <BackPill /> : <BackPill label="Fix an error" onClick={toFind} />}
      <header className="pageHead enter">
        <div className="phText"><h1>{head.title}</h1><span className="phLead">{head.lead}</span></div>
      </header>

      {view === 'find' && (
        <div className="fxHome enter">
          <div className="fxHomeMain">
            <section className="fxFind2">
              <label className="fxSearch big">
                <Icon name="search" size={20} />
                <input ref={findRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Card no., delivery note, item or date" aria-label="Find the entry" />
                {q && <button className="fxClear" onClick={() => { setQ(''); findRef.current?.focus(); }} aria-label="Clear">×</button>}
              </label>
              <div className="fxKinds">
                {KINDS.map((k) => <button key={k.key} className={`fxKind ${k.key}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>{k.key === 'all' ? 'All' : k.label}{k.key !== 'all' && docs && <span className="mono">{docs.filter((d) => k.kinds.includes(d.kind)).length}</span>}</button>)}
              </div>
            </section>
            {docs === null && <div className="panel pad muted">Loading…</div>}
            {docs !== null && !matches.length && <div className="panel pad muted">{s ? `Nothing matches “${q}” in the last ${LOOKBACK} days.` : 'No entries yet.'}</div>}
            {['issued', 'deliveries', 'returns', 'transfers'].map((key) => KINDS.find((k) => k.key === key)!).filter((k) => kind === 'all' || kind === k.key).map((k) => {
              const list = matches.filter((d) => k.kinds.includes(d.kind));
              if (!list.length) return null;
              const cap = kind === 'all' && !s ? 8 : 60;
              return (
                <section key={k.key} className={`fxCat ${k.key}`} aria-label={k.label}>
                  <header><span className="fxCatDot" aria-hidden="true" /><b>{CAT_TITLE[k.key]}</b><span className="mono">{list.length}</span>
                    {list.length > cap && <button className="btn link" onClick={() => setKind(k.key)}>Show all {list.length} →</button>}</header>
                  <div className="fxCards">
                    {list.slice(0, cap).map((d) => (
                      <div key={d.id} className="fxCardWrap">
                      <button className={`fxCard ${TONE[d.kind]}`} onClick={() => openFix(d)}>
                        <span className="fxCTop"><span className="fxCK">{PAPER[d.kind]?.replace(' on card', '') ?? 'Entry'}</span><small className="mono">{sysRef(d)}</small></span>
                        <b className={`fxCNo ${d.kind === 'issue' ? 'red' : ''}`}>{d.ref_no || (d.kind === 'delivery' ? d.party : d.kind === 'issue' ? 'Register' : '–') || '–'}</b>
                        <span className="fxCL">{linesText(d)}</span>
                        <small className="fxCS">{niceDate(d.doc_date)}{who(d) ? ` · ${who(d)}` : ''}</small>
                        {waitingOn(d) && <span className="fxCW">Fix waiting</span>}
                      </button>
                      <button type="button" className="fxDel" title="Delete this entry" aria-label={`Delete ${paperName(d)} of ${niceDate(d.doc_date)}`} onClick={() => setDelDoc(d)}><Icon name="trash" size={15} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <aside className="fxSide">
            <section className="panel fxYours">
              <header><b>Your fixes</b>{mine.length > 0 && <button className="btn link" onClick={() => setView('mine')}>All {mine.length}</button>}</header>
              {!mine.length && <span className="muted small">Nothing sent yet.</span>}
              {mine.slice(0, 5).map((m) => (
                <div key={m.id} className="fxYour">
                  <span><b>{requestTitle(m, itemOf, m.document_id ? docById.get(m.document_id) : undefined)}</b><small>Sent {niceDate(m.created_at.slice(0, 10))}</small></span>
                  <span className={`stPill ${m.status === 'approved' ? 'ok' : m.status === 'rejected' ? 'out' : 'low'}`}>{m.status === 'pending' ? 'Waiting' : m.status === 'approved' ? 'Approved' : 'Not approved'}</span>
                </div>
              ))}
              {(waiting > 0 || approved > 0) && <small className="muted">{waiting} waiting{approved ? ` · ${approved} approved this month` : ''}</small>}
            </section>
            <button className="fxShelf" onClick={() => { reset(); setView('recount'); }}>
              <b>The shelf doesn’t match?</b><span>No paper is wrong, the count is. Recount one item instead.</span><em>Recount an item →</em>
            </button>
          </aside>
        </div>
      )}

      {view === 'fix' && openDoc && (
        <PaperFix key={openDoc.id} doc={openDoc} sysRef={sysRef(openDoc)} waiting={waitingOn(openDoc)}
          onSent={async (msg) => { await loadMine(); setSent(msg); }} onDelete={() => setDelDoc(openDoc)} />
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
            const st = m.status === 'pending' ? 'Waiting for admin' : m.status === 'approved' ? 'Approved' : 'Not approved';
            const doc = m.document_id ? docById.get(m.document_id) : undefined;
            const more = m.kind === 'edit' ? describeEdit(m.changes, itemOf, doc?.kind) : [];
            return (
              <div key={m.id} className="fxReq">
                <span className={`fxDot ${m.status}`} aria-hidden />
                <span className="fxWhat"><b>{requestTitle(m, itemOf, doc)}</b><small>{[...more.slice(1), m.reason, m.note, m.decision_note ? `Admin: ${m.decision_note}` : ''].filter(Boolean).join(' · ')}</small></span>
                <span className="fxDate">{niceDate(m.created_at.slice(0, 10))}</span>
                <span className={`stPill ${m.status === 'approved' ? 'ok' : m.status === 'rejected' ? 'out' : 'low'}`}>{st}</span>
              </div>
            );
          })}
        </section>
      )}

      {delDoc && <DeleteSheet doc={delDoc} admin={user.role === 'admin'} onClose={() => setDelDoc(null)} onDone={async (r) => {
        const d = delDoc; setDelDoc(null);
        if (r === 'deleted') { setDocs((ds) => ds && ds.filter((x) => x.id !== d.id)); await refresh(); toast(`${paperName(d)} deleted · balances are back`); if (view === 'fix') toFind(); }
        else toast('Sent to the admin to delete');
        await loadMine();
      }} />}

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

/* ───────── Fixing one paper: it looks like the paper, every box can change (the date too). ───────── */
const FIELDS: Record<string, DocField[]> = {
  issue: ['card_no', 'activity', 'ref_no', 'doc_time', 'gemba', 'party', 'doc_date', 'supervisor', 'authorised_by'],
  delivery: ['ref_no', 'party', 'doc_date', 'doc_time'],
  return: ['ref_no', 'party', 'gemba', 'doc_date', 'doc_time'],
  transfer_in: ['ref_no', 'party', 'authorised_by', 'doc_date'],
  transfer_out: ['ref_no', 'party', 'authorised_by', 'doc_date'],
};
const PAPER_NAME: Record<string, string> = { issue: 'Material Issuance Register', delivery: 'Delivery note', return: 'Return to store', transfer_in: 'Transfer note · received', transfer_out: 'Transfer note · sent' };

function PaperFix({ doc, sysRef, waiting, onSent, onDelete }: { doc: Doc; sysRef: string; waiting: boolean; onSent: (msg: string) => Promise<void>; onDelete: () => void }) {
  const { itemById, subphases, realToday, company } = useData();
  const [team, setTeam] = useState<string[]>([]);
  useEffect(() => { api.siteTeam().then(setTeam).catch(() => undefined); }, []);
  // A Material Issuance Register (no card no.) has only the date and the store person to fix.
  const reg = doc.kind === 'issue' && !doc.ref_no;
  const F: DocField[] = reg ? ['doc_date', 'authorised_by'] : FIELDS[doc.kind] ?? ['ref_no', 'party', 'doc_date'];
  const orig = (f: DocField) => { const v = (doc[f as keyof Doc] as string | null | undefined) ?? ''; return f === 'doc_time' ? v.slice(0, 5) : v; };
  const [hdr, setHdr] = useState<Record<string, string>>(() => Object.fromEntries(F.map((f) => [f, orig(f)])));
  const [ln, setLn] = useState<Record<number, { item: number; qty: string }>>(() => Object.fromEntries(doc.lines.map((l) => [l.id, { item: l.item_id, qty: String(l.qty) }])));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const docCh = F.filter((f) => hdr[f].trim() !== orig(f));
  const lineCh = doc.lines.filter((l) => ln[l.id].item !== l.item_id || (ln[l.id].qty !== '' && Number(ln[l.id].qty) !== l.qty));
  const changes: EditChanges = {
    doc: Object.fromEntries(docCh.map((f) => [f, [orig(f) || null, hdr[f].trim() || null]])),
    lines: lineCh.map((l) => ({ movement_id: l.id, from_item: l.item_id, from_qty: l.qty,
      ...(ln[l.id].item !== l.item_id ? { to_item: ln[l.id].item } : {}), ...(Number(ln[l.id].qty) !== l.qty ? { to_qty: Number(ln[l.id].qty) } : {}) })),
  };
  const nChanges = docCh.length + lineCh.length;
  const item = (id: number) => itemById.get(id);
  const list = describeEdit(changes, item, doc.kind);
  const autoReason = !reason && docCh.length === 1 && docCh[0] === 'doc_date' && !lineCh.length ? 'Wrong date' : reason;

  const send = async () => {
    if (!nChanges) { setErr('Change the box that is different from the paper.'); return; }
    if (doc.lines.some((l) => !(Number(ln[l.id].qty) > 0))) { setErr('Every line needs a quantity above 0.'); return; }
    if (docCh.includes('doc_date') && !hdr.doc_date) { setErr('Pick the date from the paper.'); return; }
    if (!autoReason) { setErr('Tap why it was wrong.'); return; }
    setBusy(true); setErr('');
    try {
      await api.requestCorrection({ kind: 'edit', document_id: doc.id, changes, movement_id: null, item_id: doc.lines[0]?.item_id ?? 0, from_qty: 0, to_qty: 0, reason: autoReason, note: note.trim() || null });
      await onSent(`${PAPER[doc.kind] ?? 'Entry'}${doc.ref_no ? ` ${doc.ref_no}` : ''} · ${list[0] ?? ''}${list.length > 1 ? ` and ${list.length - 1} more` : ''}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const box = (f: DocField, cls = '') => {
    const ch = hdr[f].trim() !== orig(f);
    const set = (v: string) => setHdr((h) => ({ ...h, [f]: v }));
    const was = f === 'doc_date' ? (orig(f) ? niceDate(orig(f)) : '') : orig(f);
    let input;
    if (f === 'doc_date') input = <DateRange single allLabel="" value={hdr[f] ? { from: hdr[f], to: hdr[f] } : null} max={realToday} onChange={(r) => set(r?.from ?? orig(f))} />;
    else if (f === 'gemba') input = <select className="pfIn" value={hdr[f]} onChange={(e) => set(e.target.value)}><option value="">—</option>{[...new Set([hdr[f], ...subphases].filter(Boolean))].map((x) => <option key={x}>{x}</option>)}</select>;
    else if (f === 'authorised_by' && doc.kind === 'issue') input = <Suggest bare showAll label={fieldLabel(f, doc.kind)} value={hdr[f]} onChange={set} options={team} inputClass="pfIn" />;
    else if (f === 'doc_time') input = <input className="pfIn mono" type="time" value={hdr[f]} onChange={(e) => set(e.target.value)} />;
    else input = <input className={`pfIn ${f === 'ref_no' && doc.kind === 'issue' ? 'red' : ''} ${f === 'card_no' ? 'red' : ''}`} value={hdr[f]} onChange={(e) => set(e.target.value)} />;
    return (
      <div className={`pfBox ${cls} ${ch ? 'ch' : ''}`} key={f}>
        <span className="pfL">{fieldLabel(f, doc.kind)}</span>
        {ch && <s className="pfWas">{was || '(empty)'}</s>}
        {input}
      </div>
    );
  };
  const lines = (
    <div className="pfLines">
      <div className="pfLh"><span>#</span><span>Item</span><span>Qty</span><span>Unit</span></div>
      {doc.lines.map((l, i) => {
        const v = ln[l.id]; const it = item(v.item); const chI = v.item !== l.item_id; const chQ = v.qty !== '' && Number(v.qty) !== l.qty;
        return (
          <div key={l.id} className="pfLr">
            <span className="pfN">{i + 1}</span>
            <div className={`pfCell ${chI ? 'ch' : ''}`}>{chI && <s className="pfWas">{item(l.item_id)?.name}</s>}
              <ItemPicker bare label="Item" item={(it as Item) ?? null} inputClass="pfIn" onPick={(x) => x && setLn((s) => ({ ...s, [l.id]: { ...s[l.id], item: x.id } }))} /></div>
            <div className={`pfCell r ${chQ ? 'ch' : ''}`}>{chQ && <s className="pfWas">{fmt(l.qty)}</s>}
              <input className="pfIn mono r" inputMode="decimal" value={v.qty} aria-label={`Quantity, line ${i + 1}`} onFocus={(e) => e.target.select()} onChange={(e) => setLn((s) => ({ ...s, [l.id]: { ...s[l.id], qty: e.target.value.replace(/[^0-9.]/g, '') } }))} /></div>
            <span className="pfU">{it?.unit}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fxFix pfWrap enter">
      <section className={`pfPaper ${doc.kind === 'issue' && !reg ? 'card' : ''}`} aria-label={PAPER_NAME[doc.kind]}>
        <div className="pfTitle">{reg ? `${(company || 'Comex Builders').toUpperCase()} · MATERIAL ISSUANCE REGISTER` : doc.kind === 'issue' ? `${(company || 'Comex Builders').toUpperCase()} · MATERIAL WITHDRAWAL CARD` : PAPER_NAME[doc.kind]?.toUpperCase()}<small className="mono">{sysRef}</small></div>
        {doc.kind === 'issue' && !reg ? (
          <>
            <div className="pfTop">{box('card_no', 'code')}{box('activity')}{box('ref_no', 'cardno')}</div>
            <div className="pfBody">{lines}<div className="pfSide">{box('doc_time')}{box('gemba')}{box('party')}{box('doc_date', 'date')}</div></div>
            <div className="pfApprove"><span>Approval</span><div>{box('supervisor')}{box('authorised_by')}</div></div>
          </>
        ) : (
          <>
            <div className="pfHead">{F.map((f) => box(f, f === 'doc_date' ? 'date' : ''))}</div>
            {lines}
          </>
        )}
        {waiting && <div className="note" role="status">A fix for this entry is already waiting for the admin. Send another only if it is about something else.</div>}
      </section>
      <aside className="panel fxEffect pfSideCard">
        <b>What changes {nChanges > 0 && <span className="pfCount">{nChanges}</span>}</b>
        {!nChanges && <span className="muted">Nothing yet. Tap the box that is different from the paper and type what the paper says.</span>}
        {list.map((t) => <div key={t} className="pfChange">{t}</div>)}
        {docCh.includes('doc_date') && hdr.doc_date && <div className="pfMove">Moves this entry to <b>{niceDate(hdr.doc_date)}</b>. Both days’ balances are worked out again once the admin approves.</div>}
        <div className="fxWhy"><span>Why? <small>(one tap)</small></span><Chips options={FIX_REASONS} value={autoReason} onPick={setReason} />
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. issued on the 22nd, typed on the 24th" /></div>
        {err && <div className="note err" role="alert">{err}</div>}
        <button className="btn accent" disabled={busy || !nChanges} onClick={send}>{busy ? 'Sending…' : `Send to admin${nChanges ? ` · ${nChanges} change${nChanges === 1 ? '' : 's'}` : ''}`}</button>
        <small className="muted">Nothing changes until the admin approves. The before and after of every box are kept on record.</small>
        <button type="button" className="pfDelete" onClick={onDelete}><Icon name="trash" size={16} />Delete this entry instead</button>
      </aside>
    </div>
  );
}
