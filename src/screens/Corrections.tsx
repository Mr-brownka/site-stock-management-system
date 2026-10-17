import { useEffect, useMemo, useState } from 'react';
import { fmt, Top } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { CorrectionRequest, Doc, Submission } from '../lib/types';

type Tab = 'fix' | 'recount' | 'mine';
const FIX_REASONS = ['Typing mistake', 'Wrong item', 'Wrong card / note number', 'Other'];
const COUNT_REASONS = ['Damaged / spoilt', 'Lost / not found', 'Delivery not entered', 'Issue not entered', 'Counting error'];
const KIND_LABEL: Record<string, string> = { delivery: 'Delivery', issue: 'Card', return: 'Return', transfer_in: 'Received', transfer_out: 'Sent', opening: 'Opening count' };

function Chips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }} role="group">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onPick(o)}
          style={{ minHeight: 40, padding: '0 12px', borderRadius: 99, border: `1px solid ${value === o ? 'var(--accent)' : '#C9CFCB'}`, background: value === o ? 'var(--accent-soft)' : '#fff', fontWeight: 600 }}>{o}</button>
      ))}
    </div>
  );
}

export function Corrections() {
  const { day, go, itemById, balances, refresh } = useData();
  const [tab, setTab] = useState<Tab>('fix');
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [subs, setSubs] = useState<Record<string, Submission | null>>({});
  const [mine, setMine] = useState<CorrectionRequest[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [counted, setCounted] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMine = () => api.myCorrections().then(setMine).catch(() => setMine([]));
  useEffect(() => {
    api.documents(addDays(day, -29), day).then(async (ds) => {
      const list = ds.filter((d) => d.kind !== 'correction');
      setDocs(list);
      const days = [...new Set(list.map((d) => d.doc_date))];
      const pairs = await Promise.all(days.map(async (d) => [d, await api.submission(d).catch(() => null)] as const));
      setSubs(Object.fromEntries(pairs));
    });
    loadMine();
  }, [day]);

  const pendingLines = useMemo(() => new Set(mine.filter((m) => m.status === 'pending' && m.movement_id).map((m) => m.movement_id)), [mine]);
  const days = useMemo(() => {
    const m = new Map<string, Doc[]>();
    (docs ?? []).forEach((d) => m.set(d.doc_date, [...(m.get(d.doc_date) ?? []), d]));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [docs]);

  const reset = () => { setVals({}); setReason(''); setNote(''); setErr(''); setCounted(''); };
  const docTitle = (d: Doc) => `${KIND_LABEL[d.kind] ?? d.kind}${d.ref_no ? ` ${d.ref_no}` : ''}${d.party ? ` · ${d.party}` : ''}`;

  const sendFix = async () => {
    if (!openDoc) return;
    const changed = openDoc.lines.filter((l) => vals[l.id] !== undefined && vals[l.id] !== '' && Number(vals[l.id]) !== l.qty);
    if (!changed.length) { setErr('Type the correct quantity on the line that is wrong.'); return; }
    if (!reason) { setErr('Choose why it was wrong.'); return; }
    setBusy(true); setErr('');
    try {
      for (const l of changed) {
        await api.requestCorrection({ kind: 'fix', movement_id: l.id, item_id: l.item_id, from_qty: l.qty, to_qty: Number(vals[l.id]), reason, note: note.trim() || null });
      }
      await loadMine(); reset(); setOpenDoc(null); setOpenDay(null); setTab('mine');
      setMsg(`Sent to the admin for approval. Balances change only after approval.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const bal = balances.find((b) => b.item_id === itemId);
  const sendRecount = async () => {
    if (!bal) { setErr('Pick the item you counted.'); return; }
    if (counted === '' || Number(counted) === bal.balance) { setErr('Type what you counted. It must be different from the system number.'); return; }
    if (!reason) { setErr('Choose what happened.'); return; }
    setBusy(true); setErr('');
    try {
      await api.requestCorrection({ kind: 'recount', item_id: bal.item_id, from_qty: bal.balance, to_qty: Number(counted), reason, note: note.trim() || null });
      await loadMine(); reset(); setItemId(null); setTab('mine'); refresh();
      setMsg('Recount sent to the admin for approval.');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const shownItems = balances.filter((b) => !q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 40);
  const diff = bal && counted !== '' ? Number(counted) - bal.balance : 0;

  return (
    <div className="phone">
      <Top onBack={() => (openDoc ? (setOpenDoc(null), reset()) : openDay ? setOpenDay(null) : go('home'))} title="Fix a mistake" sub="Every change goes to the admin for approval. Nothing is deleted." />
      <main className="body">
        <div className="seg" role="tablist" style={{ display: 'flex' }}>
          {([['fix', 'Fix an entry'], ['recount', 'Recount'], ['mine', `My requests${mine.some((m) => m.status === 'pending') ? ` (${mine.filter((m) => m.status === 'pending').length})` : ''}`]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} role="tab" aria-pressed={tab === t} style={{ flex: 1 }} onClick={() => { setTab(t); setErr(''); setMsg(''); setOpenDay(null); setOpenDoc(null); reset(); }}>{l}</button>
          ))}
        </div>
        {msg && <div className="note ok enter" role="status">{msg}</div>}

        {tab === 'fix' && !openDay && (
          <div className="stack enter">
            <div className="note info">Pick the day, then the card or note with the mistake. For today’s entries that aren’t submitted yet, just remove and re-enter them in the check-in.</div>
            {docs === null ? <div className="muted">Loading…</div> : !days.length ? <div className="card pad muted">No entries in the last 30 days.</div> : (
              <div className="card" style={{ overflow: 'hidden' }}>
                {days.map(([d, list]) => (
                  <button key={d} className="step" onClick={() => setOpenDay(d)}>
                    <span style={{ flex: 1 }}><b style={{ display: 'block' }}>{niceDate(d)}</b><span className="small muted">{list.length} {list.length === 1 ? 'entry' : 'entries'}</span></span>
                    <span className={`pill ${subs[d] ? 'done' : ''}`}>{subs[d] ? 'Submitted' : 'Not submitted'}</span>
                    <span aria-hidden>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'fix' && openDay && !openDoc && (
          <div className="stack enter">
            <div className="label">{niceDate(openDay)} · tap the entry with the mistake</div>
            {days.find(([d]) => d === openDay)?.[1].map((d) => (
              <button key={d.id} className={`sumCard ${d.kind === 'issue' || d.kind === 'transfer_out' ? 'out' : d.kind === 'transfer_in' ? 'in' : ''}`} style={{ textAlign: 'left' }} onClick={() => { reset(); setOpenDoc(d); }}>
                <div className="between"><b>{docTitle(d)}</b>{d.lines.some((l) => pendingLines.has(l.id)) && <span className="pill">Correction waiting</span>}</div>
                {d.lines.map((l) => <div className="ln" key={l.id}><span>{itemById.get(l.item_id)?.name}</span><span className="mono">{fmt(l.qty)} {itemById.get(l.item_id)?.unit}</span></div>)}
              </button>
            ))}
          </div>
        )}

        {tab === 'fix' && openDoc && (
          <div className="stack enter">
            <div className="label">{docTitle(openDoc)} · {niceDate(openDoc.doc_date)}</div>
            {openDoc.lines.map((l) => {
              const it = itemById.get(l.item_id);
              const v = vals[l.id] ?? '';
              const waiting = pendingLines.has(l.id);
              return (
                <div key={l.id} className="card pad stack">
                  <div className="between"><b>{it?.name}</b><span className="small muted">entered {fmt(l.qty)} {it?.unit}</span></div>
                  {waiting ? <span className="pill" style={{ alignSelf: 'flex-start' }}>A correction for this line is already waiting</span> : (
                    <label className="field"><span>Correct quantity (leave empty if this line is right)</span>
                      <input className="input num" inputMode="decimal" value={v} placeholder={String(l.qty)} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value.replace(/[^0-9.]/g, '') })} />
                    </label>
                  )}
                  {v !== '' && Number(v) !== l.qty && <div className="mono small" style={{ color: 'var(--accent-dark)' }}>{fmt(l.qty)} → {fmt(Number(v))} {it?.unit}</div>}
                </div>
              );
            })}
            <div className="field"><span>Why was it wrong?</span><Chips options={FIX_REASONS} value={reason} onPick={setReason} /></div>
            <label className="field"><span>Note (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the card says 10, I typed 12" /></label>
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy} onClick={sendFix}>{busy ? 'Sending…' : 'Send to admin for approval'}</button>
          </div>
        )}

        {tab === 'recount' && (
          <div className="stack enter">
            <div className="note info">Use this when the shelf doesn’t match the app and it isn’t one entry’s fault (spoilt, lost, never entered).</div>
            {!bal ? (
              <>
                <input className="search" type="search" placeholder="Find the item you counted" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find item" />
                <div className="list">
                  {shownItems.map((b) => (
                    <button key={b.item_id} className="listRow" onClick={() => { setItemId(b.item_id); setCounted(''); }}>
                      <span className="nm">{b.name}</span><span className="q">{fmt(b.balance)}</span><span className="u">{b.unit}</span>
                    </button>
                  ))}
                  {!shownItems.length && <div className="pad muted">No items in this store yet.</div>}
                </div>
              </>
            ) : (
              <>
                <div className="between"><b style={{ fontSize: 18 }}>{bal.name}</b><button className="btn link" onClick={() => setItemId(null)}>Change item</button></div>
                <div className="card pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
                  <div><div className="label">System says</div><div className="mono" style={{ fontSize: 28, fontWeight: 600 }}>{fmt(bal.balance)}</div><div className="small muted">{bal.unit}</div></div>
                  <label className="field"><span>You counted</span><input className="input num" style={{ fontSize: 24, minHeight: 56 }} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus /></label>
                </div>
                {counted !== '' && diff !== 0 && <div className={`note ${diff < 0 ? 'err' : 'ok'}`}><b>{fmt(Math.abs(diff))} {bal.unit} {diff < 0 ? 'missing' : 'extra'}</b></div>}
                <div className="field"><span>What happened?</span><Chips options={COUNT_REASONS} value={reason} onPick={setReason} /></div>
                <label className="field"><span>Note (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 bags hardened after rain" /></label>
                {err && <div className="note err" role="alert">{err}</div>}
                <button className="btn accent" disabled={busy} onClick={sendRecount}>{busy ? 'Sending…' : 'Send to admin for approval'}</button>
              </>
            )}
          </div>
        )}

        {tab === 'mine' && (
          <div className="stack enter">
            {!mine.length && <div className="card pad muted">No correction requests yet.</div>}
            {mine.map((m) => {
              const it = itemById.get(m.item_id);
              return (
                <div key={m.id} className="sumCard" style={{ borderLeftColor: m.status === 'approved' ? 'var(--ok)' : m.status === 'rejected' ? 'var(--error)' : 'var(--accent)' }}>
                  <div className="between"><b>{m.kind === 'fix' ? 'Fix' : 'Recount'} · {it?.name}</b><span className={`pill ${m.status === 'approved' ? 'done' : ''}`}>{m.status === 'pending' ? 'Waiting for admin' : m.status === 'approved' ? 'Approved' : 'Rejected'}</span></div>
                  <div className="mono small">{fmt(m.from_qty)} → {fmt(m.to_qty)} {it?.unit}</div>
                  <div className="small muted">{m.reason}{m.note ? ` · ${m.note}` : ''} · {niceDate(m.created_at.slice(0, 10))}</div>
                  {m.decision_note && <div className="small"><b>Admin:</b> {m.decision_note}</div>}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
