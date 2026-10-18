import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { fmt, Top, YesNo } from './ui';
import { ask, toast } from './feedback';
import { useSignal } from '../lib/signals';

type Stage = 'ask' | 'form' | 'another' | 'summary';
export const ADD_NOUN: Record<StepKey, string> = { deliveries: 'a delivery', issued: 'a card', returns: 'a return', transfers: 'a transfer' };

export function StepShell({ step, question, hint, another, formTitle, tone, renderForm, docTone, docTitle }: {
  step: StepKey;
  question: string;
  hint?: string;
  another: string;
  formTitle?: string;
  tone?: 'out' | 'in';
  renderForm: (done: () => void, again: () => Promise<void>) => ReactNode;
  docTone?: (d: Doc) => '' | 'out' | 'in';
  docTitle: (d: Doc) => string;
}) {
  const { stepState, markStep, docsToday, submission, refresh, go, itemById } = useData();
  const meta = STEPS.find((s) => s.key === step)!;
  const next = STEPS[meta.n] as (typeof STEPS)[number] | undefined;
  const locked = !!submission;
  const [stage, setStage] = useState<Stage>(stepState(step) === 'todo' && !locked ? 'ask' : 'summary');
  const [busy, setBusy] = useState('');
  useSignal<StepKey>('step-form', (k) => { if (k === step) setStage('form'); });
  const docs = docsToday.filter((d) => meta.kinds.includes(d.kind));

  const saved = async () => { await refresh(); markStep(step, 'done'); setStage('another'); toast(`Saved to ${meta.label.toLowerCase()}`); };
  // Saved, and staying on the form for the next one.
  const again = async () => { await refresh(); markStep(step, 'done'); toast('Saved · ready for the next one'); };
  const finish = () => go((locked ? 'home' : next?.screen ?? 'home') as Screen);
  const isLate = (d: Doc) => !!submission && d.created_at > submission.submitted_at;
  const at = submission ? new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : '';
  const remove = async (d: Doc) => {
    if (!(await ask({ title: 'Remove this entry?', body: <p>{docTitle(d)}. Use this only for a mistake made today.</p>, yes: 'Remove', tone: 'danger' }))) return;
    setBusy(d.id);
    try { await api.removeDocument(d.id); await refresh(); toast('Entry removed'); } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(''); }
  };

  return (
    <div className="phone">
      <Top onBack={() => go('home')} kicker={`Step ${meta.n} of 4 · Evening check-in`} title={stage === 'form' && formTitle ? formTitle : meta.label} sub={meta.desc} tone={tone} />
      <main className="body">
        {stage === 'ask' && (
          <YesNo question={question} hint={hint} onYes={() => setStage('form')} onNo={() => { markStep(step, 'none'); setStage('summary'); toast(`${meta.label}: nothing today`); }} />
        )}

        {stage === 'form' && renderForm(saved, again)}

        {stage === 'another' && (
          <>
            <div className="note ok enter">✓ Saved. {docs.length} {docs.length === 1 ? 'entry' : 'entries'} today.</div>
            <YesNo question={another} onYes={() => setStage('form')} onNo={() => setStage('summary')} />
          </>
        )}

        {stage === 'summary' && (
          <>
            {locked && (
              <div className="lateNote enter">
                <b>Today was submitted at {at}.</b>
                <span>Anything you add now counts in today’s balances and is marked <span className="pill late">Added</span>. To change an entry that is already saved, use <button className="btn link inline" onClick={() => go('corrections')}>Fix a mistake</button>.</span>
              </div>
            )}
            {!docs.length && stepState(step) === 'none' && <div className="note info enter">Nothing recorded for this step today.</div>}
            {docs.map((d, i) => (
              <div key={d.id} className={`sumCard ${docTone?.(d) ?? ''}`} style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="between"><b>{docTitle(d)}{isLate(d) && <span className="pill late">Added</span>}</b>{!locked && <button className="btn link" disabled={busy === d.id} onClick={() => remove(d)}>Remove</button>}</div>
                {d.lines.map((l) => {
                  const it = itemById.get(l.item_id);
                  return <div className="ln" key={l.id}><span>{it?.name ?? 'Item'}{l.subphase ? <span className="muted"> · {l.subphase}</span> : null}</span><span className="mono">{fmt(l.qty)} {it?.unit}</span></div>;
                })}
              </div>
            ))}
            {locked
              ? <button className="btn ghost addLate" onClick={() => setStage('form')}>+ Add {ADD_NOUN[step]}</button>
              : <button className="btn ghost" onClick={() => setStage('form')}>{docs.length || stepState(step) === 'none' ? '+ Add one' : 'Start'}</button>}
            <button className="btn accent" onClick={finish}>{locked ? 'Done · Back to start' : next ? `Done · Next: ${next.label}` : 'Done · Back to start'}</button>
          </>
        )}
      </main>
    </div>
  );
}
