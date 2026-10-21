import { useEffect, type ReactNode } from 'react';
import { STEPS, useData } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { toast } from './feedback';
import { useZohoDeliveries } from './Zoho';
import { openRecords } from './AddEntry';

export const ADD_NOUN: Record<StepKey, string> = { deliveries: 'a delivery', issued: 'a card', returns: 'a return', transfers: 'a transfer' };
const NEW_TITLE: Record<StepKey, string> = { deliveries: 'New delivery', issued: 'New withdrawal card', returns: 'New return', transfers: 'New project transfer' };
const LIST_NAME: Record<StepKey, string> = { deliveries: 'Deliveries', issued: 'Issued items', returns: 'Returned items', transfers: 'Project transfers' };

/** The heading every entry page shares: where you came from, what you're entering, and for which day. */
export function EntryHead({ step, title, sub, right }: { step: StepKey; title?: string; sub?: ReactNode; right?: ReactNode }) {
  const { go, day, catchUp, submission } = useData();
  const d = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <header className="entryHead enter">
      <button className="entryBack" onClick={() => openRecords(go, step)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {LIST_NAME[step]}
      </button>
      <div className="entryTitle">
        <div><h1>{title ?? NEW_TITLE[step]}</h1>{sub && <p>{sub}</p>}</div>
        <span className={`entryDay ${catchUp ? 'catch' : ''}`}>{catchUp ? 'Catch-up · ' : ''}{d}{submission ? ' · added after submitting' : ''}</span>
        {right}
      </div>
    </header>
  );
}

/** An entry page: only the form. Saving lands on the records list, where everything entered is shown. */
export function StepShell({ step, renderForm, sub }: {
  step: StepKey;
  renderForm: (done: () => void, again: () => Promise<void>) => ReactNode;
  sub?: ReactNode;
  /** Kept for older callers; no longer shown. */
  question?: string; hint?: string; another?: string; formTitle?: string; tone?: 'out' | 'in';
  docTone?: (d: Doc) => '' | 'out' | 'in'; docTitle?: (d: Doc) => string;
}) {
  const { markStep, refresh, go } = useData();
  const meta = STEPS.find((s) => s.key === step)!;
  // With Zoho on, deliveries are received in Zoho only: there is no form to fill here.
  const zohoOnly = useZohoDeliveries() && step === 'deliveries';
  useEffect(() => { if (zohoOnly) openRecords(go, step); }, [zohoOnly, go, step]);

  const saved = async () => { await refresh(); markStep(step, 'done'); toast(`Saved to ${meta.label.toLowerCase()}`); openRecords(go, step); };
  const again = async () => { await refresh(); markStep(step, 'done'); toast('Saved · ready for the next one'); };

  return (
    <div className="entryPage">
      <EntryHead step={step} sub={sub} />
      {!zohoOnly && renderForm(saved, again)}
    </div>
  );
}
