import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STEPS, useData, type Screen } from '../lib/store';
import { api, progressStore } from '../lib/api';
import { today, weekday, weekdayName } from '../lib/dates';
import { TRAINING_DAYS } from '../lib/trainingPlan';
import type { StepKey, StepState } from '../lib/types';
import { DirectionPick, openRecords, setPendingDir } from './AddEntry';
import { signal } from '../lib/signals';
import { Icon } from './fx';
import { toast } from './feedback';
import { useZohoDeliveries } from './Zoho';
import { useIsPhone } from './Ring';

/* The evening check-in, one question at a time. Each step starts with a "were there any?" question;
   only after one has been saved in this check-in does it ask about "another".
   Start → "Were materials issued today?" → card → "Another card?" → "Anything returned?" → returns
   → "Any project transfer today?" → transfer → "Another transfer?" → "Submit the day?" → back on the dashboard. */
export type Stage = 'issued' | 'askCard' | 'askNoCard' | 'askReturns' | 'askMoreReturns' | 'returns' | 'askTransfer' | 'transfers' | 'askMoreTransfer' | 'askSubmit';
type Flow = { day: string; stage: Stage; saved?: Partial<Record<StepKey, number>> } | null;

const KEY = 'ostock-evening';
const read = (): Flow => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; } };
let flow: Flow = read();
const subs = new Set<(f: Flow) => void>();
const set = (f: Flow) => { flow = f; try { if (f) sessionStorage.setItem(KEY, JSON.stringify(f)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } subs.forEach((s) => s(f)); };
export const stageFor = (day: string) => (flow && flow.day === day ? flow.stage : null);
/** How many entries of a step were saved during this check-in (not during the day). */
const savedIn = (day: string, k: StepKey) => (flow && flow.day === day ? flow.saved?.[k] ?? 0 : 0);
const to_ = (day: string, stage: Stage, bump?: StepKey) => set({ day, stage, saved: bump ? { ...flow?.saved, [bump]: savedIn(day, bump) + 1 } : flow?.day === day ? flow.saved : undefined });
export function useFlow(day: string) {
  const [, tick] = useState(0);
  useEffect(() => { const s = () => tick((n) => n + 1); subs.add(s); return () => { subs.delete(s); }; }, []);
  return stageFor(day);
}
const ENTRY: Partial<Record<Stage, StepKey>> = { issued: 'issued', returns: 'returns', transfers: 'transfers' };
const SCREEN: Record<'issued' | 'returns' | 'transfers', Screen> = { issued: 'issued', returns: 'returns', transfers: 'transfers' };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function startEvening(day: string, _go?: (s: Screen) => void, _cardsAlready = false) {
  // A start of works: always the first question, "Were materials issued today?".
  set({ day, stage: 'askNoCard', saved: {} });
}

/** "Continue": back to the entry page the flow was on (a question that is waiting shows by itself). */
export function continueEvening(day: string, go: (s: Screen) => void) {
  const st = stageFor(day);
  if (!st) { startEvening(day, go); return; }
  const step = ENTRY[st] as 'issued' | 'returns' | 'transfers' | undefined;
  if (step) { signal('step-form', step); go(SCREEN[step]); } else set({ day, stage: st }); // re-show the question
}

/** Called by an entry form after saving. In the evening flow the next question pops up; otherwise the records list opens. */
export function entrySaved(step: StepKey, day: string, go: (s: Screen) => void) {
  const st = stageFor(day);
  if (st && ENTRY[st] === step) {
    to_(day, step === 'issued' ? 'askReturns' : step === 'returns' ? 'askMoreReturns' : 'askMoreTransfer', step);
    signal('flow-again', step); // the page behind the question shows a clean form
    return;
  }
  // One register a day: once it is saved, the next step is the returns, even when the check-in wasn't started.
  if (step === 'issued') { set({ day, stage: 'askReturns', saved: { issued: 1 } }); return; }
  openRecords(go, step);
}

const ORDER: { key: StepKey; label: string }[] = [{ key: 'issued', label: 'Issued' }, { key: 'returns', label: 'Returns' }, { key: 'transfers', label: 'Transfers' }, { key: 'deliveries', label: 'Submit' }];
const at = (s: Stage) => (s === 'issued' || s === 'askCard' || s === 'askNoCard' ? 0 : s === 'askReturns' || s === 'askMoreReturns' || s === 'returns' ? 1 : s === 'askSubmit' ? 3 : 2);

/** The questions, shown over whatever page the person is on. */
export function EveningFlow({ screen }: { screen: Screen }) {
  const { day, go, docsToday, stepState, markStep, refresh, refreshPending, catchUp, endCatchUp, submission } = useData();
  const zoho = useZohoDeliveries();
  const stage = useFlow(day);
  const [busy, setBusy] = useState(false);
  const phone = useIsPhone();

  // Leaving an entry page without saving (Cancel, back): ask the question again instead of losing the place.
  const prev = useRef(screen);
  useEffect(() => {
    const was = prev.current; prev.current = screen;
    const step = stage && ENTRY[stage];
    if (!step || was !== SCREEN[step as 'issued'] || screen === was) return;
    // Back on the question: "another" only if one was saved in this check-in.
    if (step === 'issued') to_(day, savedIn(day, 'issued') ? 'askReturns' : 'askNoCard');
    else if (step === 'returns') to_(day, savedIn(day, 'returns') ? 'askMoreReturns' : 'askReturns');
    else to_(day, savedIn(day, 'transfers') ? 'askMoreTransfer' : 'askTransfer');
  }, [screen, stage, day]);
  // A day already submitted needs no evening flow.
  useEffect(() => { if (stage && submission) set(null); }, [stage, submission]);

  if (!stage || ENTRY[stage]) return null;
  const to = (s: Stage) => to_(day, s);
  // "Any project transfers?" is a plain Yes / No; Yes then asks Sent or Received.
  const [dirAsk, setDirAsk] = useState(false);
  const enter = (step: 'issued' | 'returns' | 'transfers', dir?: 'in' | 'out') => {
    to_(day, step);
    if (dir) setPendingDir(dir);
    signal('flow-again', step); // a fresh, empty form
    if (screen !== SCREEN[step]) { signal('step-form', step); go(SCREEN[step]); }
  };
  const none = (k: StepKey) => { if (stepState(k) === 'todo') markStep(k, 'none'); };
  const quit = () => { set(null); go('home'); };
  const wd = day === today() ? 'today' : `on ${weekdayName(day)}`;
  const count = (k: StepKey) => docsToday.filter((d) => STEPS.find((s) => s.key === k)!.kinds.includes(d.kind)).length;

  const submit = async () => {
    setBusy(true);
    try {
      const steps = Object.fromEntries(STEPS.map((s) => { const v: StepState = stepState(s.key); return [s.key, v === 'todo' ? 'none' : v]; }));
      await api.submitDay(day, steps);
      if (api.mode === 'training') {
        const real = today();
        try {
          const n = await progressStore.recordTrainingDay(real);
          toast(weekday(real) === 'Sun' ? 'Practice saved · Sundays don’t count as a training day' : n >= TRAINING_DAYS ? 'Training complete!' : `Training day ${n} of ${TRAINING_DAYS} done`);
        } catch { /* recorded next time */ }
      } else { toast(`${day === today() ? 'Today' : weekdayName(day)} submitted · balances are final`); signal('celebrate', `${day === today() ? 'Today' : weekdayName(day)} submitted`); }
      set(null);
      await refresh();
      if (catchUp) { await refreshPending(); endCatchUp(); }
      go('home');
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(false); }
  };

  let body: ReactNode;
  let size = 'sm';
  if (stage === 'askCard' || stage === 'askNoCard') {
    const first = stage === 'askNoCard';
    const before = count('issued'); // already entered during the day
    body = <Ask phone={phone} tone="out" kicker="Issued items" icon="card" title={first && !before ? (phone ? `Did the store give out anything ${wd}?` : `Anything issued ${wd}?`) : 'Anything else issued?'} sub="Answer from the issuance register."
      yes={{ label: 'Yes', long: 'Yes, open the register', hint: '', run: () => enter('issued') }}
      no={{ label: 'No', long: first && !before ? 'No, nothing went out' : 'No, that’s all', hint: '', run: () => { if (first && !before) none('issued'); to('askReturns'); } }} />;
  } else if (stage === 'askMoreReturns') {
    body = <Ask phone={phone} tone="back" kicker="Returns" icon="back" title="Were there other returns?" sub="Another lot brought back to the store."
      yes={{ label: 'Yes', long: 'Yes, enter another return', hint: '', run: () => enter('returns') }}
      no={{ label: 'No', long: 'No, that’s all', hint: '', run: () => to('askTransfer') }} />;
  } else if (stage === 'askReturns') {
    body = <Ask phone={phone} tone="back" kicker="Returns" icon="back" title={phone ? `Did anything come back to the store ${wd}?` : `Anything returned ${wd}?`} sub="Leftovers brought back from site."
      yes={{ label: 'Yes', long: 'Yes, enter the returns', hint: '', run: () => enter('returns') }}
      no={{ label: 'No', long: 'No, nothing came back', hint: '', run: () => { none('returns'); to('askTransfer'); } }} />;
  } else if (stage === 'askTransfer' || stage === 'askMoreTransfer') {
    const more = stage === 'askMoreTransfer';
    body = <Ask phone={phone} tone="trf" kicker="Project transfers" icon="swap" title={more ? 'Another transfer?' : `Any project transfers ${wd}?`} 
      yes={{ label: 'Yes', long: 'Yes', hint: '', run: () => setDirAsk(true) }}
      no={{ label: 'No', long: 'No', hint: '', run: () => { if (!more) none('transfers'); to('askSubmit'); } }} />;
  } else {
    size = 'lg';
    const rows = STEPS.map((s) => ({ s, n: count(s.key) }));
    body = (
      <div className="evAsk">
        <span className="evKick"><Icon name="check" size={14} />Last step</span>
        <h2 id="evTitle">Submit {day === today() ? 'today' : weekdayName(day)}?</h2>
        <div className="evSum">
          {rows.map(({ s, n }) => (
            <div key={s.key} className={n ? 'has' : ''}><Icon name={s.key === 'deliveries' ? 'truck' : s.key === 'issued' ? 'card' : s.key === 'returns' ? 'back' : 'swap'} size={16} />
              <span>{s.label}</span><b>{n ? `${n} entr${n === 1 ? 'y' : 'ies'}` : s.key === 'deliveries' && zoho ? 'From Zoho' : 'None'}</b></div>
          ))}
        </div>
        <p className="muted small">This locks the day.</p>
        <button className="evGo" disabled={busy} onClick={submit} autoFocus>{busy ? 'Submitting…' : 'Yes, submit'}<Icon name="check" size={18} /></button>
        <button className="btn link" onClick={() => to('askTransfer')}>Back</button>
      </div>
    );
  }

  if (dirAsk) return <DirectionPick onClose={() => setDirAsk(false)} onPick={(d) => { setDirAsk(false); enter('transfers', d); }} />;

  if (phone) return createPortal(
    <div className="evPage" role="dialog" aria-modal="true" aria-labelledby="evTitle">
      <header className="evPTop"><button onClick={quit} aria-label="Stop for now"><Icon name="chevL" size={24} /></button><b>{day === today() ? 'Tonight’s check-in' : `${weekdayName(day)}’s check-in`}</b><small>{at(stage) + 1} of 4</small></header>
      <div className="evPBars" aria-hidden="true">{ORDER.map((o, i) => <i key={o.key} className={i < at(stage) ? 'done' : i === at(stage) ? 'now' : ''} />)}</div>
      <div className={`evPBody ${size}`} key={stage}>{body}</div>
      <button className="evPQuit" onClick={quit}>Stop for now</button>
    </div>, document.body);

  return createPortal(
    <div className="sheetBack dayAskBack evBack">
      <section className={`evCard ${size}`} role="dialog" aria-modal="true" aria-labelledby="evTitle" key={stage}>
        <ol className="evSteps" aria-label="Evening check-in">
          {ORDER.map((o, i) => <li key={o.key} className={i < at(stage) ? 'done' : i === at(stage) ? 'now' : ''}><i />{o.label}</li>)}
        </ol>
        {body}
        <button className="evQuit" onClick={quit} aria-label="Stop for now">Stop for now</button>
      </section>
    </div>, document.body);
}

type Choice = { label: string; long?: string; hint: string; run: () => void };
function Ask({ kicker, icon, title, yes, yes2, no, phone, sub, tone }: { kicker: string; icon: string; title: string; yes?: Choice; yes2?: Choice[]; no: Choice; phone?: boolean; sub?: string; tone?: string }) {
  // Laptops: Y / N.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || /input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      if ((e.key === 'y' || e.key === 'Y') && yes) yes.run();
      if (e.key === 'n' || e.key === 'N') no.run();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [yes, no]);
  if (phone) return (
    <div className="evAsk evPAsk">
      <span className={`evPIc ${tone ?? ''}`}><Icon name={icon} size={28} /></span>
      <span className="evPKick">{kicker}</span>
      <h2 id="evTitle">{title}</h2>
      {sub && <p className="evPSub">{sub}</p>}
      <span className="evPGrow" />
      <div className="evPChoices">
        {(yes2 ?? [yes!]).map((c) => <button key={c.label} className="evPYes" onClick={c.run}>{c.long ?? c.label}<Icon name="arrow" size={18} /></button>)}
        <button className="evPNo" onClick={no.run}>{no.long ?? no.label}</button>
      </div>
    </div>
  );
  return (
    <div className="evAsk">
      <span className="evKick"><Icon name={icon} size={14} />{kicker}</span>
      <h2 id="evTitle">{title}</h2>
      <div className={`evChoices ${yes2 ? 'three' : ''}`}>
        {(yes2 ?? [yes!]).map((c, i) => (
          <button key={c.label} className="evYes" onClick={c.run} autoFocus={i === 0}><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}<Icon name="arrow" size={18} /></button>
        ))}
        <button className="evNo" onClick={no.run}><b>{no.label}</b>{no.hint && <small>{no.hint}</small>}</button>
      </div>
      {yes && <span className="evKeys"><kbd>Y</kbd> yes · <kbd>N</kbd> no</span>}
    </div>
  );
}
