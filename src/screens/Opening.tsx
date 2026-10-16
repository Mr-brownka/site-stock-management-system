import { useState } from 'react';
import { checkLines, LineEditor, newLine, Top, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';

export function Opening() {
  const { day, balances, refresh, go, submission } = useData();
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const first = !balances.length;

  const save = async () => {
    const p = checkLines(lines, {});
    if (p) { setErr(p); return; }
    const ids = lines.filter((l) => l.item).map((l) => l.item!.id);
    if (new Set(ids).size !== ids.length) { setErr('An item is listed twice. Add the quantities together on one line.'); return; }
    const counted = balances.filter((b) => ids.includes(b.item_id));
    if (counted.length && !confirm(`${counted.map((c) => c.name).join(', ')} already ${counted.length === 1 ? 'has' : 'have'} a balance. This adds to it. Continue?`)) return;
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: 'opening', doc_date: day, reason: first ? 'Opening count' : 'Added to opening count' },
        lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty) })));
      await refresh();
      go('home');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="phone">
      <Top onBack={() => go('home')} title="Opening count" sub={first ? 'What is in the store right now' : 'Add items that were missed in the first count'} />
      <main className="body">
        {submission ? (
          <div className="note info">Today has been submitted. Enter the opening count tomorrow, before the day’s check-in.</div>
        ) : (
          <>
            <div className="note">
              Count each item in the store and enter it once. Balances start from these numbers, so count carefully.
              {!first && ' Items already counted are not needed again.'}
            </div>
            <LineEditor lines={lines} setLines={setLines} withSubphase={false} />
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save opening count'}</button>
          </>
        )}
      </main>
    </div>
  );
}
