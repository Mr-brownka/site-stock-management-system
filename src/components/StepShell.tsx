import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { fmt, Top, YesNo } from './ui';

type Stage = 'ask' | 'form' | 'another' | 'summary';

export function StepShell({ step, question, hint, another, formTitle, tone, renderForm, docTone, docTitle }: {
  step: StepKey;
  question: string;
  hint?: string;
  another: string;
  formTitle?: string;
  tone?: 'out' | 'in';
  renderForm: (done: () => void) => ReactNode;
  docTone?: (d: Doc) => '' | 'out' | 'in';
  docTitle: (d: Doc) => string;
}) {
  const { stepState, markStep, docsToday, submission, refresh, go, itemById, day } = useData();
  const meta = STEPS.find((s) => s.key === step)!;
  const next = STEPS[meta.n] as (typeof STEPS)[number] | undefined;
  const locked = !!submission;
  const [stage, setStage] = useState<Stage>(stepState(step) === 'todo' && !locked ? 'ask' : 'summary');
  const [busy, setBusy] = useState('');
  const docs = docsToday.filter((d) => meta.kinds.includes(d.kind));

  const saved = async () => { await refresh(); markStep(step, 'done'); setStage('another'); };
  const finish = () => go((next?.screen ?? 'home') as Screen);
  const remove = async (d: Doc) => {
    if (!confirm('Remove this entry? Use this only for a mistake made today.')) return;
    setBusy(d.id);
    try { await api.removeDocument(d.id); await refresh(); } catch (e) { alert((e as Error).message); } finally { setBusy(''); }
  };

  return (
    <div className="phone">
      <Top onBack={() => go('home')} kicker={`STEP ${meta.n} OF 4 · ${day}`} title={stage === 'form' && formTitle ? formTitle : meta.label} sub={meta.desc} tone={tone} />
      <main className="body">
        {stage === 'ask' && (
          <YesNo question={question} hint={hint} onYes={() => setStage('form')} onNo={() => { markStep(step, 'none'); setStage('summary'); }} />
        )}

        {stage === 'form' && renderForm(saved)}

        {stage === 'another' && (
          <>
            <div className="note ok enter">✓ Saved. {docs.length} {docs.length === 1 ? 'entry' : 'entries'} today.</div>
            <YesNo question={another} onYes={() => setStage('form')} onNo={() => setStage('summary')} />
          </>
        )}

        {stage === 'summary' && (
          <>
            {locked && <div className="note info">Today has been submitted, so entries can no longer change. Mistakes are fixed with a correction (coming next).</div>}
            {!docs.length && stepState(step) === 'none' && <div className="note info enter">Nothing recorded for this step today.</div>}
            {docs.map((d, i) => (
              <div key={d.id} className={`sumCard ${docTone?.(d) ?? ''}`} style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="between"><b>{docTitle(d)}</b>{!locked && <button className="btn link" disabled={busy === d.id} onClick={() => remove(d)}>Remove</button>}</div>
                {d.lines.map((l) => {
                  const it = itemById.get(l.item_id);
                  return <div className="ln" key={l.id}><span>{it?.name ?? 'Item'}{l.subphase ? <span className="muted"> · {l.subphase}</span> : null}</span><span className="mono">{fmt(l.qty)} {it?.unit}</span></div>;
                })}
              </div>
            ))}
            {!locked && <button className="btn ghost" onClick={() => setStage('form')}>{docs.length || stepState(step) === 'none' ? '+ Add one' : 'Start'}</button>}
            <button className="btn accent" onClick={finish}>{next ? `Done · Next: ${next.label}` : 'Done · Back to start'}</button>
          </>
        )}
      </main>
    </div>
  );
}
