import { useEffect, useMemo, useState } from 'react';
import { Icon, Num, PulseDot, greeting, useMinutesToClose } from '../components/fx';
import { signal, useSignal } from '../lib/signals';
import { closeLabel } from '../components/Shell';
import { api, progressStore } from '../lib/api';
import { Dashboard } from './Dashboard';
import { fmt } from '../components/ui';
import { longDate, niceDate, periodRange, today, weekday, weekdayName } from '../lib/dates';
import { consumption } from '../lib/consumption';
import { DayStrip, type DayCell } from '../components/DayStrip';
import { AlertButton } from '../components/StockAlert';
import { UnfinishedCard } from '../components/Unfinished';
import { TRAINING_DAYS } from '../lib/trainingPlan';
import { resetDemo } from '../lib/demoBackend';
import { STEPS, useData } from '../lib/store';
import { ask, toast } from '../components/feedback';
import { ADD_NOUN } from '../components/StepShell';
import type { StepKey, StepState } from '../lib/types';
import { openRecords, useAddEntry } from '../components/AddEntry';
import { useZohoDeliveries, ZohoTag } from '../components/Zoho';
import { startEvening, useFlow } from '../components/EveningFlow';

const STEP_ICON: Record<string, string> = { deliveries: 'truck', issued: 'card', returns: 'back', transfers: 'swap' };

