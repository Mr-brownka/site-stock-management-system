import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, enterNext, LineEditor, Suggest, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { focusMiss, LaterBar, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { toast } from '../components/feedback';

type Dir = 'out' | 'in';

function TransferForm({ done }: { done: () => void }) {
  const { day: today_, balanceOf, itemById, refreshUnfinished, go } = useData();
  const draft = useDraft('transfers');
  const day = draft?.doc_date ?? today_;
  const p = (draft?.payload ?? {}) as Record<string, string>;
  const [later, setLater] = useState<string[] | null>(null);
  const [flag, setFlag] = useState(false); // after a save attempt: highlight what is still empty
  const miss = (empty: boolean) => (flag && empty ? 'miss' : '');
  const [dir, setDir] = useState<Dir | null>((p.dir as Dir) ?? null);
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

  if (!dir) {
    return (
      <div className="card pad stack enter">
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 26 }}>Which way did it go?</h2>
        <button className="btn accent" style={{ minHeight: 76 }} onClick={() => setDir('out')} autoFocus>↗ Sent to another site<br /></button>
        <div className="muted small" style={{ marginTop: -4 }}>Stock goes down</div>
        <button className="btn" style={{ minHeight: 76, background: 'var(--in)' }} onClick={() => setDir('in')}>↙ Received from another site</button>
        <div className="muted small" style={{ marginTop: -4 }}>Stock goes up</div>
      </div>
    );
  }

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
      await api.saveDraft({ step: 'transfers', doc_date: day, label: `Transfer ${dir === 'out' ? 'to' : 'from'} ${site.trim() || '(site not filled in)'}`, payload: { dir: dir ?? '', site, note, by, vehicle, lines: linesToPayload(lines) } });
      await refreshUnfinished(); toast('Saved as a draft · not counted in stock yet'); go('home');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="stack enter">
      <div className="note" style={dir === 'in' ? { background: 'var(--in-soft)', borderColor: '#A9C1E6', color: 'var(--in)' } : undefined}>
        <b>{dir === 'out' ? '↗ Sent to another site: stock goes down.' : '↙ Received from another site: stock goes up.'}</b>{' '}
        <button className="btn link" onClick={() => setDir(null)}>Change</button>
      </div>
      <div className="card pad stack">
        <Suggest label={dir === 'out' ? 'Sent to (site)' : 'Received from (site)'} value={site} onChange={setSite} options={sites} placeholder="Start typing the site name" autoFocus glow={!site} inputClass={miss(!site.trim())} />
        <label className="field"><span>Transfer note no.</span>
          <input data-nav className={`input ${site && !note ? 'next' : ''} ${miss(!note.trim())}`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enterNext} placeholder="e.g. TN 112" />
        </label>
        <Suggest label="Authorised by" value={by} onChange={setBy} options={people} glow={!!note && !by} inputClass={miss(!by.trim())} />
        <label className="field"><span>Vehicle (optional)</span>
          <input data-nav className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} onKeyDown={enterNext} placeholder="e.g. KDA 123A" />
        </label>
      </div>
      <div className="label">Items</div>
      <LineEditor lines={lines} setLines={setLines} withSubphase={false} stockCheck={dir === 'out'} flag={flag} />
      {err && <div className="note err" role="alert">{err}</div>}
      {later && <LaterBar kind={dir === 'out' ? 'transfer_out' : 'transfer_in'} missing={later} busy={busy} onLater={() => save(true)} onCancel={() => setLater(null)} />}
      <button data-nav className="btn accent" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save transfer'}</button>
      <button className="btn link" disabled={busy} onClick={saveDraft}>Save as draft</button>
    </div>
  );
}

export function Transfers() {
  return (
    <StepShell step="transfers" question="Were materials moved to or from another site today?" another="Was there another transfer?" formTitle="New transfer"
      renderForm={(done) => <TransferForm done={done} />}
      docTone={(d) => (d.kind === 'transfer_out' ? 'out' : 'in')}
      docTitle={(d) => `${d.kind === 'transfer_out' ? '↗ Sent to' : '↙ Received from'} ${d.party ?? '(site to confirm)'} · ${d.ref_no ?? '(note to confirm)'}`} />
  );
}
