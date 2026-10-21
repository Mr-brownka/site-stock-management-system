import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { STEPS, useData, type Screen } from '../lib/store';
import type { StepKey } from '../lib/types';
import { signal } from '../lib/signals';
import { Icon } from './fx';

/** Which records list belongs to each step. Saving or cancelling an entry lands there. */
export const REC_OF: Record<StepKey, Screen> = { deliveries: 'rec-deliveries', issued: 'rec-issued', returns: 'rec-returns', transfers: 'rec-transfers' };

/** The direction picked in the transfer pop-up, read once by the transfer form. */
let pendingDir: 'in' | 'out' | null = null;
export const takeDir = () => { const d = pendingDir; pendingDir = null; return d; };

/** A records page opened from the check-in shows today's entries first. */
let pendingPeriod: string | null = null;
export const takePeriod = () => { const p = pendingPeriod; pendingPeriod = null; return p; };
export function openRecords(go: (s: Screen) => void, key: StepKey, period = 'today') { pendingPeriod = period; go(REC_OF[key]); }

/** "Sent to or received from?" Two clear choices, then straight into the form. */
export function DirectionPick({ onPick, onClose }: { onPick: (d: 'in' | 'out') => void; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dirPick" role="dialog" aria-modal="true" aria-labelledby="dirTitle">
        <header><span className="daKicker">New project transfer</span><h2 id="dirTitle">Which way did the stock go?</h2>
          <button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="dirOpts">
          <button className="dirOpt out" onClick={() => onPick('out')} autoFocus>
            <span className="dirIc" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <b>Sent to another project</b><small>Stock goes down</small>
          </button>
          <button className="dirOpt in" onClick={() => onPick('in')}>
            <span className="dirIc" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M17 7 7 17M15 17H7V9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
            <b>Received from another project</b><small>Stock goes up</small>
          </button>
        </div>
      </section>
    </div>, document.body);
}

/** One way to start a new entry everywhere: straight to the form (transfers ask the direction first). */
export function useAddEntry() {
  const { go } = useData();
  const [picking, setPicking] = useState(false);
  const add = useCallback((key: StepKey) => {
    if (key === 'transfers') { setPicking(true); return; }
    signal('step-form', key);
    go(STEPS.find((s) => s.key === key)!.screen);
  }, [go]);
  const modal = picking ? <DirectionPick onClose={() => setPicking(false)} onPick={(d) => { pendingDir = d; setPicking(false); signal('transfer-dir', d); go('transfers'); }} /> : null;
  return { add, modal };
}
