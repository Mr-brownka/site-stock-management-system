import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, enterNext, LineEditor, newLine, Suggest, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';

type Dir = 'out' | 'in';

function TransferForm({ done }: { done: () => void }) {
  const { day, balanceOf } = useData();
  const [dir, setDir] = useState<Dir | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [site, setSite] = useState('');
  const [note, setNote] = useState('');
  const [by, setBy] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
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

  const save = async () => {
    const problem = !site.trim() ? 'Enter the other site.' : !note.trim() ? 'Enter the transfer note number.' : !by.trim() ? 'Enter who authorised it.'
      : checkLines(lines, { stock: dir === 'out' ? balanceOf : undefined });
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: dir === 'out' ? 'transfer_out' : 'transfer_in', doc_date: day, ref_no: note.trim(), party: site.trim(), authorised_by: by.trim(), vehicle: vehicle.trim() || null },
        lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty) })));
      done();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="stack enter">
      <div className="note" style={dir === 'in' ? { background: 'var(--in-soft)', borderColor: '#A9C1E6', color: 'var(--in)' } : undefined}>
        <b>{dir === 'out' ? '↗ Sent to another site: stock goes down.' : '↙ Received from another site: stock goes up.'}</b>{' '}
        <button className="btn link" onClick={() => setDir(null)}>Change</button>
      </div>
      <div className="card pad stack">
        <Suggest label={dir === 'out' ? 'Sent to (site)' : 'Received from (site)'} value={site} onChange={setSite} options={sites} placeholder="Start typing the site name" autoFocus glow={!site} />
        <label className="field"><span>Transfer note no.</span>
          <input data-nav className={`input ${site && !note ? 'next' : ''}`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enterNext} placeholder="e.g. TN 112" />
        </label>
        <Suggest label="Authorised by" value={by} onChange={setBy} options={people} glow={!!note && !by} />
        <label className="field"><span>Vehicle (optional)</span>
          <input data-nav className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} onKeyDown={enterNext} placeholder="e.g. KDA 123A" />
        </label>
      </div>
      <div className="label">Items</div>
      <LineEditor lines={lines} setLines={setLines} withSubphase={false} stockCheck={dir === 'out'} />
      {err && <div className="note err" role="alert">{err}</div>}
      <button data-nav className="btn accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save transfer'}</button>
    </div>
  );
}

export function Transfers() {
  return (
    <StepShell step="transfers" question="Were materials moved to or from another site today?" another="Was there another transfer?" formTitle="New transfer"
      renderForm={(done) => <TransferForm done={done} />}
      docTone={(d) => (d.kind === 'transfer_out' ? 'out' : 'in')}
      docTitle={(d) => `${d.kind === 'transfer_out' ? '↗ Sent to' : '↙ Received from'} ${d.party} · ${d.ref_no}`} />
  );
}
