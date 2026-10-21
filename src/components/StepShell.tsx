import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { fmt, Top, YesNo } from './ui';
import { ask, toast } from './feedback';
import { useSignal } from '../lib/signals';
import { ZohoTag } from './Zoho';

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
  const { stepState, markStep, docsToday, submission, refresh, go, itemById, catchUp } = useData();
  const meta = STEPS.find((s) => s.key === step)!;
  const next = STEPS[meta.n] as (typeof STEPS)[number] | undefined;
  const locked = !!submission;
  const fromZoho = docsToday.some((d) => meta.kinds.includes(d.kind) && d.source === 'zoho');
  const [stage, setStage] = useState<Stage>(stepState(step) === 'todo' && !locked && !fromZoho ? 'ask' : 'summary');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const tick = async (d: Doc) => {
    setChecked((c) => ({ ...c, [d.id]: true }));
    try { await api.checkDelivery(d.id); await refresh(); } catch (e) { setChecked((c) => ({ ...c, [d.id]: false })); toast((e as Error).message, 'warn'); }
  };
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
          <YesNo question={question} hint={hint} onYes={() => setStage('form')} onNo={() => { markStep(step, 'none'); setStage('summary'); toast(`${meta.label}: nothing ${catchUp ? "that day" : "today"}`); }} />
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
                <span>Anything you add now counts in today’s balances and is marked <span className="pill late">Added</span>. To change an entry that is already saved, use <button className="btn link inline" onClick={() => go('corrections')}>Fix an error</button>.</span>
              </div>
            )}
            {!docs.length && stepState(step) === 'none' && <div className="note info enter">Nothing recorded for this step today.</div>}
            {fromZoho && (() => { const z = docs.filter((d) => d.source === 'zoho'); const n = z.filter((d) => d.checked_at || checked[d.id]).length; return (
              <div className="zohoStepNote enter"><ZohoTag /><span><b>{z.length} deliver{z.length === 1 ? 'y' : 'ies'} came in from Zoho today.</b> Already in stock. Tick each one when it matches the paper delivery note. <span className="muted">{n} of {z.length} checked</span></span></div>
            ); })()}
            {docs.map((d, i) => (
              <div key={d.id} className={`sumCard ${docTone?.(d) ?? ''}`} style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="between"><b>{d.source === 'zoho' && <ZohoTag grn={d.zoho_grn} />} {docTitle(d)}{isLate(d) && <span className="pill late">Added</span>}{!!d.to_confirm?.length && <span className="fcTag confirm" style={{ marginLeft: 8, height: 22 }}>To confirm</span>}</b>{d.source === 'zoho'
                  ? <label className="zohoTick"><input type="checkbox" checked={!!(d.checked_at || checked[d.id])} disabled={!!(d.checked_at || checked[d.id])} onChange={() => tick(d)} />{d.checked_at || checked[d.id] ? 'Checked' : 'Matches the paper'}</label>
                  : !locked && <button className="btn link" disabled={busy === d.id} onClick={() => remove(d)}>Remove</button>}</div>
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
