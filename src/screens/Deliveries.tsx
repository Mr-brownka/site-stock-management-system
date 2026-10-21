import { useEffect, useMemo, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { LineTable } from '../components/LineTable';
import { Icon } from '../components/fx';
import { checkLines, enterNext, fmt, newLine, Suggest, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { focusMiss, LaterBar, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { toast } from '../components/feedback';
import { useData } from '../lib/store';

function DeliveryForm({ done, again }: { done: () => void; again: () => Promise<void> }) {
  const { day: today_, user, docsToday, itemById, go, refreshUnfinished } = useData();
  const draft = useDraft('deliveries');
  const day = draft?.doc_date ?? today_;
  const p = (draft?.payload ?? {}) as Record<string, string>;
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [past, setPast] = useState<{ party: string; ref: string; date: string }[]>([]);
  const [supplier, setSupplier] = useState(p.supplier ?? '');
  const [note, setNote] = useState(p.note ?? '');
  const [vehicle, setVehicle] = useState(p.vehicle ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => linesFromPayload(draft?.payload.lines, itemById));
  const [later, setLater] = useState<string[] | null>(null);
  const [flag, setFlag] = useState(false); // after a save attempt: highlight what is still empty
  const miss = (empty: boolean) => (flag && empty ? 'miss' : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { api.remembered('supplier').then(setSuppliers); }, []);
  useEffect(() => {
    api.documents(addDays(day, -180), day).then((ds) => setPast(ds.filter((d) => d.kind === 'delivery').map((d) => ({ party: d.party ?? '', ref: (d.ref_no ?? '').trim(), date: d.doc_date }))));
  }, [day, docsToday.length]);

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const dupe = note.trim() ? past.find((p) => norm(p.ref) === norm(note) && norm(p.party) === norm(supplier)) : undefined;
  const last = useMemo(() => past.filter((p) => norm(p.party) === norm(supplier)).sort((a, b) => b.date.localeCompare(a.date))[0], [past, supplier]);
  const used = lines.filter((l) => l.item || l.qty);
  const linesOk = used.length > 0 && !checkLines(lines, { subphase: true });
  const todays = docsToday.filter((d) => d.kind === 'delivery');

  const save = async (stay: boolean, confirmLater = false) => {
    // Quantities and duplicates must be right; other details can be confirmed later.
    const hard = dupe ? `${supplier} note ${note} was already entered on ${niceDate(dupe.date)}.` : checkLines(lines, {});
    setFlag(true);
    if (hard) { setErr(hard); setLater(null); focusMiss(); return; }
    const missing = [!supplier.trim() && 'party', !note.trim() && 'ref_no', used.some((l) => !l.subphase) && 'subphase'].filter(Boolean) as string[];
    if (missing.length && !confirmLater) { setErr(''); setLater(missing); return; }
    setBusy(stay ? 'again' : 'save'); setErr(''); setLater(null);
    try {
      await api.saveDocument({ kind: 'delivery', doc_date: day, ref_no: note.trim() || null, party: supplier.trim() || null, vehicle: vehicle.trim() || null, ...(missing.length ? { to_confirm: missing } : {}) },
        used.map((l) => ({ item_id: l.item!.id, qty: Number(l.qty), subphase: l.subphase || null })));
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      if (missing.length || draft) refreshUnfinished();
      if (stay) { await again(); setFlag(false); setSupplier(''); setNote(''); setVehicle(''); setLines([newLine()]); setBusy(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      else done();
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  const saveDraft = async () => {
    if (!supplier.trim() && !note.trim() && !used.length) { setErr('Nothing to keep yet.'); return; }
    setBusy('draft');
    try {
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      await api.saveDraft({ step: 'deliveries', doc_date: day, label: `Delivery · ${supplier.trim() || 'supplier not filled in'}${note.trim() ? ` · ${note.trim()}` : ''}`, payload: { supplier, note, vehicle, lines: linesToPayload(lines) } });
      await refreshUnfinished(); toast('Saved as a draft · not counted in stock yet'); go('home');
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };

  const check = (ok: boolean, warn: boolean, text: string) => (
    <div className={`chk ${ok ? 'ok' : warn ? 'warn' : ''}`}><span className="chkDot">{ok ? <Icon name="check" size={13} /> : warn ? '!' : ''}</span>{text}</div>
  );

  return (
    <div className="formGrid enter">
      <div className="formMain">
        <section className="panel" aria-label="Delivery note">
          <header className="panelHead"><b>Delivery note</b><span className="small muted">From the paper the driver hands over</span></header>
          <div className="formFields">
            <div className="span2">
              <Suggest label="Supplier" value={supplier} onChange={setSupplier} options={suppliers} placeholder="Start typing the supplier name" autoFocus glow={!supplier} inputClass={miss(!supplier.trim())} />
              {last && <span className="hint">Last delivery from {supplier.trim()}: {niceDate(last.date)} · {last.ref}</span>}
            </div>
            <label className="field"><span>Delivery note no.</span>
              <input data-nav className={`input mono ${supplier && !note ? 'next' : ''} ${dupe ? 'bad' : ''} ${miss(!note.trim())}`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enterNext} placeholder="e.g. DN 0421" />
              {dupe && <span className="hint bad">Already entered on {niceDate(dupe.date)}</span>}
            </label>
            <label className="field"><span>Vehicle / driver <i className="muted" style={{ fontStyle: 'normal', fontWeight: 400 }}>(optional)</i></span>
              <input data-nav className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} onKeyDown={enterNext} placeholder="e.g. KDA 123B · Musa" />
            </label>
            <div className="field span2"><span>Received by</span><div className="input locked fakeIn">{user.name}</div></div>
          </div>
        </section>

        <section className="panel" aria-label="Items received">
          <header className="panelHead"><b>Items received</b><span className="small muted keyHintInline">Enter moves to the next box</span></header>
          <LineTable lines={lines} setLines={setLines} withSubphase effect="in" glowFirst={!!note.trim() && !lines[0]?.item} flag={flag} />
        </section>

        {err && <div className="note err" role="alert">{err}</div>}
        {later && <LaterBar kind="delivery" missing={later} busy={!!busy} onLater={() => save(false, true)} onCancel={() => setLater(null)} />}
        <div className="actionBar">
          <button className="btn ghost sm" onClick={() => go('home')}>Cancel</button>
          <button className="btn link" disabled={!!busy} onClick={saveDraft}>{busy === 'draft' ? 'Saving…' : 'Save as draft'}</button>
          <span className="abGrow" />
          <button data-nav className="btn ghost sm" disabled={!!busy} onClick={() => save(true)}>{busy === 'again' ? 'Saving…' : 'Save & add another'}</button>
          <button className="btn accent sm" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save delivery'}</button>
        </div>
      </div>

      <aside className="formAside">
        <section className="panel pad stack" aria-label="Check before saving">
          <b>Check before saving</b>
          {check(!!supplier.trim() && !!note.trim(), false, 'Supplier and note number filled')}
          {check(!!note.trim() && !dupe, !!dupe, dupe ? `Note ${note} already entered` : 'Note not entered before')}
          {check(linesOk, used.length > 0 && !linesOk, linesOk ? `${used.length} line${used.length === 1 ? '' : 's'} complete` : used.length ? (checkLines(lines, { subphase: true }) ?? '') : 'Add at least one item')}
        </section>
        <section className="panel" aria-label="Deliveries today">
          <header className="panelHead"><b>Deliveries today</b><span className="small muted">{todays.length}</span></header>
          {!todays.length && <div className="pad small muted">This will be the first today.</div>}
          {todays.map((d) => (
            <div key={d.id} className="miniDoc">
              <div className="between"><b>{d.party}</b><span className="mono small muted">{d.ref_no}</span></div>
              <span className="small muted">{d.lines.map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)}`).join(' · ')}</span>
            </div>
          ))}
        </section>
        <section className="panel dark">
          <b>Short or damaged?</b>
          <span>Enter what actually arrived. Write the difference in the remarks on the paper note.</span>
        </section>
      </aside>
    </div>
  );
}

export function Deliveries() {
  return (
    <StepShell step="deliveries" question="Did any deliveries arrive today?" hint="Count every delivery note received at the store."
      another="Was there another delivery?" formTitle="New delivery"
      renderForm={(done, again) => <DeliveryForm done={done} again={again} />}
      docTitle={(d) => `${d.party ?? '(supplier to confirm)'} · ${d.ref_no ?? '(note to confirm)'}`} />
  );
}
