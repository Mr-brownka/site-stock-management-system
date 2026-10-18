import { useEffect, useState } from 'react';
import { Icon, Num, PulseDot, greeting, useMinutesToClose } from '../components/fx';
import { signal, useSignal } from '../lib/signals';
import { closeLabel } from '../components/Shell';
import { api } from '../lib/api';
import { Dashboard } from './Dashboard';
import { fmt } from '../components/ui';
import { longDate } from '../lib/dates';
import { resetDemo } from '../lib/demoBackend';
import { STEPS, useData } from '../lib/store';
import { ask } from '../components/feedback';

const STEP_ICON: Record<string, string> = { deliveries: 'truck', issued: 'card', returns: 'back', transfers: 'swap' };

export function Home() {
  const { day, user, balances, docsToday, stepState, submission, refresh, go, signOut, lowItems, daysLeft } = useData();
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
  useSignal('entries', () => setShowEntries(true));
  useEffect(() => { api.stockTakes().then((t) => setLastTake(t.map((x) => x.count_date).sort().pop() ?? null)).catch(() => setLastTake(null)); }, []);

  const status = (i: number) => {
    const s = STEPS[i];
    const ds = docsToday.filter((d) => s.kinds.includes(d.kind));
    const lines = ds.reduce((a, d) => a + d.lines.length, 0);
    if (states[i] === 'done') return { text: 'Done', detail: `${ds.length} entr${ds.length === 1 ? 'y' : 'ies'} · ${lines} line${lines === 1 ? '' : 's'}`, cls: 'done' };
    if (states[i] === 'none') return { text: 'Nothing today', detail: 'Answered “No”', cls: 'done' };
    if (!submission && firstTodo?.key === s.key) return { text: 'Next', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: 'next' };
    return { text: 'Not started', detail: ds.length ? `${ds.length} entered during the day` : s.desc, cls: '' };
  };

  const submit = async () => {
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
          <span className="phKicker">Evening check-in · {longDate(day)}{api.mode === 'demo' ? ' · Demo' : ''}</span>
          <h1>{greeting()}, {first}</h1>
          <span className="phLead">{lead}</span>
        </div>
        <div className="phActions">
          <button className="btn ghost sm" onClick={() => setShowEntries(true)}><Icon name="list" size={16} />Today’s entries</button>
          {submission ? (
            <button className="btn sm" onClick={() => go('submitted')}>Today’s summary<Icon name="arrow" size={16} /></button>
          ) : answered ? (
            <button className="btn accent sm" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}<Icon name="check" size={16} /></button>
          ) : (
            <button className="btn sm" onClick={() => go(firstTodo!.screen)}>{done ? `Continue · ${firstTodo!.label}` : 'Start check-in'}<Icon name="arrow" size={16} /></button>
          )}
        </div>
      </header>

      <section className="kpis" aria-label="Key figures">
        <button className="kpi enter" onClick={() => toDash({ tab: 'bal', filter: 'all' })}>
          <span className="kpiLabel">Items in store</span>
          <Num value={balances.filter((b) => b.balance > 0).length} className="kpiNum" />
          <span className="kpiFoot">Open balances <Icon name="arrow" size={13} /></span>
        </button>
        <button className={`kpi enter ${lowItems.length ? 'alert' : ''}`} style={{ animationDelay: '.04s' }} onClick={() => toDash({ tab: 'bal', filter: 'low' })}>
          <span className="kpiLabel">{lowItems.length > 0 && <PulseDot />}Low stock</span>
          <Num value={lowItems.length} className="kpiNum" />
          <span className="kpiFoot">{lowItems.length ? `${outCount} out of stock` : 'All good'}</span>
        </button>
        <button className="kpi enter" style={{ animationDelay: '.08s' }} onClick={() => setShowEntries(true)}>
          <span className="kpiLabel">Entries today</span>
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
        <section className="panel process enter" aria-label="Today’s process">
          <header className="panelHead"><b>Today’s process</b><span className="muted small">{submission ? 'Submitted' : `${done} of 4 done`}</span></header>
          <div className="procBar" aria-hidden="true"><i style={{ width: `${((submission ? 4 : done) / 4) * 100}%` }} /></div>
          {STEPS.map((s, i) => {
            const st = status(i);
            return (
              <button key={s.key} className={`procRow ${st.cls}`} onClick={() => go(s.screen)}>
                <span className="procDot">{st.cls === 'done' ? <Icon name="check" size={16} /> : s.n}</span>
                <span className="procIc"><Icon name={STEP_ICON[s.key]} size={18} /></span>
                <span className="procText"><b>{s.label}</b><span>{st.detail}</span></span>
                <span className={`stPill ${st.cls === 'done' ? 'ok' : st.cls === 'next' ? 'warn' : 'idle'}`}>{st.text}</span>
                <span className="procGo">{st.cls === 'done' ? 'Review' : 'Open'}<Icon name="arrow" size={14} /></span>
              </button>
            );
          })}
          <footer className="panelFoot">
            {submission ? (
              <>
                <span className="small muted">Something came in after submitting? Add it as a late entry.</span>
                <span className="lateBtns">{STEPS.map((st) => <button key={st.key} className="lateBtn" onClick={() => go(st.screen)}>+ {st.key === 'issued' ? 'Card' : st.key === 'deliveries' ? 'Delivery' : st.key === 'returns' ? 'Return' : 'Transfer'}</button>)}</span>
              </>
            ) : (
              <>
                <span className="small muted">Submitting locks today. Cards can be entered during the day too.</span>
                <button className="btn accent sm" disabled={!answered || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}</button>
              </>
            )}
          </footer>
          {err && <div className="note err" role="alert" style={{ margin: 12 }}>{err}</div>}
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
                  <span className={`attVal ${b.balance <= 0 ? 'out' : ''}`}>{b.balance <= 0 ? 'Out' : dl != null && dl < 30 ? `${Math.max(0, Math.round(dl))} day${Math.round(dl) === 1 ? '' : 's'} left` : `${fmt(b.balance)} ${b.unit}`}</span>
                </button>
              );
            })}
          </section>
          <section className="panel dark enter" style={{ animationDelay: '.1s' }}>
            <b>Stock take</b>
            <span>{lastTake ? `Last count ${nice(lastTake)}.` : 'No count recorded yet.'} Print the orange sheet, count, then enter the numbers.</span>
            <button className="btn link" onClick={() => go('stocktake')}><Icon name="print" size={16} />Open stock take</button>
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
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { delivery: 'Delivery', issue: 'Withdrawal card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction', opening: 'Stock take' };

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
          return (
            <div key={st.key} className="entGroup">
              <div className="between"><b>{st.label}</b><button className="btn link" onClick={() => { onClose(); go(st.screen); }}>Open step {st.n}</button></div>
              {!ds.length && <div className="small muted">Nothing yet.</div>}
              {ds.map((d) => {
                const late = !!submission && d.created_at > submission.submitted_at;
                return (
                  <div key={d.id} className="entCard">
                    <div className="between"><b>{KIND_LABEL[d.kind]}{d.ref_no ? ` · ${d.kind === 'issue' ? 'card ' : ''}${d.ref_no}` : ''}{late && <span className="pill late">Late</span>}</b><span className="mono small muted">{d.doc_time ?? new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}</span></div>
                    {(d.party || d.activity) && <div className="small muted">{[d.party, d.activity, d.gemba].filter(Boolean).join(' · ')}</div>}
                    {d.lines.map((l) => <div key={l.id} className="ln"><span>{itemById.get(l.item_id)?.name ?? 'Item'}</span><span className="mono">{fmt(l.qty)} {itemById.get(l.item_id)?.unit}</span></div>)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>
    </div>
  );
}
