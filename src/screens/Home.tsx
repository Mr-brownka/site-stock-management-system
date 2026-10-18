import { useEffect, useState } from 'react';
import { SiteLogo } from '../components/Brand';
import { Icon, Num, PulseDot, Ring, greeting, useMinutesToClose } from '../components/fx';
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
  const { day, user, site, siteLabel, balances, docsToday, stepState, submission, refresh, go, signOut, lowItems } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const min = useMinutesToClose();
  const states = STEPS.map((s) => stepState(s.key));
  const firstTodo = STEPS.find((s) => stepState(s.key) === 'todo');
  const answered = states.every((s) => s !== 'todo');
  const done = states.filter((s) => s !== 'todo').length;
  const entries = docsToday.filter((d) => d.kind !== 'opening').length;
  const first = user.name.split(' ')[0];

  const status = (i: number) => {
    const s = STEPS[i];
    const n = docsToday.filter((d) => s.kinds.includes(d.kind)).length;
    if (states[i] === 'done') return { text: n ? `${n} entered` : 'Done', done: true };
    if (states[i] === 'none') return { text: 'Nothing today', done: true };
    return { text: 'To do', done: false };
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
  const toDash = (d: { tab: 'cons' | 'bal'; filter?: 'all' | 'low' | 'today' }) => {
    window.dispatchEvent(new CustomEvent('ssms-dash', { detail: d }));
    document.getElementById('dash')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openLow = () => toDash({ tab: 'bal', filter: 'low' });
  const [showEntries, setShowEntries] = useState(false);

  return (
    <div className="phone home">
      <header className="hero">
        <div className="heroRow">
          <div className="heroText">
            <div className="kicker"><span>{siteLabel}</span>{api.mode === 'demo' && <span className="badge">DEMO</span>}</div>
            <h1>{greeting()}, {first}</h1>
            <div className="sub">{longDate(day)} · Evening stock check-in</div>
          </div>
          <Ring done={submission ? 4 : done} total={4} size={72} />
        </div>
        {submission ? (
          <div className="clockChip ok"><Icon name="checkin" size={16} />Submitted at {new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })} · balances are up to date</div>
        ) : (
          <div className={`clockChip ${min <= 0 ? 'late' : min < 60 ? 'soon' : ''}`}>
            {min <= 0 ? <PulseDot /> : <Icon name="clock" size={16} />}{closeLabel(min)} · four quick steps
          </div>
        )}
      </header>

      <main className="body">
        {site && <div className="siteLogo card homeLogo enter"><SiteLogo name={site} height={52} /></div>}

        <div className="statRow">
          <button className="statTile enter" onClick={() => toDash({ tab: 'bal', filter: 'all' })}>
            <span className="label">Items in store</span>
            <Num value={balances.filter((b) => b.balance > 0).length} className="statBig" />
            <span className="small muted">See balances <Icon name="arrow" size={14} /></span>
          </button>
          <button className={`statTile enter ${lowItems.length ? 'alert' : ''}`} style={{ animationDelay: '.05s' }} onClick={openLow}>
            <span className="label">{lowItems.length ? <><PulseDot /> Low stock</> : 'Low stock'}</span>
            <Num value={lowItems.length} className="statBig" />
            <span className="small muted">{lowItems.length ? lowItems.slice(0, 2).map((b) => b.name).join(', ') + (lowItems.length > 2 ? '…' : '') : 'All good'}</span>
          </button>
          <button className="statTile enter" style={{ animationDelay: '.1s' }} onClick={() => setShowEntries(true)}>
            <span className="label">Entries today</span>
            <Num value={entries} className="statBig" />
            <span className="small muted">{entries ? 'See today’s entries' : 'Cards, notes and transfers'} <Icon name="arrow" size={14} /></span>
          </button>
        </div>

        <div className="stepGrid">
          {STEPS.map((s, i) => {
            const st = status(i);
            const next = !submission && firstTodo?.key === s.key;
            return (
              <button key={s.key} className={`stepCard enter ${st.done ? 'done' : ''} ${next ? 'next' : ''}`} style={{ animationDelay: `${0.08 + i * 0.06}s` }} onClick={() => go(s.screen)}>
                <span className="stepIcon"><Icon name={STEP_ICON[s.key]} size={22} /></span>
                <span className="stepText">
                  <span className="stepN">Step {s.n}</span>
                  <b>{s.label}</b>
                  <span className="small muted">{s.desc}</span>
                </span>
                <span className={`pill ${st.done ? 'done' : ''}`}>{st.done ? '✓ ' : ''}{st.text}</span>
              </button>
            );
          })}
        </div>

        {err && <div className="note err" role="alert">{err}</div>}
        {submission && (
          <div className="lateCard enter">
            <div><b>Came in after you submitted?</b><span className="small muted">Add it as a late entry. It counts in today’s balances.</span></div>
            <div className="lateBtns">
              {STEPS.map((st) => <button key={st.key} className="lateBtn" onClick={() => go(st.screen)}><Icon name={STEP_ICON[st.key]} size={18} />+ {st.key === 'issued' ? 'Card' : st.key === 'deliveries' ? 'Delivery' : st.key === 'returns' ? 'Return' : 'Transfer'}</button>)}
            </div>
          </div>
        )}
        {submission ? (
          <button className="btn ok" onClick={() => go('submitted')}>See today’s summary</button>
        ) : answered ? (
          <button className="btn accent pulse" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}</button>
        ) : (
          <button className="btn accent pulse" onClick={() => go(firstTodo!.screen)}>{done ? 'Continue check-in' : 'Start check-in'}<Icon name="arrow" /></button>
        )}

        <div className="small muted" style={{ lineHeight: 1.5 }}>
          Withdrawal cards can also be entered during the day. They will already be listed when you reach step 2 tonight.
        </div>
        <Dashboard embedded />

        <div className="between small homeFoot">
          <span className="muted">Signed in as {user.name}</span>
          <span className="row">
            <button className="btn link" onClick={() => go('stocktake')}>Stock take</button>
            {api.mode === 'demo' && <button className="btn link" onClick={() => { resetDemo(); location.reload(); }}>Reset demo</button>}
            <button className="btn link" onClick={signOut}>Sign out</button>
          </span>
        </div>
      </main>
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
