import { useEffect, useState } from 'react';
import { Icon, Num, PulseDot, greeting, useMinutesToClose } from '../components/fx';
import { signal, useSignal } from '../lib/signals';
import { closeLabel } from '../components/Shell';
import { api, progressStore } from '../lib/api';
import { Dashboard } from './Dashboard';
import { fmt } from '../components/ui';
import { longDate, niceDate, today, weekday, weekdayName } from '../lib/dates';
import { DayStrip, type DayCell } from '../components/DayStrip';
import { UnfinishedCard } from '../components/Unfinished';
import { TRAINING_DAYS } from '../lib/trainingPlan';
import { resetDemo } from '../lib/demoBackend';
import { STEPS, useData } from '../lib/store';
import { ask, toast } from '../components/feedback';
import { ADD_NOUN } from '../components/StepShell';
import type { StepKey } from '../lib/types';

const STEP_ICON: Record<string, string> = { deliveries: 'truck', issued: 'card', returns: 'back', transfers: 'swap' };

export function Home() {
  const { day, user, balances, docsToday, stepState, submission, refresh, go, signOut, lowItems, daysLeft, itemById,
    realToday, catchUp, pendingDays, startCatchUp, endCatchUp, closeDay, refreshPending, drafts } = useData();
  const locked = !catchUp && pendingDays.length > 0;
  const [runTotal, setRunTotal] = useState(0);
  const [askDay, setAskDay] = useState<{ day: string; holiday: string | null } | null>(null);
  const [closing, setClosing] = useState(false);
  const wd = weekdayName(day);
  const runIndex = Math.max(1, runTotal - pendingDays.length + 1);
  const beginCatchUp = (d: string) => { if (!catchUp) setRunTotal(pendingDays.length); startCatchUp(d); window.scrollTo(0, 0); };
  // After a missed day is done: ask about the next one, or go back to today.
  const nextMissed = (rest: { day: string; holiday: string | null }[]) => {
    if (!rest.length) { endCatchUp(); setRunTotal(0); toast('All caught up · today is open'); return; }
    setAskDay(rest[0]);
  };
  const markClosed = async (d: { day: string; holiday: string | null }) => {
    setClosing(true);
    try {
      await closeDay(d.day, d.holiday ?? 'Store closed');
      toast(`${weekdayName(d.day)} ${niceDate(d.day).split(' ').slice(1).join(' ')} marked Closed`);
      const rest = await refreshPending();
      setAskDay(null);
      if (catchUp || runTotal) nextMissed(rest);
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setClosing(false); }
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [lastTake, setLastTake] = useState<string | null | undefined>(undefined);
  const min = useMinutesToClose();
  const states = STEPS.map((s) => stepState(s.key));
  const firstTodo = STEPS.find((s) => stepState(s.key) === 'todo');
  const answered = states.every((s) => s !== 'todo');
  const done = states.filter((s) => s !== 'todo').length;
  const entries = docsToday.filter((d) => d.kind !== 'opening').length;
  const first = user.name.split(' ')[0];
  const [showEntries, setShowEntries] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  // After submitting: ask, show what was already entered today for that step, then open its form.
  const addTo = async (key: StepKey) => {
    const st = STEPS.find((x) => x.key === key)!;
    const ds = docsToday.filter((d) => st.kinds.includes(d.kind));
    const ok = await ask({
      title: `Add ${ADD_NOUN[key]}?`,
      body: ds.length ? <>
        <p>Already entered today for {st.label.toLowerCase()}:</p>
        <div className="askList">{ds.map((d) => <div key={d.id}><span>{[KIND_LABEL[d.kind], d.ref_no, d.party].filter(Boolean).join(' · ')}</span><b>{d.lines.map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)}`).join(', ')}</b></div>)}</div>
      </> : <p>Nothing was entered for {st.label.toLowerCase()} today yet.</p>,
      yes: `Add ${ADD_NOUN[key]}`, no: 'Cancel', tone: 'go',
    });
    if (!ok) return;
    signal('step-form', key);
    go(st.screen);
  };
  useSignal('entries', () => setShowEntries(true));
  useEffect(() => { api.stockTakes().then((t) => setLastTake(t.map((x) => x.count_date).sort().pop() ?? null)).catch(() => setLastTake(null)); }, []);

  const status = (i: number) => {
    const s = STEPS[i];
    const ds = docsToday.filter((d) => s.kinds.includes(d.kind));
    const lines = ds.reduce((a, d) => a + d.lines.length, 0);
    if (states[i] === 'done') return { text: 'Done', detail: `${ds.length} entr${ds.length === 1 ? 'y' : 'ies'} · ${lines} line${lines === 1 ? '' : 's'}`, cls: 'done' };
    if (states[i] === 'none') return { text: catchUp ? 'Nothing that day' : 'Nothing today', detail: 'Answered “No”', cls: 'done' };
    if (!submission && firstTodo?.key === s.key) return { text: 'Next', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: 'next' };
    return { text: 'Not started', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: '' };
  };

  const submit = async () => {
    const open = drafts.filter((d) => d.doc_date === day);
    if (open.length) {
      await ask({ title: `${catchUp ? wd : 'Today'} can't be submitted yet`, body: <>
        <p>{open.length} draft{open.length === 1 ? ' isn’t' : 's aren’t'} finished: {open.map((d) => d.label).join(', ')}.</p>
        <p>Finish {open.length === 1 ? 'it' : 'them'} or discard {open.length === 1 ? 'it' : 'them'} from the list at the top first. Details still to confirm don’t block submitting.</p></>,
        yes: 'OK', no: 'Close' });
      return;
    }
    const lines = docsToday.reduce((a, d) => a + d.lines.length, 0);
    const ok = await ask({
      title: `Submit ${new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}’s register?`,
      body: <>
        <div className="askList">{STEPS.map((s) => { const n = docsToday.filter((d) => s.kinds.includes(d.kind)).length; return <div key={s.key}><span>{s.label}</span><b>{n ? `${n} entr${n === 1 ? 'y' : 'ies'}` : 'Nothing'}</b></div>; })}</div>
        <p>{lines} item line{lines === 1 ? '' : 's'} in total. After submitting, today is locked and balances are final. Mistakes are fixed with a correction.</p>
      </>,
      yes: 'Submit the day', no: 'Not yet', tone: 'go',
    });
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      await api.submitDay(day, Object.fromEntries(STEPS.map((s) => [s.key, stepState(s.key)])));
      if (api.mode === 'training') {
        // A submitted practice evening counts as one training day on the real account (not on Sundays).
        const real = today();
        try {
          const n = await progressStore.recordTrainingDay(real);
          toast(weekday(real) === 'Sun' ? 'Practice saved · Sundays don’t count as a training day'
            : n >= TRAINING_DAYS ? `Training day ${Math.min(n, TRAINING_DAYS)} of ${TRAINING_DAYS} done · training complete!` : `Training day ${n} of ${TRAINING_DAYS} done`);
        } catch { toast('Practice saved, but the training day could not be recorded. Check the connection.', 'warn'); }
      }
      if (catchUp) {
        const rest = await refreshPending();
        toast(`${wd} submitted`);
        nextMissed(rest);
        return;
      }
      await refresh();
      go('submitted');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const toDash = (d: { tab: 'cons' | 'bal'; filter?: 'all' | 'low' | 'today'; item?: number }) => signal('dash', d);
  const attention = [...lowItems].sort((a, b) => (a.balance <= 0 ? -1 : 0) - (b.balance <= 0 ? -1 : 0) || (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9)).slice(0, 6);
  const outCount = lowItems.filter((b) => b.balance <= 0).length;
  const lead = submission
    ? `Day submitted at ${new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}. Balances are final for today.`
    : answered ? 'All four steps are answered. Submit the day to lock it.'
      : done ? `${done} of 4 steps done. Next: ${firstTodo!.label.toLowerCase()}.` : `Four quick steps. ${closeLabel(min)}.`;
  const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="page home">
      <header className="pageHead enter">
        <div className="phText">
          {catchUp ? <>
            <span className="phKicker catch">Catch-up · day {runIndex} of {Math.max(runTotal, runIndex)}</span>
            <h1>{wd}’s check-in</h1>
            <span className="phLead">Use {wd}’s delivery notes and withdrawal cards. Everything saved here is dated {niceDate(day)}.</span>
          </> : <>
            <span className="phKicker">Evening check-in · {longDate(day)}{api.mode === 'demo' ? ' · Demo' : ''}</span>
            <h1>{greeting()}, {first}</h1>
            <span className="phLead">{locked ? `${pendingDays.length} earlier day${pendingDays.length === 1 ? '' : 's'} need${pendingDays.length === 1 ? 's' : ''} you before today.` : lead}</span>
          </>}
        </div>
        <div className="phActions">
          <button className="btn ghost sm" onClick={() => setShowEntries(true)}><Icon name="list" size={16} />{catchUp ? `${wd}’s entries` : 'Today’s entries'}</button>
          {locked ? (
            <button className="btn sm" onClick={() => beginCatchUp(pendingDays[0].day)}>Enter {weekdayName(pendingDays[0].day)}’s papers<Icon name="arrow" size={16} /></button>
          ) : submission ? (
            <button className="btn sm" onClick={() => go('submitted')}>Today’s summary<Icon name="arrow" size={16} /></button>
          ) : answered ? (
            <button className="btn accent sm" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}<Icon name="check" size={16} /></button>
          ) : (
            <button className="btn sm" onClick={() => go(firstTodo!.screen)}>{done ? `Continue · ${firstTodo!.label}` : 'Start check-in'}<Icon name="arrow" size={16} /></button>
          )}
        </div>
      </header>


      {(locked || catchUp) && (
        <DayStrip days={[
          ...pendingDays.map((p): DayCell => ({ day: p.day, kind: p.day === day ? 'current' : catchUp || p.holiday ? 'holiday' : 'missing',
            sub: p.day === day ? 'Entering now' : p.holiday ?? (catchUp ? 'Next' : 'Not submitted') })),
          { day: realToday, kind: 'today', label: 'TODAY', sub: catchUp ? 'After these' : 'Waiting' },
        ]} />
      )}
      {locked && (
        <section className="panel catchCard enter" aria-label="Days to catch up">
          <header className="ccHead">
            <span className="ccBang" aria-hidden="true">!</span>
            <div><b>{pendingDays.length} day{pendingDays.length === 1 ? '' : 's'} need{pendingDays.length === 1 ? 's' : ''} you before today</b><span>Do them in order. Each one is saved under its own date, not today’s.</span></div>
          </header>
          {pendingDays.map((p, i) => (
            <div key={p.day} className="ccRow">
              <div className="ccText"><b>{weekdayName(p.day)} {niceDate(p.day).split(' ').slice(1).join(' ')}{p.holiday ? ` · ${p.holiday}` : ''}</b>
                <span>{i === 0 ? (p.holiday ? 'Public holiday. Was the store open?' : 'Nothing entered and not submitted') : `After ${weekdayName(pendingDays[i - 1].day)}`}</span></div>
              {i === 0 ? (
                <span className="ccActs">
                  <button className="btn link" disabled={closing} onClick={() => markClosed(p)}>Store was closed</button>
                  <button className="btn sm" onClick={() => beginCatchUp(p.day)}>Enter {weekdayName(p.day)}’s papers<Icon name="arrow" size={16} /></button>
                </span>
              ) : <span className="stPill idle">Waiting</span>}
            </div>
          ))}
        </section>
      )}
      <UnfinishedCard />
      <section className="kpis" aria-label="Key figures">
        <button className="kpi enter" onClick={() => toDash({ tab: 'bal', filter: 'all' })}>
          <span className="kpiLabel">Items in store</span>
          <Num value={balances.filter((b) => b.balance > 0).length} className="kpiNum" />
          <span className="kpiFoot">Open balances <Icon name="arrow" size={13} /></span>
        </button>
        <button className={`kpi enter ${lowItems.length ? 'alert' : ''}`} style={{ animationDelay: '.04s' }} onClick={() => toDash({ tab: 'bal', filter: 'low' })}>
          <span className="kpiLabel">{lowItems.length > 0 && <PulseDot />}Low stock</span>
          <Num value={lowItems.length} className="kpiNum" />
          <span className="kpiFoot">{lowItems.length ? `${outCount} finished` : 'All good'}</span>
        </button>
        <button className="kpi enter" style={{ animationDelay: '.08s' }} onClick={() => setShowEntries(true)}>
          <span className="kpiLabel">{catchUp ? `Entries on ${wd}` : 'Entries today'}</span>
          <Num value={entries} className="kpiNum" />
          <span className="kpiFoot">{entries ? 'See the list' : 'Cards, notes, transfers'} <Icon name="arrow" size={13} /></span>
        </button>
        <button className="kpi enter" style={{ animationDelay: '.12s' }} onClick={() => go('stocktake')}>
          <span className="kpiLabel">Last stock take</span>
          <span className="kpiNum">{lastTake === undefined ? <i className="skel" style={{ width: 90, height: 28 }} /> : lastTake ? nice(lastTake) : 'None'}</span>
          <span className="kpiFoot">Stock take <Icon name="arrow" size={13} /></span>
        </button>
      </section>

      <div className="homeGrid">
        <section className={`panel process enter ${locked ? 'lockedPanel' : ''}`} aria-label="Today’s process" aria-disabled={locked || undefined}>
          <header className="panelHead">
            <span className="phTitle"><b>{catchUp ? `${wd}’s process` : 'Today’s process'}</b><span className="muted small">{submission ? 'Submitted' : `${done} of 4 done`}</span></span>
            {submission ? (
              <span className="plusWrap">
                <button className="plusBtn" aria-label="Add" aria-expanded={plusOpen} aria-haspopup="menu" onClick={() => setPlusOpen((v) => !v)}><Icon name="plus" size={22} /></button>
                {plusOpen && (
                  <span className="plusMenu" role="menu" onMouseLeave={() => setPlusOpen(false)}>
                    {STEPS.map((st) => <button key={st.key} role="menuitem" onClick={() => { setPlusOpen(false); addTo(st.key); }}><Icon name={STEP_ICON[st.key]} size={18} />Add {ADD_NOUN[st.key]}</button>)}
                  </span>
                )}
              </span>
            ) : (
              <button className="btn sm startBtn" disabled={busy} onClick={() => (firstTodo ? go(firstTodo.screen) : submit())}>Start<Icon name="arrow" size={16} /></button>
            )}
          </header>
          <div className="procBar" aria-hidden="true"><i style={{ width: `${((submission ? 4 : done) / 4) * 100}%` }} /></div>
          {STEPS.map((s, i) => {
            const st = status(i);
            return (
              <button key={s.key} className={`procRow ${st.cls}`} onClick={() => (submission ? addTo(s.key) : go(s.screen))}>
                <span className="procDot">{st.cls === 'done' ? <Icon name="check" size={16} /> : s.n}</span>
                <span className="procIc"><Icon name={STEP_ICON[s.key]} size={18} /></span>
                <span className="procText"><b>{s.label}</b><span>{st.detail}</span></span>
                <span className={`stPill ${st.cls === 'done' ? 'ok' : st.cls === 'next' ? 'warn' : 'idle'}`}>{st.text}</span>
                <span className="procGo">{submission ? 'Add' : st.cls === 'done' ? 'Review' : 'Open'}<Icon name={submission ? 'plus' : 'arrow'} size={14} /></span>
              </button>
            );
          })}
          {!submission && (
            <footer className="panelFoot">
              <span className="small muted">{catchUp ? `Submitting locks ${wd}. Balances update as if it was entered on ${wd}.` : 'Submitting locks today. Cards can be entered during the day too.'}</span>
              <button className="btn accent sm" disabled={!answered || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}</button>
            </footer>
          )}
          {err && <div className="note err" role="alert" style={{ margin: 12 }}>{err}</div>}
          {locked && <div className="lockNote">Today opens after the earlier day{pendingDays.length === 1 ? '' : 's'} above.</div>}
        </section>

        <aside className="homeAside">
          <section className="panel enter" aria-label="Needs attention" style={{ animationDelay: '.06s' }}>
            <header className="panelHead"><b>{lowItems.length > 0 && <PulseDot />}Needs attention</b>{lowItems.length > 0 && <button className="btn link" onClick={() => toDash({ tab: 'bal', filter: 'low' })}>All {lowItems.length}</button>}</header>
            {!attention.length && <div className="pad small muted">Nothing is low. All good.</div>}
            {attention.map((b) => {
              const dl = daysLeft(b);
              return (
                <button key={b.item_id} className="attRow" onClick={() => toDash({ tab: 'bal', item: b.item_id })}>
                  <span className="attName">{b.name}</span>
                  <span className={`attVal ${b.balance <= 0 ? 'out' : ''}`}>{b.balance <= 0 ? 'Finished' : dl != null && dl < 30 ? `${Math.max(0, Math.round(dl))} day${Math.round(dl) === 1 ? '' : 's'} left` : `${fmt(b.balance)} ${b.unit}`}</span>
                </button>
              );
            })}
          </section>
          <section className="panel tip enter" style={{ animationDelay: '.14s' }}>
            <span><kbd>Ctrl</kbd> <kbd>K</kbd> finds any item, page or action.</span>
            <button className="btn link" onClick={() => signal('palette')}>Try it</button>
          </section>
        </aside>
      </div>

      <Dashboard embedded />

      <div className="between small homeFoot">
        <span className="muted">Signed in as {user.name}</span>
        <span className="row">
          {api.mode === 'demo' && <button className="btn link" onClick={() => { resetDemo(); location.reload(); }}>Reset demo</button>}
          <button className="btn link" onClick={signOut}>Sign out</button>
        </span>
      </div>
      {showEntries && <EntriesSheet onClose={() => setShowEntries(false)} />}
      {askDay && (
        <div className="sheetBack dayAskBack">
          <section className="dayAsk" role="dialog" aria-modal="true" aria-labelledby="dayAskTitle">
            <span className="daDone"><Icon name="check" size={14} />{catchUp ? `${wd} submitted` : 'Earlier day done'}</span>
            <h2 id="dayAskTitle">Was the store open on {weekdayName(askDay.day)} {niceDate(askDay.day).split(' ').slice(1).join(' ')}?</h2>
            {askDay.holiday && <p className="muted">It was {askDay.holiday}, a public holiday.</p>}
            <button className="daChoice dark" disabled={closing} onClick={() => markClosed(askDay)}>
              <span><b>No, the store was closed</b><small>Nothing came in or went out. {weekdayName(askDay.day)} is marked Closed.</small></span><Icon name="arrow" size={20} />
            </button>
            <button className="daChoice" disabled={closing} onClick={() => { const d = askDay.day; setAskDay(null); beginCatchUp(d); }}>
              <span><b>Yes, it was open</b><small>Enter {weekdayName(askDay.day)}’s papers the same way.</small></span><Icon name="arrow" size={20} />
            </button>
            <button className="btn link" onClick={() => { setAskDay(null); endCatchUp(); setRunTotal(0); }}>Decide later</button>
          </section>
        </div>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { delivery: 'Delivery', issue: 'Withdrawal card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction', opening: 'Stock take' };

/** One colour and icon per category, so each is told apart at a glance. */
const CAT: Record<string, { tag: string; icon: string }> = {
  deliveries: { tag: 'Stock in', icon: 'M12 4v12M6 10l6 6 6-6M5 20h14' },
  issued: { tag: 'Stock out', icon: 'M12 20V8M6 14l6-6 6 6M5 4h14' },
  returns: { tag: 'Back in', icon: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  transfers: { tag: 'In / out', icon: 'M4 8h14l-4-4M20 16H6l4 4' },
};

/** Today's entries, grouped by step, with the option to open the step. */
function EntriesSheet({ onClose }: { onClose: () => void }) {
  const { docsToday, itemById, go, submission } = useData();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k); document.body.classList.add('noScroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noScroll'); };
  }, [onClose]);
  const list = docsToday.filter((d) => d.kind !== 'opening').sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="entTitle">
        <div className="sheetHandle" aria-hidden />
        <header className="sheetHead"><div><span className="chip">Today</span><h3 id="entTitle">{list.length} entr{list.length === 1 ? 'y' : 'ies'} today</h3></div><button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        {STEPS.map((st) => {
          const ds = list.filter((d) => st.kinds.includes(d.kind));
          const c = CAT[st.key];
          return (
            <div key={st.key} className={`entBand ${st.key} ${ds.length ? 'has' : ''}`}>
              <button className="entBandHead" onClick={() => { onClose(); go(st.screen); }} aria-label={`${st.label}: ${ds.length} · open step ${st.n}`}>
                <span className="ebIc" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d={c.icon} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <b className="ebName">{st.label}</b>
                <span className="ebTag">{c.tag}</span>
                <span className="ebCount mono">{ds.length}</span>
              </button>
              {ds.length > 0 && <div className="entBandBody">
              {ds.map((d) => {
                const late = !!submission && d.created_at > submission.submitted_at;
                return (
                  <div key={d.id} className="entCard">
                    <div className="between"><b>{KIND_LABEL[d.kind]}{d.ref_no ? ` · ${d.kind === 'issue' ? 'card ' : ''}${d.ref_no}` : ''}{late && <span className="pill late">Added</span>}</b><span className="mono small muted">{d.doc_time ?? new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}</span></div>
                    {(d.party || d.activity) && <div className="small muted">{[d.party, d.activity, d.gemba].filter(Boolean).join(' · ')}</div>}
                    {d.lines.map((l) => <div key={l.id} className="ln"><span>{itemById.get(l.item_id)?.name ?? 'Item'}</span><span className="mono">{fmt(l.qty)} {itemById.get(l.item_id)?.unit}</span></div>)}
                  </div>
                );
              })}
              </div>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
