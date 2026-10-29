import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, newLine, Suggest, type LineDraft } from '../components/ui';
import { SheetGrid } from '../components/SheetGrid';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { focusMiss, LaterBar, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { toast } from '../components/feedback';
import { DirectionPick, openRecords, takeDir } from '../components/AddEntry';
import { useSignal } from '../lib/signals';

type Dir = 'out' | 'in';

function TransferForm({ done }: { done: () => void }) {
  const { day: today_, balanceOf, itemById, refreshUnfinished, go, projectWeek, company } = useData();
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
  const [lines, setLines] = useState<LineDraft[]>(() => { const l = linesFromPayload(draft?.payload.lines, itemById); const filled = l.filter((x) => x.item || x.qty); return [...filled, ...Array.from({ length: Math.max(2, 8 - filled.length) }, () => newLine())]; });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.remembered('site').then(setSites); api.remembered('authorised_by').then(setPeople); }, []);

  if (!dir) return <DirectionPick onPick={setDir} onClose={() => openRecords(go, 'transfers')} />;

  const save = async (confirmLater = false) => {
    const used = lines.filter((l) => l.item || l.qty);
    const hard = !used.length ? 'Add at least one item with its quantity.' : checkLines(lines, { stock: dir === 'out' ? balanceOf : undefined });
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

  const dateText = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className="stack enter">
      <div className="mir trfSheet" role="group" aria-label="Project transfer note">
        <div className="mirHead">
          <div className="mwcLogo"><span className="mwcArc" aria-hidden="true" /><b>{(company || 'Comex Builders').toUpperCase()}</b><small>LTD</small></div>
          <div className="mirTitle">PROJECT TRANSFER NOTE</div>
          <div className="mirMeta"><span>Week <b className="mono">{projectWeek ?? '–'}</b></span><span>Date <b>{dateText}</b></span></div>
        </div>
        <div className="trfHead">
          <div className="trfDir" role="radiogroup" aria-label="Sent out or received">
            <button type="button" role="radio" aria-checked={dir === 'out'} className={`out ${dir === 'out' ? 'on' : ''}`} onClick={() => setDir('out')}>↗ Sent out</button>
            <button type="button" role="radio" aria-checked={dir === 'in'} className={`in ${dir === 'in' ? 'on' : ''}`} onClick={() => setDir('in')}>↙ Received</button>
          </div>
          <div className="trfBox wide"><small>{dir === 'out' ? 'To project' : 'From project'}</small>
            <Suggest bare showAll nav="site" label={dir === 'out' ? 'Sent to (project)' : 'Received from (project)'} value={site} onChange={setSite} options={sites} placeholder="Project name" autoFocus glow={!site} inputClass={`mirIn ${miss(!site.trim())}`} /></div>
          <label className="trfBox"><small>Transfer note no.</small>
            <input data-nav className={`input mirIn ${site && !note ? 'next' : ''} ${miss(!note.trim())}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. TN 112" /></label>
          <div className="trfBox"><small>Authorised by</small>
            <Suggest bare showAll nav="by" label="Authorised by" value={by} onChange={setBy} options={people} placeholder="Name" glow={!!note && !by} inputClass={`mirIn ${miss(!by.trim())}`} /></div>
          <label className="trfBox"><small>Vehicle (optional)</small>
            <input data-nav className="input mirIn" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. KDA 123A" /></label>
        </div>
        <SheetGrid lines={lines} setLines={setLines} stock={balanceOf} effect={dir === 'out' ? 'out' : 'in'} flag={flag} onEmptyEnter={() => save()} />
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
      {later && <LaterBar kind={dir === 'out' ? 'transfer_out' : 'transfer_in'} missing={later} busy={busy} onLater={() => save(true)} onCancel={() => setLater(null)} />}
      <div className="actionBar">
        <button className="btn ghost sm" onClick={() => openRecords(go, 'transfers')}>Cancel</button>
        <button className="btn link" disabled={busy} onClick={saveDraft}>Save as draft</button>
        <span className="abGrow" />
        <span className="small muted abHint">{(() => { const n = lines.filter((l) => l.item).length; return n ? `${n} item${n === 1 ? '' : 's'} · stock goes ${dir === 'out' ? 'down' : 'up'}` : 'Item, quantity, Enter. Next item.'; })()}</span>
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
