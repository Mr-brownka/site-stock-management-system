import { useEffect, useState, type ReactNode } from 'react';
import { useSignal } from '../lib/signals';
import { entrySaved } from './EveningFlow';
import { STEPS, useData } from '../lib/store';
import type { Doc, StepKey } from '../lib/types';
import { toast } from './feedback';
import { useZohoDeliveries } from './Zoho';
import { openRecords } from './AddEntry';
import { BackPill } from './BackPill';
import { DatePick } from './DatePick';

export const ADD_NOUN: Record<StepKey, string> = { deliveries: 'a delivery', issued: 'a card', returns: 'a return', transfers: 'a transfer' };
const NEW_TITLE: Record<StepKey, string> = { deliveries: 'New delivery', issued: 'New withdrawal card', returns: 'New return', transfers: 'New project transfer' };

/** The heading every entry page shares: where you came from, what you're entering, and for which day. */
export function EntryHead({ step, title, sub, right }: { step: StepKey; title?: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="entryHead enter">
      <BackPill />
      <div className="entryTitle">
        <div><h1>{title ?? NEW_TITLE[step]}</h1>{sub && <p>{sub}</p>}</div>
        <DatePick />
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
  const { markStep, refresh, go, day } = useData();
  // The evening flow asks for "another one": the form starts again, empty.
  const [formKey, setFormKey] = useState(0);
  useSignal<StepKey>('flow-again', (k) => { if (k === step) setFormKey((n) => n + 1); });
  const meta = STEPS.find((s) => s.key === step)!;
  // With Zoho on, deliveries are received in Zoho only: there is no form to fill here.
  const zohoOnly = useZohoDeliveries() && step === 'deliveries';
  useEffect(() => { if (zohoOnly) openRecords(go, step); }, [zohoOnly, go, step]);

  const saved = async () => { await refresh(); markStep(step, 'done'); toast(`Saved to ${meta.label.toLowerCase()}`); entrySaved(step, day, go); };
  const again = async () => { await refresh(); markStep(step, 'done'); toast('Saved · ready for the next one'); };

  return (
    <div className="entryPage">
      <EntryHead step={step} sub={sub} />
      {!zohoOnly && <div key={formKey} className="formSlot">{renderForm(saved, again)}</div>}
    </div>
  );
}
