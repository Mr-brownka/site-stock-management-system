import { useMemo, useState } from 'react';
import { checkLines, fmt, LineEditor, newLine, Top, YesNo, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import type { Doc } from '../lib/types';

type Stage = 'ask' | 'cards' | 'loose' | 'summary';

export function Returns() {
  const { docsToday, itemById, day, stepState, markStep, refresh, go, submission } = useData();
  const locked = !!submission;
  const cards = docsToday.filter((d) => d.kind === 'issue');
  const returns = docsToday.filter((d) => d.kind === 'return');
  const already = useMemo(() => {
    const m = new Map<number, number>();
    returns.forEach((d) => d.lines.forEach((l) => l.return_of && m.set(l.return_of, (m.get(l.return_of) ?? 0) + l.qty)));
    return m;
  }, [returns]);

  const [stage, setStage] = useState<Stage>(stepState('returns') === 'todo' && !locked ? 'ask' : 'summary');
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
    if (!withBack) { setErr('Type what came back on at least one card. If nothing came back, go back and answer No.'); return; }
    setBusy(true); setErr('');
    try {
      for (const c of cards) {
        const ls = c.lines.filter((l) => Number(back[l.id] || 0) > 0).map((l) => ({ item_id: l.item_id, qty: Number(back[l.id]), return_of: l.id, subphase: l.subphase }));
        if (ls.length) await api.saveDocument({ kind: 'return', doc_date: day, ref_no: c.ref_no }, ls);
      }
      await refresh(); markStep('returns', 'done'); setBack({}); setStage('summary');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const saveLoose = async () => {
    const p = checkLines(loose, {});
    if (p) { setErr(p); return; }
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: 'return', doc_date: day, ref_no: 'No card' }, loose.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty) })));
      await refresh(); markStep('returns', 'done'); setLoose([newLine()]); setStage('summary');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const usedOf = (lineId: number, qty: number) => qty - (already.get(lineId) ?? 0) - Number(back[lineId] || 0);

  return (
    <div className="phone">
      <Top onBack={() => go('home')} kicker={`STEP 3 OF 4 · ${day}`} title="Returned to store" sub="Match leftovers to today’s withdrawal cards" />
      <main className="body">
        {stage === 'ask' && (
          <YesNo question="Was unused stock returned to the store this evening?" hint="Leftovers from today’s withdrawal cards."
            onYes={() => setStage(cards.length ? 'cards' : 'loose')} onNo={() => { markStep('returns', 'none'); setStage('summary'); }} />
        )}

        {stage === 'cards' && (
          <div className="stack enter">
            <div className="note">Type only what came back. <b>Used</b> is worked out for you. Cards you leave empty count as fully used, so there's no need to enter zeros.</div>
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
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy} onClick={saveCards}>{busy ? 'Saving…' : `Save returns${withBack ? ` · ${withBack} card${withBack === 1 ? '' : 's'} with returns` : ''}${cards.length - withBack ? `, ${cards.length - withBack} fully used` : ''}`}</button>
            <button className="btn link" onClick={() => { setErr(''); setStage('loose'); }}>+ Return without a card (rare)</button>
          </div>
        )}

        {stage === 'loose' && (
          <div className="stack enter">
            {!cards.length && <div className="note info">No withdrawal cards were entered today, so returns can only be recorded without a card.</div>}
            <div className="note">Only for stock that came back without a withdrawal card.</div>
            <LineEditor lines={loose} setLines={setLoose} withSubphase={false} />
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy} onClick={saveLoose}>{busy ? 'Saving…' : 'Save return'}</button>
            <button className="btn ghost" onClick={() => setStage(cards.length ? 'cards' : 'summary')}>Back</button>
          </div>
        )}

        {stage === 'summary' && (
          <>
            {locked && <div className="note info">Today has been submitted, so entries can no longer change.</div>}
            {!returns.length && <div className="note info enter">{stepState('returns') === 'none' ? 'Nothing was returned today.' : 'No returns recorded yet.'}</div>}
            {cards.map((c, i) => {
              const backTotal = c.lines.reduce((a, l) => a + (already.get(l.id) ?? 0), 0);
              return (
                <div key={c.id} className="sumCard" style={{ animationDelay: `${i * 0.05}s` }}>
                  <b>Card {c.ref_no}{[c.activity, c.gemba].some(Boolean) ? ` · ${[c.activity, c.gemba].filter(Boolean).join(', ')}` : ''}</b>
                  {c.lines.map((l) => {
                    const it = itemById.get(l.item_id);
                    const b = already.get(l.id) ?? 0;
                    return <div className="ln" key={l.id}><span>{it?.name}</span><span className="mono">{b ? `${fmt(b)} back · ` : ''}{fmt(l.qty - b)} {it?.unit} used</span></div>;
                  })}
                  {!backTotal && <span className="small muted">Fully used</span>}
                </div>
              );
            })}
            {returns.filter((d) => d.ref_no === 'No card').map((d) => (
              <div key={d.id} className="sumCard"><b>Returned without a card</b>
                {d.lines.map((l) => <div className="ln" key={l.id}><span>{itemById.get(l.item_id)?.name}</span><span className="mono">{fmt(l.qty)} {itemById.get(l.item_id)?.unit}</span></div>)}
              </div>
            ))}
            {!locked && cards.some((c) => c.lines.some((l) => maxBack(l.id, l.qty) > 0)) && <button className="btn ghost" onClick={() => { setErr(''); setStage('cards'); }}>+ Record returns against cards</button>}
            <button className="btn accent" onClick={() => go('transfers')}>Done · Next: Site transfers</button>
          </>
        )}
      </main>
    </div>
  );
}