export function Home() {
  const { day, user, balances, docsToday, stepState, submission, refresh, go, signOut, lowItems, daysLeft, itemById, recent,
    realToday, catchUp, pendingDays, startCatchUp, endCatchUp, closeDay, refreshPending, drafts, markStep } = useData();
  const zohoOnly = useZohoDeliveries();
  const { add, modal: addModal } = useAddEntry();
  // With Zoho on, deliveries come in by themselves: that step never waits for an answer.
  const stateOf = (k: StepKey): StepState => { const v = stepState(k); return k === 'deliveries' && zohoOnly && v === 'todo' ? 'none' : v; };
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
      await closeDay(d.day, d.holiday ?? 'Works closed');
      toast(`${weekdayName(d.day)} ${niceDate(d.day).split(' ').slice(1).join(' ')} marked Closed`);
      const rest = await refreshPending();
      setAskDay(null);
      if (catchUp || runTotal) nextMissed(rest);
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setClosing(false); }
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const min = useMinutesToClose();
  const states = STEPS.map((s) => stateOf(s.key));
  const firstTodo = STEPS.find((s) => stateOf(s.key) === 'todo');
  const answered = states.every((s) => s !== 'todo');
  const done = states.filter((s) => s !== 'todo').length;
  const first = user.name.split(' ')[0];
  const [showEntries, setShowEntries] = useState(false);
  // The evening check-in starts at the withdrawal cards (deliveries come in by themselves or are added any time).
  const flowStage = useFlow(day);
  const guided = !submission && !locked;
  const startHere: StepKey = 'issued';
  const start = () => startEvening(day, go, docsToday.some((d) => d.kind === 'issue'));
  const noneToday = (k: StepKey) => { const st = STEPS.find((x) => x.key === k)!; markStep(k, 'none'); toast(`${st.label}: nothing ${catchUp ? 'that day' : 'today'}`); };
  useSignal('entries', () => setShowEntries(true));
  const movedToday = new Set(docsToday.flatMap((d) => d.lines.map((l) => l.item_id))).size;

  const status = (i: number) => {
    const s = STEPS[i];
    const ds = docsToday.filter((d) => s.kinds.includes(d.kind));
    const lines = ds.reduce((a, d) => a + d.lines.length, 0);
    if (states[i] === 'done') return { text: 'Done', detail: `${ds.length} entr${ds.length === 1 ? 'y' : 'ies'} · ${lines} line${lines === 1 ? '' : 's'}`, cls: 'done' };
    if (s.key === 'deliveries' && zohoOnly) return { text: '', detail: ds.length ? `${ds.length} came in from Zoho today` : 'Received in Zoho · they appear here by themselves', cls: 'zoho' };
    if (states[i] === 'none') return { text: catchUp ? 'None that day' : 'None today', detail: 'Nothing to enter', cls: 'none' };
    if (!submission && (!locked ? s.key === 'issued' : firstTodo?.key === s.key)) return { text: 'Next', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: 'next' };
    return { text: 'Not started', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: '' };
  };

  const submit = async () => {
    const open = drafts.filter((d) => d.doc_date === day);
    const lines = docsToday.reduce((a, d) => a + d.lines.length, 0);
    const ok = await ask({
      title: `Submit ${new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}’s register?`,
      body: <>
        <div className="askList">{STEPS.map((s) => { const n = docsToday.filter((d) => s.kinds.includes(d.kind)).length; return <div key={s.key}><span>{s.label}</span><b>{n ? `${n} entr${n === 1 ? 'y' : 'ies'}` : 'Nothing'}</b></div>; })}</div>
        <p>{lines} item line{lines === 1 ? '' : 's'} in total. After submitting, today is locked and balances are final. Mistakes are fixed with a correction.</p>
        {open.length > 0 && <p className="askDraft"><b>{open.length} draft{open.length === 1 ? '' : 's'} not finished:</b> {open.map((d) => d.label).join(', ')}. {open.length === 1 ? 'It stays' : 'They stay'} in “to finish” and {open.length === 1 ? 'isn’t' : 'aren’t'} counted in stock until finished.</p>}
      </>,
      yes: 'Submit the day', no: 'Not yet', tone: 'go',
    });
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      await api.submitDay(day, Object.fromEntries(STEPS.map((s) => [s.key, stateOf(s.key)])));
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
  const toDash = (d: { tab: 'cons' | 'bal'; filter?: 'all' | 'low' | 'today'; item?: number; focus?: boolean; sort?: 'days' }) => signal('dash', d);
  // This week's consumption: the item using the biggest share of its stock leads the tile.
  const weekUse = useMemo(() => {
    const from = periodRange('week', day).from;
    const u = consumption(recent.filter((d) => d.doc_date >= from && d.doc_date <= day).flatMap((d) => d.lines));
    const rows = [...u.entries()].filter(([, x]) => x.used > 0).map(([id, x]) => ({ id, used: x.used, share: x.used / (x.used + Math.max(0, balances.find((b) => b.item_id === id)?.balance ?? 0) || 1) })).sort((a, z) => z.share - a.share);
    return { n: rows.length, top: rows[0] ? { ...rows[0], it: itemById.get(rows[0].id) } : null };
  }, [recent, day, balances, itemById]);
  const attention = [...lowItems].sort((a, b) => (a.balance <= 0 ? -1 : 0) - (b.balance <= 0 ? -1 : 0) || (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9)).slice(0, 6);
  const outCount = lowItems.filter((b) => b.balance <= 0).length;
  const lead = submission
    ? `Day submitted at ${new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}. Balances are final for today.`
    : answered ? 'All four steps are answered. Submit the day to lock it.'
      : done ? `${done} of 4 steps done. Next: ${firstTodo!.label.toLowerCase()}.` : `Four quick steps. ${closeLabel(min)}.`;

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
            <span className="phLead">{locked ? (pendingDays.length === 1 ? `Finish ${weekdayName(pendingDays[0].day)} first.` : `Finish ${pendingDays.length} earlier days first, oldest first.`) : lead}</span>
          </>}
        </div>
        <div className="phActions">
          <UnfinishedCard chip />
          <button className="btn ghost sm" onClick={() => setShowEntries(true)}><Icon name="list" size={16} />{catchUp ? `${wd}’s entries` : 'Today’s entries'}</button>
          {locked ? null : submission ? (
            <button className="btn sm" onClick={() => go('submitted')}>Today’s summary<Icon name="arrow" size={16} /></button>
          ) : answered ? (
            <button className="btn accent sm" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}<Icon name="check" size={16} /></button>
          ) : null}
        </div>
      </header>


      {/* Missed days: the question lives inside the day itself, no separate reminder box. */}
      {(locked || catchUp) && (
        <DayStrip days={[
          ...pendingDays.map((p, i): DayCell => {
            const ask = locked && i === 0;
            return {
              day: p.day, kind: p.day === day ? 'current' : catchUp || p.holiday ? 'holiday' : 'missing',
              sub: p.day === day ? 'Entering now'
                : ask ? (p.holiday ? `${p.holiday}. Were works closed?` : 'You did not submit records. Were works closed?')
                : p.holiday ?? (catchUp ? 'Next' : `After ${weekdayName(pendingDays[i - 1]?.day ?? p.day)}`),
              actions: ask ? <>
                <button className="dsBtn" disabled={closing} onClick={() => markClosed(p)}>Yes, closed</button>
                <button className="dsBtn go" onClick={() => beginCatchUp(p.day)}>No, enter records<Icon name="arrow" size={15} /></button>
              </> : undefined,
            };
          }),
          { day: realToday, kind: 'today', label: 'TODAY', sub: catchUp ? 'After these' : 'Waiting' },
        ]} />
      )}
      <section className="kpis" aria-label="Key figures">
        <button className="kpi enter" onClick={() => toDash({ tab: 'bal', filter: 'all', focus: true })}>
          <span className="kpiLabel">All items</span>
          <Num value={balances.length} className="kpiNum" />
          <span className="kpiFoot">Search the list <Icon name="arrow" size={13} /></span>
        </button>
        <button className={`kpi enter ${lowItems.length ? 'alert' : ''}`} style={{ animationDelay: '.04s' }} onClick={() => toDash({ tab: 'bal', filter: 'low' })}>
          <span className="kpiLabel">{lowItems.length > 0 && <PulseDot />}Low stock</span>
          <Num value={lowItems.length} className="kpiNum" />
          <span className="kpiFoot">{lowItems.length ? `${outCount} finished` : 'All good'}</span>
        </button>
        <button className={`kpi enter ${weekUse.n ? 'cons' : ''}`} style={{ animationDelay: '.08s' }} onClick={() => go('consumption')}>
          <span className="kpiLabel"><Icon name="chart" size={14} />Consumption</span>
          <span className="kpiNum">{weekUse.top ? <><Num value={weekUse.top.used} /><span className="kpiUnit">{weekUse.top.it?.unit} this week</span></> : '0'}</span>
          <span className="kpiFoot">{weekUse.top ? (weekUse.top.it?.name ?? 'Item') : 'Nothing used yet this week'} <Icon name="arrow" size={13} /></span>
        </button>
        <button className="kpi enter" style={{ animationDelay: '.12s' }} onClick={() => go('balances')}>
          <span className="kpiLabel">Balances</span>
          <span className="kpiNum"><Num value={balances.filter((b) => b.balance > 0).length} /><span className="kpiUnit">in store</span></span>
          <span className="kpiFoot">{movedToday ? `${movedToday} changed today` : 'Open balances'} <Icon name="arrow" size={13} /></span>
        </button>
      </section>

      <div className="homeGrid">
        <section className={`panel process enter ${locked ? 'lockedPanel' : ''}`} aria-label="Today’s process" aria-disabled={locked || undefined}>
          <header className="panelHead">
            <span className="phTitle"><b>{catchUp ? `${wd}’s process` : 'Today’s process'}</b><span className="muted small">{submission ? 'Submitted' : `${done} of 4 done`}</span></span>
          </header>
          <div className="procBar" aria-hidden="true"><i style={{ width: `${((submission ? 4 : done) / 4) * 100}%` }} /></div>
          {STEPS.map((s, i) => {
            const st = status(i);
            const canAdd = !(s.key === 'deliveries' && zohoOnly);
            return (
              <div key={s.key} className={`procRow ${st.cls} ${s.key === 'deliveries' ? 'dim' : ''}`}>
                <button className="procMain" onClick={() => openRecords(go, s.key)} title={`See ${s.label.toLowerCase()}`}>
                  <span className="procDot">{st.cls === 'done' ? <Icon name="check" size={16} /> : st.cls === 'none' || st.cls === 'zoho' || s.key === 'deliveries' ? '–' : i /* deliveries is not numbered: 1 issued, 2 returns, 3 transfers */}</span>
                  <span className="procIc"><Icon name={STEP_ICON[s.key]} size={18} /></span>
                  <span className="procText"><b>{s.label}</b><span>{st.detail}</span></span>
                </button>
                {guided && s.key === startHere && (
                  <button className={`procStart ${flowStage ? 'cont' : ''}`} onClick={start} title="Cards, returns, transfers, then submit: one question at a time">
                    {flowStage ? 'Continue' : 'Start here'}<Icon name="arrow" size={16} />
                  </button>
                )}
                <span className="procActs">
                  {st.cls === 'zoho' ? <ZohoTag /> : guided && s.key === startHere ? null : guided ? <span className={`stPill ${st.cls === 'done' ? 'ok' : 'idle'}`}>{st.cls === 'done' ? 'Done' : st.cls === 'none' ? st.text : 'Waiting'}</span> : states[i] === 'todo' && !submission
                    ? <button className="procNone" onClick={() => noneToday(s.key)} title={`Nothing for ${s.label.toLowerCase()} ${catchUp ? 'that day' : 'today'}`}>None today</button>
                    : states[i] === 'none' && !submission && !(s.key === 'deliveries' && zohoOnly)
                      ? <button className="stPill idle asBtn" onClick={() => markStep(s.key, 'todo')} title="Undo">{st.text}</button>
                      : <span className={`stPill ${st.cls === 'done' ? 'ok' : st.cls === 'next' ? 'warn' : 'idle'}`}>{st.text}</span>}
                  {guided ? null : canAdd
                    ? <button className="procAdd" onClick={() => add(s.key)} aria-label={`Add ${ADD_NOUN[s.key]}`} title={`Add ${ADD_NOUN[s.key]}`}><Icon name="plus" size={18} /></button>
                    : <span className="procAdd off" title="Deliveries come in from Zoho" aria-hidden="true" />}
                </span>
              </div>
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
            <AlertButton />
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
      {addModal}
      {askDay && (
        <div className="sheetBack dayAskBack">
          <section className="dayAsk" role="dialog" aria-modal="true" aria-labelledby="dayAskTitle">
            <span className="daDone"><Icon name="check" size={14} />{catchUp ? `${wd} submitted` : 'Earlier day done'}</span>
            <h2 id="dayAskTitle">Were works closed on {weekdayName(askDay.day)} {niceDate(askDay.day).split(' ').slice(1).join(' ')}?</h2>
            {askDay.holiday && <p className="muted">It was {askDay.holiday}, a public holiday.</p>}
            <button className="daChoice dark" disabled={closing} onClick={() => markClosed(askDay)}>
              <span><b>Yes, works were closed</b><small>Nothing came in or went out. {weekdayName(askDay.day)} is marked Closed.</small></span><Icon name="arrow" size={20} />
            </button>
            <button className="daChoice" disabled={closing} onClick={() => { const d = askDay.day; setAskDay(null); beginCatchUp(d); }}>
              <span><b>No, there was work</b><small>Enter {weekdayName(askDay.day)}’s records the same way.</small></span><Icon name="arrow" size={20} />
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
              <button className="entBandHead" onClick={() => { onClose(); openRecords(go, st.key); }} aria-label={`${st.label}: ${ds.length} · open the list`}>
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
