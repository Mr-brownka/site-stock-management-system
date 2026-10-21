import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, enterNext, Suggest, type LineDraft } from '../components/ui';
import { LineTable } from '../components/LineTable';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { focusMiss, LaterBar, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { toast } from '../components/feedback';
import { DirectionPick, openRecords, takeDir } from '../components/AddEntry';
import { useSignal } from '../lib/signals';

type Dir = 'out' | 'in';

function TransferForm({ done }: { done: () => void }) {
  const { day: today_, balanceOf, itemById, refreshUnfinished, go } = useData();
  const draft = useDraft('transfers');
  const day = draft?.doc_date ?? today_;
  const p = (draft?.payload ?? {}) as Record<string, string>;
  const [later, setLater] = useState<string[] | null>(null);
  const [flag, setFlag] = useState(false); // after a save attempt: highlight what is still empty
  const miss = (empty: boolean) => (flag && empty ? 'miss' : '');
  const [dir, setDir] = useState<Dir | null>(() => (p.dir as Dir) || takeDir());
  useSignal<Dir>('transfer-dir', (d) => setDir(d));
  const [sites, setSites] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [site, setSite] = useState(p.site ?? '');
  const [note, setNote] = useState(p.note ?? '');
  const [by, setBy] = useState(p.by ?? '');
  const [vehicle, setVehicle] = useState(p.vehicle ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => linesFromPayload(draft?.payload.lines, itemById));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.remembered('site').then(setSites); api.remembered('authorised_by').then(setPeople); }, []);

  if (!dir) return <DirectionPick onPick={setDir} onClose={() => openRecords(go, 'transfers')} />;

  const save = async (confirmLater = false) => {
    const hard = checkLines(lines, { stock: dir === 'out' ? balanceOf : undefined });
    setFlag(true);
    if (hard) { setErr(hard); setLater(null); focusMiss(); return; }
    const missing = [!site.trim() && 'party', !note.trim() && 'ref_no', !by.trim() && 'authorised_by'].filter(Boolean) as string[];
    if (missing.length && !confirmLater) { setErr(''); setLater(missing); return; }
    setBusy(true); setErr(''); setLater(null);
    try {
      await api.saveDocument({ kind: dir === 'out' ? 'transfer_out' : 'transfer_in', doc_date: day, ref_no: note.trim() || null, party: site.trim() || null, authorised_by: by.trim() || null, vehicle: vehicle.trim() || null, ...(missing.length ? { to_confirm: missing } : {}) },
        lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty) })));
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      if (missing.length || draft) refreshUnfinished();
      done();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const saveDraft = async () => {
    setBusy(true);
    try {
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      await api.saveDraft({ step: 'transfers', doc_date: day, label: `Transfer ${dir === 'out' ? 'to' : 'from'} ${site.trim() || '(project not filled in)'}`, payload: { dir: dir ?? '', site, note, by, vehicle, lines: linesToPayload(lines) } });
      await refreshUnfinished(); toast('Saved as a draft · not counted in stock yet'); go('home');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="stack enter">
      <div className={`dirBanner ${dir}`}>
        <span className="dirIc" aria-hidden="true">{dir === 'out' ? '↗' : '↙'}</span>
        <b>{dir === 'out' ? 'Sent to another project' : 'Received from another project'}</b>
        <span className="muted">{dir === 'out' ? 'Stock goes down' : 'Stock goes up'}</span>
        <button className="btn link" onClick={() => setDir(null)}>Change</button>
      </div>
      <section className="panel" aria-label="Transfer note">
      <header className="panelHead"><b>Transfer note</b></header>
      <div className="formFields">
      <div className="span2">
        <Suggest label={dir === 'out' ? 'Sent to (project)' : 'Received from (project)'} value={site} onChange={setSite} options={sites} placeholder="Start typing the project name" autoFocus glow={!site} inputClass={miss(!site.trim())} />
        </div>
        <label className="field"><span>Transfer note no.</span>
          <input data-nav className={`input ${site && !note ? 'next' : ''} ${miss(!note.trim())}`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enterNext} placeholder="e.g. TN 112" />
        </label>
        <Suggest label="Authorised by" value={by} onChange={setBy} options={people} glow={!!note && !by} inputClass={miss(!by.trim())} />
        <label className="field"><span>Vehicle <i className="muted" style={{ fontStyle: 'normal', fontWeight: 400 }}>(optional)</i></span>
          <input data-nav className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} onKeyDown={enterNext} placeholder="e.g. KDA 123A" />
        </label>
      </div>
      </section>
      <section className="panel" aria-label="Items">
        <header className="panelHead"><b>Items {dir === 'out' ? 'sent' : 'received'}</b><span className="small muted keyHintInline">Enter moves to the next box</span></header>
        <LineTable lines={lines} setLines={setLines} effect={dir === 'out' ? 'out' : 'in'} flag={flag} />
      </section>
      {err && <div className="note err" role="alert">{err}</div>}
      {later && <LaterBar kind={dir === 'out' ? 'transfer_out' : 'transfer_in'} missing={later} busy={busy} onLater={() => save(true)} onCancel={() => setLater(null)} />}
      <div className="actionBar">
        <button className="btn ghost sm" onClick={() => openRecords(go, 'transfers')}>Cancel</button>
        <button className="btn link" disabled={busy} onClick={saveDraft}>Save as draft</button>
        <span className="abGrow" />
        <button data-nav className="btn accent sm" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save transfer'}</button>
      </div>
    </div>
  );
}

export function Transfers() {
  return (
    <StepShell step="transfers" sub="Stock sent to or received from another Comex project."
      renderForm={(done) => <TransferForm done={done} />} />
  );
}
