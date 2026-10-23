import { useMemo, useState } from 'react';
import { checkLines, fmt, newLine, type LineDraft } from '../components/ui';
import { LineTable } from '../components/LineTable';
import { EntryHead } from '../components/StepShell';
import { openRecords } from '../components/AddEntry';
import { entrySaved } from '../components/EveningFlow';
import { toast } from '../components/feedback';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import type { Doc } from '../lib/types';

type Stage = 'cards' | 'loose';

export function Returns() {
  const { docsToday, itemById, day, markStep, refresh, go } = useData();
  const cards = docsToday.filter((d) => d.kind === 'issue');
  const returns = docsToday.filter((d) => d.kind === 'return');
  const already = useMemo(() => {
    const m = new Map<number, number>();
    returns.forEach((d) => d.lines.forEach((l) => l.return_of && m.set(l.return_of, (m.get(l.return_of) ?? 0) + l.qty)));
    return m;
  }, [returns]);

  // Straight to the entry: today's cards if there are any, otherwise a return without a card.
  const [stage, setStage] = useState<Stage>(cards.length ? 'cards' : 'loose');
  const [back, setBack] = useState<Record<number, string>>({});
  const [loose, setLoose] = useState<LineDraft[]>([newLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const maxBack = (lineId: number, qty: number) => qty - (already.get(lineId) ?? 0);
  // Only what came back is typed. A card left empty counts as fully used: no zeros to enter.
  const hasBack = (c: Doc) => c.lines.some((l) => Number(back[l.id] || 0) > 0);
  const withBack = cards.filter(hasBack).length;
  const setLine = (lineId: number, v: string) => setBack({ ...back, [lineId]: v.replace(/[^0-9.]/g, '') });

  const saveCards = async () => {
    for (const c of cards) for (const l of c.lines) {
      const v = Number(back[l.id] || 0);
      if (v > maxBack(l.id, l.qty)) { setErr(`Card ${c.ref_no}: you can't return more ${itemById.get(l.item_id)?.name} than was issued.`); return; }
    }
    if (!withBack) { setErr('Type what came back on at least one card. If nothing came back, mark returns as “None today” on the check-in.'); return; }
    setBusy(true); setErr('');
    try {
      for (const c of cards) {
        const ls = c.lines.filter((l) => Number(back[l.id] || 0) > 0).map((l) => ({ item_id: l.item_id, qty: Number(back[l.id]), return_of: l.id, subphase: l.subphase }));
        if (ls.length) await api.saveDocument({ kind: 'return', doc_date: day, ref_no: c.ref_no }, ls);
      }
      await refresh(); markStep('returns', 'done'); setBack({}); toast('Saved to returned to store'); entrySaved('returns', day, go);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const saveLoose = async () => {
    const p = checkLines(loose, {});
    if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: 'return', doc_date: day, ref_no: 'No card' }, loose.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty) })));
      await refresh(); markStep('returns', 'done'); setLoose([newLine()]); toast('Saved to returned to store'); entrySaved('returns', day, go);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const usedOf = (lineId: number, qty: number) => qty - (already.get(lineId) ?? 0) - Number(back[lineId] || 0);

  return (
    <div className="entryPage">
      <EntryHead step="returns" sub={stage === 'cards' ? 'Type only what came back. Cards left empty count as fully used.' : 'Only for stock that came back without a withdrawal card.'} />
      <main className="stack">
        {stage === 'cards' && (
          <div className="stack enter">
            <div className="retGrid">
            {cards.map((c) => {
              const some = hasBack(c);
              return (
                <div key={c.id} className="paperCard" style={some ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 4px rgba(252,167,45,.15)' } : undefined}>
                  <div className="between">
                    <b className="mono" style={{ color: 'var(--error)', fontSize: 18 }}>Card {c.ref_no}</b>
                    {some ? <span className="pill done">↩ Returned</span> : <span className="pill">Fully used</span>}
                  </div>
                  <div className="small muted">{[c.activity, c.gemba, c.party].filter(Boolean).join(' · ') || 'Details to confirm'}</div>
                  <div className="retLine small muted" style={{ borderBottomWidth: 2 }}><span>Item</span><span className="num">Issued</span><span className="num">Back</span><span className="num">Used</span></div>
                  {c.lines.map((l) => {
                    const it = itemById.get(l.item_id);
                    const max = maxBack(l.id, l.qty);
                    const over = Number(back[l.id] || 0) > max;
                    return (
                      <div className="retLine" key={l.id}>
                        <span>{it?.name}<span className="muted"> · {it?.unit}</span></span>
                        <span className="num">{fmt(l.qty)}</span>
                        <input className={`input num ${over ? 'bad' : ''}`} style={{ minHeight: 44 }} inputMode="decimal" aria-label={`${it?.name} back`} value={back[l.id] ?? ''} placeholder="0" disabled={max <= 0}
                          onChange={(e) => setLine(l.id, e.target.value)} />
                        <span className="num" style={{ fontWeight: 700, color: over ? 'var(--error)' : 'var(--ink)' }}>{fmt(Math.max(0, usedOf(l.id, l.qty)))}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            </div>
            {err && <div className="note err" role="alert">{err}</div>}
            <div className="actionBar">
              <button className="btn ghost sm" onClick={() => openRecords(go, 'returns')}>Cancel</button>
              <button className="btn link" onClick={() => { setErr(''); setStage('loose'); }}>Return without a card</button>
              <span className="abGrow" />
              <span className="small muted abHint">{withBack ? `${withBack} card${withBack === 1 ? '' : 's'} with returns` : 'Nothing typed yet'}{cards.length - withBack ? ` · ${cards.length - withBack} fully used` : ''}</span>
              <button className="btn accent sm" disabled={busy} onClick={saveCards}>{busy ? 'Saving…' : 'Save returns'}</button>
            </div>
          </div>
        )}

        {stage === 'loose' && (
          <div className="stack enter">
            {!cards.length && <div className="note info">No withdrawal cards were entered today, so returns can only be recorded without a card.</div>}
            <section className="panel" aria-label="Items returned"><header className="panelHead"><b>Items returned</b></header><LineTable lines={loose} setLines={setLoose} effect="in" /></section>
            {err && <div className="note err" role="alert">{err}</div>}
            <div className="actionBar">
              {cards.length > 0 ? <button className="btn ghost sm" onClick={() => setStage('cards')}>Back to today’s cards</button> : <button className="btn ghost sm" onClick={() => openRecords(go, 'returns')}>Cancel</button>}
              <span className="abGrow" />
              <button className="btn accent sm" disabled={busy} onClick={saveLoose}>{busy ? 'Saving…' : 'Save return'}</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
