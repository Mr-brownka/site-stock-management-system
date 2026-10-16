import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, enterNext, LineEditor, newLine, Suggest, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';

function DeliveryForm({ done }: { done: () => void }) {
  const { day } = useData();
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.remembered('supplier').then(setSuppliers); }, []);

  const save = async () => {
    const problem = !supplier.trim() ? 'Enter the supplier.' : !note.trim() ? 'Enter the delivery note number.' : checkLines(lines, { subphase: true });
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: 'delivery', doc_date: day, ref_no: note.trim(), party: supplier.trim() },
        lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty), subphase: l.subphase })));
      done();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="stack enter">
      <div className="card pad stack">
        <Suggest label="Supplier" value={supplier} onChange={setSupplier} options={suppliers} placeholder="Start typing the supplier name" autoFocus glow={!supplier} />
        <label className="field"><span>Delivery note no.</span>
          <input data-nav className={`input ${supplier && !note ? 'next' : ''}`} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={enterNext} placeholder="e.g. DN 0421" />
        </label>
      </div>
      <div className="label">Items received</div>
      <LineEditor lines={lines} setLines={setLines} withSubphase />
      {err && <div className="note err" role="alert">{err}</div>}
      <button data-nav className="btn accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save delivery'}</button>
    </div>
  );
}

export function Deliveries() {
  return (
    <StepShell step="deliveries" question="Did any deliveries arrive today?" hint="Count every delivery note received at the store."
      another="Was there another delivery?" formTitle="New delivery"
      renderForm={(done) => <DeliveryForm done={done} />}
      docTitle={(d) => `${d.party} · ${d.ref_no}`} />
  );
}
