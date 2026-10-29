import { useEffect, useMemo, useState } from 'react';
import { Icon, Num, Ring as StepRing, greeting, useMinutesToClose } from '../components/fx';
import { useSignal } from '../lib/signals';
import { closeLabel } from '../components/Shell';
import { api, progressStore } from '../lib/api';
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
import { useZohoDeliveries } from '../components/Zoho';
import { openItems } from './Dashboard';
import { continueEvening, startEvening, useFlow } from '../components/EveningFlow';
import { IncomingPanel, useIncomingCounts } from '../components/Incoming';
import { Ring } from '../components/Ring';
import { canEdit } from '../lib/access';
import { GetStarted } from '../components/Tour';


export function Home() {
  const { day, user, balances, docsToday, stepState, submission, refresh, go, signOut, lowItems, daysLeft, itemById, recent,
    realToday, catchUp, pendingDays, startCatchUp, endCatchUp, closeDay, refreshPending, drafts } = useData();
  const zohoOnly = useZohoDeliveries();
  const { add, modal: addModal } = useAddEntry();
  // With Zoho on, deliveries come in by themselves: that step never waits for an answer.
  const stateOf = (k: StepKey): StepState => { const v = stepState(k); return k === 'deliveries' && zohoOnly && v === 'todo' ? 'none' : v; };
  const viewer = !canEdit(user);
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
  const start = () => startEvening(day, go, docsToday.some((d) => d.kind === 'issue'));
  // Evening mode: from 2 hours before the register closes (or once started) the process moves to the top and glows.
  const evening = guided && (min <= 120 || done > 0 || !!flowStage);
  const inStore = balances.filter((b) => b.balance > 0).length;
  // This week's use by day (Mon–Sun): what was issued, for the little bar chart.
  const { weekBars, todayIdx } = useMemo(() => {
    const from = periodRange('week', day).from;
    const bars = Array(7).fill(0) as number[];
    recent.filter((d) => d.kind === 'issue' && d.doc_date >= from && d.doc_date <= day).forEach((d) => {
      const i = (new Date(d.doc_date + 'T00:00:00Z').getUTCDay() + 6) % 7; bars[i] += d.lines.reduce((a, l) => a + Number(l.qty), 0);
    });
    return { weekBars: bars, todayIdx: (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7 };
  }, [recent, day]);
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
  const toDash = (d: { tab: 'cons' | 'bal'; filter?: 'all' | 'low' | 'today'; item?: number; focus?: boolean; sort?: 'days' }) => openItems(go, d);
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
    : answered ? 'All three steps are answered. Submit the day to lock it.'
      : done ? `${STEPS.filter((x) => x.key !== 'deliveries' && stateOf(x.key) !== 'todo').length} of 3 steps done. Next: ${firstTodo?.label.toLowerCase() ?? 'submit the day'}.` : `Three quick steps. ${closeLabel(min)}.`;

  // ───── Today's process (design 3): a ring that fills, three step tiles, then Submit.
  const STEP3: StepKey[] = ['issued', 'returns', 'transfers'];
  const done3 = STEP3.filter((k) => stateOf(k) !== 'todo').length;
  const flowStep: StepKey | 'submit' | null = !flowStage ? null : /issued|Card/.test(flowStage) ? 'issued' : /eturns/.test(flowStage) ? 'returns' : /ransfer/.test(flowStage) ? 'transfers' : 'submit';
  const nowKey: StepKey | 'submit' | null = !guided ? null : flowStep ?? 'issued';
  const go3 = () => (flowStage ? continueEvening(day, go) : start());
  const delDocs = docsToday.filter((d) => d.kind === 'delivery').length;
  // The three steps live behind the Start button, in a pop-up (the dashboard keeps its space).
  const [procOpen, setProcOpen] = useState(false);
  useSignal('proc', () => { if (!locked) setProcOpen(true); });
  useEffect(() => {
    if (!procOpen) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setProcOpen(false); };
    document.addEventListener('keydown', k); document.body.classList.add('noScroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noScroll'); };
  }, [procOpen]);
  const nextLabel = flowStep === 'submit' ? 'submit' : flowStep ? STEPS.find((x) => x.key === flowStep)!.label.toLowerCase().replace('issued to production', 'cards').replace('returned to store', 'returns').replace('project transfers', 'transfers') : '';
  const sb = submission
    ? { cls: 'done', label: 'Day submitted', sub: 'Summary', run: () => go('submitted') }
    : flowStage
      ? { cls: 'cont', label: 'Continue', sub: `${done3}/3 · next: ${nextLabel}`, run: go3 }
      : { cls: '', label: 'Start', sub: `${done3}/3 · ${min <= 0 ? 'register closed' : closeLabel(min).replace('Register closes in ', 'closes in ')}`, run: () => setProcOpen(true) };
  const startBtn = locked || viewer ? null : (
    <button className={`startBtn ${sb.cls} ${evening && !submission ? 'pulse' : ''}`} onClick={sb.run}>
      <Ring p={submission ? 1 : done3 / 3} size={30} stroke={4} label="" tone={submission ? 'green' : 'amber'} />
      <span className="sbT"><b>{sb.label}</b><small>{sb.sub}</small></span>
      <Icon name={submission ? 'check' : 'arrow'} size={17} />
    </button>
  );
  const procPop = procOpen && !locked && (
    <div className="sheetBack ppBack" onMouseDown={(e) => { if (e.target === e.currentTarget) setProcOpen(false); }}>
      <section className="ppCard" role="dialog" aria-modal="true" aria-labelledby="ppTitle">
        <span className="ppGrab" aria-hidden="true" />
        <header className="ppHead">
          <Ring p={submission ? 1 : done3 / 3} size={84} stroke={10} label={submission ? '✓' : `${done3}/3`} tone="amber" dark />
          <span className="ppHT">
            <span className="ppKick">{catchUp ? `Catch-up · ${wd}` : 'Evening check-in'}</span>
            <b id="ppTitle">{catchUp ? `${wd}’s process` : 'Today’s process'}</b>
            <span>{submission ? `Submitted at ${new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}` : closeLabel(min)} · <button className="p3Del" onClick={() => { setProcOpen(false); openRecords(go, 'deliveries'); }}>Deliveries: {zohoOnly ? `${delDocs} in from Zoho` : delDocs ? `${delDocs} entered` : 'none yet'}</button></span>
          </span>
          <button className="ppX" onClick={() => setProcOpen(false)} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        <div className="ppSteps">
          {STEP3.map((k) => {
            const i = STEPS.findIndex((x) => x.key === k); const s = STEPS[i]; const st = status(i); const v = stateOf(k);
            const isNow = nowKey === k;
            return (
              <div key={k} className={`ppStep ${isNow ? 'now' : ''} ${v}`}>
                <span className="ppNo">{v === 'done' ? <Icon name="check" size={16} /> : v === 'none' ? '–' : i}</span>
                <button className="ppST" onClick={() => { setProcOpen(false); openRecords(go, k); }} title={`See ${s.label.toLowerCase()}`}>
                  <b>{s.label}</b><span>{v === 'todo' ? s.desc : st.detail}</span>
                </button>
                {isNow ? <button className="ppGo" onClick={() => { setProcOpen(false); go3(); }} autoFocus>{flowStage ? 'Continue' : 'Start here'}<Icon name="arrow" size={16} /></button>
                  : <span className={`p3Pill ${v}`}>{v === 'done' ? 'Done' : v === 'none' ? (catchUp ? 'None that day' : 'None today') : 'Waiting'}</span>}
                {!guided && <button className="procAdd" onClick={() => { setProcOpen(false); add(k); }} aria-label={`Add ${ADD_NOUN[k]}`} title={`Add ${ADD_NOUN[k]}`}><Icon name="plus" size={18} /></button>}
              </div>
            );
          })}
        </div>
        <footer className="ppFoot">
          <span>{submission ? 'The day is locked. Late entries go in with +.' : 'Then submit the day. Deliveries are added any time (from Zoho or with +).'}</span>
          {submission ? <button className="btn sm" onClick={() => { setProcOpen(false); go('submitted'); }}>Today’s summary<Icon name="arrow" size={16} /></button>
            : <button className={`ppSubmit ${answered ? 'ready' : ''}`} disabled={!answered || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}{answered && <Icon name="check" size={16} />}</button>}
        </footer>
        {err && <div className="note err" role="alert" style={{ margin: '0 20px 16px' }}>{err}</div>}
      </section>
    </div>
  );

  // Wording: all finished → "n items are finished"; otherwise "n items are running low".
  const nLow = lowItems.length, lowOnly = nLow - outCount;
  const lowHead = `${nLow} item${nLow === 1 ? ' is' : 's are'} ${outCount === nLow ? 'finished' : 'running low'}`;
  const lowSub = outCount === nLow ? 'Nothing left on the shelf. Order them now.' : outCount ? 'Some are out of stock, the rest will be soon.' : 'They will be out of stock soon.';
  const urgent = attention.slice(0, 3);
  const inc = useIncomingCounts();
  const [lastTake, setLastTake] = useState<number | null>(null);
  useEffect(() => {
    api.stockTakes().then((t) => {
      const last = [...t].sort((a, b) => b.count_date.localeCompare(a.count_date))[0];
      if (!last) return setLastTake(null);
      const d = last.count_date;
      setLastTake(Math.max(0, Math.round((new Date(day + 'T00:00:00Z').getTime() - new Date(d.slice(0, 10) + 'T00:00:00Z').getTime()) / 86400000)));
    }).catch(() => undefined);
  }, [day]);
  const lowCard = nLow > 0 && (
    <button className="lowCard lcA" onClick={() => toDash({ tab: 'bal', filter: 'low' })}>
      <span className="lcTop"><span className="lcDot" aria-hidden="true" /><span className="lcHead"><b>{lowHead}</b><small>{lowSub}</small></span></span>
      <span className="lcSplit" aria-label={`${outCount} out of stock, ${lowOnly} running out`}>
        <span className="lcBar">{outCount > 0 && <i className="out" style={{ flex: outCount }} />}{lowOnly > 0 && <i className="low" style={{ flex: lowOnly }} />}</span>
        <span className="lcLeg">{outCount > 0 && <span><b className="out">{outCount}</b> out of stock</span>}{lowOnly > 0 && <span><b className="low">{lowOnly}</b> running out</span>}</span>
      </span>
      <span className="lcList">{urgent.map((b) => <span key={b.item_id} className="lcItem"><span>{b.name}</span><b className={b.balance <= 0 ? 'out' : 'low'}>{b.balance <= 0 ? 'Finished' : `${fmt(b.balance)} ${b.unit}`}</b></span>)}</span>
      <span className="lcGo">Review all {nLow}<Icon name="arrow" size={16} /></span>
    </button>
  );
  // Phone home (design A): today's papers first, in one dark card.
  const phoneA = !locked && !viewer && (
    <section className="phA enter" aria-label="Tonight’s check-in">
      <div className="phATop">
        <StepRing done={submission ? 3 : done3} total={3} size={48} />
        <span><b>{catchUp ? `${wd}’s check-in` : 'Tonight’s check-in'}</b><small>{submission ? 'Day submitted' : `${closeLabel(min)} · deliveries: ${zohoOnly ? `${delDocs} from Zoho` : delDocs ? `${delDocs} entered` : 'none yet'}`}</small></span>
      </div>
      <div className="phASteps">
        {STEP3.map((k, i) => {
          const v = stateOf(k); const now = !submission && nowKey === k;
          return (
            <button key={k} className={`phAStep ${v} ${now ? 'now' : ''}`} onClick={() => openRecords(go, k)}>
              <span className="phANo">{v === 'done' ? <Icon name="check" size={12} /> : v === 'none' ? '–' : i + 1}</span>
              {k === 'issued' ? 'Issuance register' : k === 'returns' ? 'Returns' : 'Project transfers'}
              <small>{now ? 'Next' : v === 'done' ? 'Done' : v === 'none' ? 'None' : '—'}</small>
            </button>
          );
        })}
      </div>
      <button className="phAGo" onClick={sb.run}>{submission ? 'See today’s summary' : flowStage ? `Continue · ${nextLabel}` : 'Start the check-in'}<Icon name="arrow" size={18} /></button>
    </section>
  );
  const phoneLow = lowItems.length > 0 && (
    <button className="phALow" onClick={() => toDash({ tab: 'bal', filter: 'low' })}>
      <span className="phADot" aria-hidden="true" /><span><b>{lowHead}</b><small>{[outCount ? `${outCount} out of stock` : '', lowOnly ? `${lowOnly} running out` : ''].filter(Boolean).join(' · ')}</small></span><b className="mono">{lowItems.length}</b><Icon name="arrow" size={16} />
    </button>
  );

  return (
    <div className="page home">
      <header className="pageHead enter">
        <div className="phText">
          {catchUp ? <>
            <span className="phKicker catch">Catch-up · day {runIndex} of {Math.max(runTotal, runIndex)}</span>
            <h1>{wd}’s check-in</h1>
            <span className="phLead">Use {wd}’s delivery notes and issuance register. Everything saved here is dated {niceDate(day)}.</span>
          </> : <>
            <span className="phKicker">Evening check-in · {longDate(day)}{api.mode === 'demo' ? ' · Demo' : ''}</span>
            <h1>{greeting()}, {first}</h1>
            <span className={`phLead ${evening ? 'cta' : ''}`}>{locked ? (pendingDays.length === 1 ? `Finish ${weekdayName(pendingDays[0].day)} first.` : `Finish ${pendingDays.length} earlier days first, oldest first.`)
              : evening ? (flowStep && flowStep !== 'issued' ? `Next: ${flowStep === 'submit' ? 'submit the day' : STEPS.find((x) => x.key === flowStep)!.label.toLowerCase()}.` : 'Time to enter today’s papers.') : lead}</span>
          </>}
        </div>
        <div className="phActions">
          <span className="phFinish"><UnfinishedCard chip /></span>
          <button className="btn ghost sm phSum" onClick={() => go('submitted')}><Icon name="chart" size={16} /><span>{catchUp ? `${wd}’s summary` : 'Today’s summary'}</span><span className="phSumGo" aria-hidden="true"><Icon name="arrow" size={16} /></span></button>
          {startBtn}
        </div>
      </header>


      {/* Missed days: the question lives inside the day itself, no separate reminder box. */}
      {!viewer && (locked || catchUp) && (
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
      <GetStarted />
      {phoneA}
      <section className="kpis k3 k2 kStrip" aria-label="Key figures">
        <button className="kpi3 green enter" style={{ animationDelay: '.05s' }} onClick={() => go('balances')}>
          <Ring p={balances.length ? inStore / balances.length : 0} label={`${balances.length ? Math.round((inStore / balances.length) * 100) : 0}%`} tone="green" />
          <span className="k3Txt"><b className="k3L">Balances</b><span className="k3N"><Num value={inStore} /><small>in store</small></span><span className="k3F">{movedToday ? `${movedToday} changed today` : 'Open balances'} <Icon name="arrow" size={12} /></span></span>
        </button>
        <button className="kpi3 amber enter" onClick={() => go('consumption')}>
          <span className="k3Txt"><b className="k3L">Consumption</b><span className="k3N">{weekUse.top ? <><Num value={weekUse.top.used} /><small>{weekUse.top.it?.unit} this week</small></> : '0'}</span><span className="k3F">{weekUse.top ? `${weekUse.top.it?.name ?? 'Item'} most` : 'Nothing used yet'} <Icon name="arrow" size={12} /></span></span>
          <span className="k3Bars" aria-hidden="true">{weekBars.map((v, i) => <i key={i} className={i === todayIdx ? 'on' : ''} style={{ height: `${Math.max(8, (v / (Math.max(...weekBars) || 1)) * 100)}%` }} />)}</span>
        </button>
        {inc && <button className="kpi3 blue enter" onClick={() => go('incoming')}>
          <span className="k3Txt"><b className="k3L">Coming in</b><span className="k3N"><Num value={inc.week} /><small>order{inc.week === 1 ? '' : 's'} this week</small></span><span className={`k3F ${inc.late ? 'late' : ''}`}>{inc.late ? `${inc.late} late` : 'None late'}{inc.today ? ` · ${inc.today} today` : ''} <Icon name="arrow" size={12} /></span></span>
        </button>}
        <button className="kpi3 ink enter" onClick={() => go('stocktake')}>
          <span className="k3Txt"><b className="k3L">Last stock take</b><span className="k3N">{lastTake == null ? '–' : <><Num value={lastTake} /><small>day{lastTake === 1 ? '' : 's'} ago</small></>}</span><span className={`k3F ${lastTake != null && lastTake > 14 ? 'late' : ''}`}>{lastTake == null ? 'None yet' : lastTake > 14 ? 'Time for a count' : 'Count is recent'} <Icon name="arrow" size={12} /></span></span>
        </button>
      </section>

      {phoneLow}
      {!locked && <button className="phASum" onClick={() => go('submitted')}><Icon name="chart" size={16} />{catchUp ? `${wd}’s summary` : 'Today’s summary'}<Icon name="arrow" size={16} /></button>}
      <div className="homeGrid g3">
        <IncomingPanel />
        <aside className="homeAside">
          <section className="panel enter" aria-label="Needs attention" style={{ animationDelay: '.06s' }}>
            <header className="panelHead"><b>Needs attention</b>{nLow > 0 && <small className="muted">{nLow} item{nLow === 1 ? '' : 's'}</small>}</header>
            {!lowItems.length && <div className="pad small muted">Nothing is low. All good.</div>}
            {lowCard}
            <AlertButton />
          </section>
        </aside>
      </div>
      {procPop}

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

const KIND_LABEL: Record<string, string> = { delivery: 'Delivery', issue: 'Issuance register', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction', opening: 'Stock take' };

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
