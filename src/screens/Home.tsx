import { useState } from 'react';
import { SiteLogo } from '../components/Brand';
import { Icon, Num, PulseDot, Ring, greeting, useMinutesToClose } from '../components/fx';
import { closeLabel } from '../components/Shell';
import { api } from '../lib/api';
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
  const openLow = () => { try { sessionStorage.setItem('ssms-dash', 'low'); } catch { /* ignore */ } go('dashboard'); };

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

        {!balances.length && (
          <div className="note stack enter">
            <b>Start here: enter the opening count.</b>
            <span>Count what is in the store now and enter each item once. All balances start from this.</span>
            <button className="btn accent" onClick={() => go('opening')}>Enter opening count</button>
          </div>
        )}

        <div className="statRow">
          <button className="statTile enter" onClick={() => go('dashboard')}>
            <span className="label">Items in store</span>
            <Num value={balances.filter((b) => b.balance > 0).length} className="statBig" />
            <span className="small muted">Open the dashboard <Icon name="arrow" size={14} /></span>
          </button>
          <button className={`statTile enter ${lowItems.length ? 'alert' : ''}`} style={{ animationDelay: '.05s' }} onClick={openLow}>
            <span className="label">{lowItems.length ? <><PulseDot /> Low stock</> : 'Low stock'}</span>
            <Num value={lowItems.length} className="statBig" />
            <span className="small muted">{lowItems.length ? lowItems.slice(0, 2).map((b) => b.name).join(', ') + (lowItems.length > 2 ? '…' : '') : 'All good'}</span>
          </button>
          <div className="statTile enter" style={{ animationDelay: '.1s' }}>
            <span className="label">Entries today</span>
            <Num value={entries} className="statBig" />
            <span className="small muted">Cards, notes and transfers</span>
          </div>
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
        <div className="between small homeFoot">
          <span className="muted">Signed in as {user.name}</span>
          <span className="row">
            {balances.length > 0 && <button className="btn link" onClick={() => go('opening')}>Opening count</button>}
            {api.mode === 'demo' && <button className="btn link" onClick={() => { resetDemo(); location.reload(); }}>Reset demo</button>}
            <button className="btn link" onClick={signOut}>Sign out</button>
          </span>
        </div>
      </main>
    </div>
  );
}
