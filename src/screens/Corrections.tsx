import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmt, Top } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import { currentScreen, goBack } from '../lib/nav';
import type { CorrectionRequest, Doc } from '../lib/types';

type Tab = 'pick' | 'fix' | 'recount' | 'mine';
type CatKey = 'deliveries' | 'issued' | 'returns' | 'transfers';
const FIX_REASONS = ['Typing mistake', 'Wrong item', 'Wrong card / note number', 'Other'];
const COUNT_REASONS = ['Damaged / spoilt', 'Lost / not found', 'Delivery not entered', 'Issue not entered', 'Counting error'];
/** The four places an error can be, in the same colours as everywhere else in the app. */
const CATS: { key: CatKey; label: string; tag: string; kinds: Doc['kind'][]; doc: string; numLabel: string; eg: string; icon: string }[] = [
  { key: 'deliveries', label: 'Deliveries', tag: 'Stock in', kinds: ['delivery'], doc: 'A delivery note was entered wrong', numLabel: 'Delivery note no.', eg: 'e.g. wrong quantity on DN 0421', icon: 'M12 4v12M6 10l6 6 6-6M5 20h14' },
  { key: 'issued', label: 'Issued to production', tag: 'Stock out', kinds: ['issue'], doc: 'A withdrawal card was entered wrong', numLabel: 'Card no.', eg: 'e.g. card 5131 says 10, typed 12', icon: 'M12 20V8M6 14l6-6 6 6M5 4h14' },
  { key: 'returns', label: 'Returned to store', tag: 'Back in', kinds: ['return'], doc: 'A return was entered wrong', numLabel: 'Card no.', eg: 'e.g. 3 bags came back, not 5', icon: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  { key: 'transfers', label: 'Project transfers', tag: 'In / out', kinds: ['transfer_in', 'transfer_out'], doc: 'A transfer note was entered wrong', numLabel: 'Transfer note no.', eg: 'e.g. sent 20 Pcs to Astana, not 25', icon: 'M4 8h14l-4-4M20 16H6l4 4' },
];
const OUT_KINDS = ['issue', 'transfer_out'];
const CatIcon = ({ d, size = 20 }: { d: string; size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;

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
  const { day, go, itemById, balances, balanceOf, refresh } = useData();
  const [tab, setTab] = useState<Tab>('pick');
  const [cat, setCat] = useState<CatKey | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [mine, setMine] = useState<CorrectionRequest[]>([]);
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [itemId, setItemId] = useState<number | null>(null);
  const [counted, setCounted] = useState('');
  const [q, setQ] = useState('');
  const [num, setNum] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const loadMine = () => api.myCorrections().then(setMine).catch(() => setMine([]));
  useEffect(() => {
    api.documents(addDays(day, -29), day).then((ds) => setDocs(ds.filter((d) => d.kind !== 'correction' && d.kind !== 'opening')));
    loadMine();
  }, [day]);

  const pendingLines = useMemo(() => new Set(mine.filter((m) => m.status === 'pending' && m.movement_id).map((m) => m.movement_id)), [mine]);
  const waiting = mine.filter((m) => m.status === 'pending').length;
  const C = CATS.find((c) => c.key === cat);
  const list = useMemo(() => {
    if (!C) return [];
    const n = num.trim().toLowerCase();
    return (docs ?? []).filter((d) => C.kinds.includes(d.kind) && (!n || (d.ref_no ?? '').toLowerCase().includes(n)))
      .sort((a, b) => b.doc_date.localeCompare(a.doc_date) || b.created_at.localeCompare(a.created_at));
  }, [docs, C, num]);

  const reset = () => { setVals({}); setReason(''); setNote(''); setErr(''); setCounted(''); };
  const pickCat = (k: CatKey) => { setCat(k); setTab('fix'); setOpenDoc(null); setNum(''); reset(); setMsg(''); setSent(null); };
  const toTab = (t: Tab) => { setTab(t); setErr(''); setMsg(''); setOpenDoc(null); reset(); };
  const docTitle = (d: Doc) => `${KIND_LABEL[d.kind] ?? d.kind}${d.ref_no ? ` ${d.ref_no}` : ''}${d.party ? ` · ${d.party}` : ''}`;
  const sign = (d: Doc) => (OUT_KINDS.includes(d.kind) ? -1 : 1);

  const changed = openDoc ? openDoc.lines.filter((l) => vals[l.id] !== undefined && vals[l.id] !== '' && Number(vals[l.id]) !== l.qty) : [];
  const sendFix = async () => {
    if (!openDoc) return;
    if (!changed.length) { setErr('Type the number from the paper on the line that is wrong.'); return; }
    if (!reason) { setErr('Choose why it was wrong.'); return; }
    setBusy(true); setErr('');
    try {
      for (const l of changed) {
        await api.requestCorrection({ kind: 'fix', movement_id: l.id, item_id: l.item_id, from_qty: l.qty, to_qty: Number(vals[l.id]), reason, note: note.trim() || null });
      }
      await loadMine();
      const l0 = changed[0]; const it = itemById.get(l0.item_id);
      setSent(`${docTitle(openDoc)} · ${it?.name} ${fmt(l0.qty)} → ${fmt(Number(vals[l0.id]))} ${it?.unit ?? ''}${changed.length > 1 ? ` and ${changed.length - 1} more` : ''}`);
      reset(); setOpenDoc(null);
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
  const back = () => (tab === 'fix' && openDoc ? (setOpenDoc(null), reset()) : tab !== 'pick' ? toTab('pick') : goBack(go, currentScreen()));
  const backLabel = tab === 'fix' && openDoc ? 'Pick another entry' : tab !== 'pick' ? 'What to fix' : undefined;

  return (
    <div className="phone fixPage">
      <Top onBack={back} backLabel={backLabel} title="Fix an error" sub="Every change goes to the admin for approval. Nothing is deleted." />
      <main className="body">
        {msg && <div className="note ok enter" role="status">{msg}</div>}

        {tab === 'pick' && (
          <div className="stack enter">
            <h2 className="fixQ">What do you want to fix?</h2>
            <div className="fixCats">
              {CATS.map((c) => (
                <button key={c.key} className={`fixCat ${c.key}`} onClick={() => pickCat(c.key)}>
                  <span className="fcBand"><span className="fcIco"><CatIcon d={c.icon} /></span><b>{c.label}</b><span className="fcTagc">{c.tag}</span></span>
                  <span className="fcBody"><span>{c.doc}</span><small>{c.eg}</small></span>
                </button>
              ))}
            </div>
            <div className="fixSafe"><b>✓ Nothing changes until the admin approves.</b> Nothing is ever deleted.</div>
            <div className="between small">
              <span className="muted">The shelf doesn’t match the app? <button className="btn link inline" onClick={() => toTab('recount')}>Recount an item</button></span>
              <button className="btn link" onClick={() => toTab('mine')}>My requests{waiting ? ` (${waiting} waiting)` : ''}</button>
            </div>
          </div>
        )}

        {tab === 'fix' && C && (
          <div className="stack enter">
            <div className={`fixStrip ${C.key}`}><span className="fcIco"><CatIcon d={C.icon} size={18} /></span><b>Fixing: {C.label}</b><button className="btn link" onClick={() => toTab('pick')}>Change</button></div>
            <div className="fixGrid">
              <aside className="fixFind">
                <label className="field"><span>{C.numLabel}</span>
                  <input className="input mono" value={num} onChange={(e) => setNum(e.target.value)} placeholder="Number on the paper" autoFocus />
                </label>
                <span className="fixListHead">{num.trim() ? `${list.length} found` : 'Or pick a recent one'}</span>
                {docs === null && <span className="muted small">Loading…</span>}
                {docs !== null && !list.length && <span className="muted small">Nothing in the last 30 days{num.trim() ? ' with that number' : ''}.</span>}
                <div className="fixList">
                  {list.slice(0, 30).map((d) => (
                    <button key={d.id} className={`fixDoc ${openDoc?.id === d.id ? 'on' : ''}`} onClick={() => { reset(); setOpenDoc(d); }}>
                      <b className="mono">{KIND_LABEL[d.kind]}{d.ref_no ? ` ${d.ref_no}` : ''}</b>
                      <span>{niceDate(d.doc_date)}{[d.party, d.activity, d.gemba].filter(Boolean).length ? ` · ${[d.party, d.activity, d.gemba].filter(Boolean).join(' · ')}` : ''}</span>
                      {d.lines.some((l) => pendingLines.has(l.id)) && <span className="pill">Fix waiting</span>}
                    </button>
                  ))}
                </div>
              </aside>

              {!openDoc ? (
                <div className="fixEmpty">Pick the {C.key === 'issued' ? 'card' : 'note'} on the left. The saved entry will show next to what the paper says.</div>
              ) : (
                <div className="stack">
                  <div className="fixCompare">
                    <section className="fixCol app">
                      <header><span aria-hidden>🔒</span><div><b>What the app has</b><small>{docTitle(openDoc)} · {niceDate(openDoc.doc_date)} · locked</small></div></header>
                      {openDoc.lines.map((l) => { const it = itemById.get(l.item_id); return <div key={l.id} className="fixRow"><span>{it?.name}</span><span className="mono">{fmt(l.qty)}</span><span className="u">{it?.unit}</span></div>; })}
                    </section>
                    <span className="fixArrow" aria-hidden>→</span>
                    <section className="fixCol paper">
                      <header><span aria-hidden>✎</span><div><b>What the paper says</b><small>Change only what is different</small></div></header>
                      {openDoc.lines.map((l) => {
                        const it = itemById.get(l.item_id);
                        const v = vals[l.id] ?? String(l.qty);
                        const ch = v !== '' && Number(v) !== l.qty;
                        return (
                          <div key={l.id} className={`fixRow ${ch ? 'changed' : ''}`}>
                            <span>{it?.name}</span>
                            {pendingLines.has(l.id) ? <span className="pill">Fix waiting</span>
                              : <input className="input num" inputMode="decimal" aria-label={`${it?.name} on the paper`} value={v} onChange={(e) => setVals({ ...vals, [l.id]: e.target.value.replace(/[^0-9.]/g, '') })} />}
                            <span className="u">{it?.unit}</span>
                          </div>
                        );
                      })}
                    </section>
                  </div>
                  <div className="fixSummary">
                    {changed.length ? (
                      <div className="stack" style={{ gap: 4 }}>
                        <b>{changed.length} change{changed.length === 1 ? '' : 's'} found</b>
                        {changed.map((l) => {
                          const it = itemById.get(l.item_id); const to = Number(vals[l.id]); const eff = (to - l.qty) * sign(openDoc);
                          return <span key={l.id}>{it?.name} <span className="mono">{fmt(l.qty)} → {fmt(to)} {it?.unit}</span> · store {eff > 0 ? '+' : '−'}{fmt(Math.abs(eff))} {it?.unit} after approval (now {fmt(balanceOf(l.item_id))})</span>;
                        })}
                      </div>
                    ) : <span className="muted">No changes yet. Type the number from the paper on the line that is wrong.</span>}
                    <div className="field"><span>Why was it wrong?</span><Chips options={FIX_REASONS} value={reason} onPick={setReason} /></div>
                    <label className="field"><span>Note (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the card says 10, I typed 12" /></label>
                  </div>
                  {err && <div className="note err" role="alert">{err}</div>}
                  <button className="btn accent" disabled={busy || !changed.length} onClick={sendFix}>{busy ? 'Sending…' : changed.length ? `Send ${changed.length} change${changed.length === 1 ? '' : 's'} to admin` : 'Send to admin'}</button>
                </div>
              )}
            </div>
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

      {sent && createPortal(
        <div className="sheetBack dayAskBack">
          <section className="dayAsk fixAgain" role="dialog" aria-modal="true" aria-labelledby="againTitle">
            <div className="faSent"><span className="faTick" aria-hidden>✓</span><div><b>Sent to the admin</b><small>{sent} · waiting for approval</small></div></div>
            <h2 id="againTitle">Do you want to fix another error?</h2>
            <span className="muted">Pick where it is, or finish here.</span>
            <div className="faCats">
              {CATS.map((c) => <button key={c.key} className={`faCat ${c.key}`} onClick={() => pickCat(c.key)}><span className="fcIco"><CatIcon d={c.icon} size={17} /></span><b>{c.label}</b><span aria-hidden>›</span></button>)}
            </div>
            <button className="btn ghost" onClick={() => { setSent(null); go('home'); }}>No, I’m done</button>
          </section>
        </div>, document.body)}
    </div>
  );
}
