import { useState } from 'react';
import { Top } from '../components/ui';
import { api } from '../lib/api';
import { longDate } from '../lib/dates';
import { resetDemo } from '../lib/demoBackend';
import { STEPS, useData } from '../lib/store';

export function Home() {
  const { day, user, balances, docsToday, stepState, submission, refresh, go, signOut } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const states = STEPS.map((s) => stepState(s.key));
  const firstTodo = STEPS.find((s) => stepState(s.key) === 'todo');
  const answered = states.every((s) => s !== 'todo');

  const status = (i: number) => {
    const s = STEPS[i];
    const n = docsToday.filter((d) => s.kinds.includes(d.kind)).length;
    if (states[i] === 'done') return { text: n ? `${n} entered` : 'Done', done: true };
    if (states[i] === 'none') return { text: 'Nothing today', done: true };
    return { text: 'Not started', done: false };
  };

  const submit = async () => {
    if (!confirm('Submit today? After this, today’s entries are locked and balances are final.')) return;
    setBusy(true); setErr('');
    try {
      await api.submitDay(day, Object.fromEntries(STEPS.map((s) => [s.key, stepState(s.key)])));
      await refresh();
      go('submitted');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="phone">
      <Top title="Evening stock check-in" sub={`${longDate(day)} · ${user.name}`} right={api.mode === 'demo' ? <span className="badge">DEMO</span> : undefined} />
      <main className="body">
        {!balances.length && (
          <div className="note stack enter">
            <b>Start here: enter the opening count.</b>
            <span>Count what is in the store now and enter each item once. All balances start from this.</span>
            <button className="btn accent" onClick={() => go('opening')}>Enter opening count</button>
          </div>
        )}

        {submission ? (
          <div className="note ok enter"><b>✓ Today was submitted</b> at {new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}. Balances are up to date.</div>
        ) : (
          <div className="note enter" style={{ display: 'flex', gap: 10 }}>
            <span aria-hidden>🔔</span>
            <span><b>Register closes at 6:00 pm.</b> Four quick steps. Each asks a Yes/No question first, so nothing is missed.</span>
          </div>
        )}

        <div className="card steps">
          {STEPS.map((s, i) => {
            const st = status(i);
            return (
              <button key={s.key} className="step enter" style={{ animationDelay: `${i * 0.06}s` }} onClick={() => go(s.screen)}>
                <span className={`dot ${st.done ? 'done' : ''}`}>{st.done ? '✓' : s.n}</span>
                <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block' }}>{s.label}</b><span className="small muted">{s.desc}</span></span>
                <span className={`pill ${st.done ? 'done' : ''}`}>{st.text}</span>
              </button>
            );
          })}
        </div>

        {err && <div className="note err" role="alert">{err}</div>}
        {submission ? (
          <button className="btn ok" onClick={() => go('submitted')}>See today’s summary</button>
        ) : answered ? (
          <button className="btn accent pulse" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit the day'}</button>
        ) : (
          <button className="btn accent pulse" onClick={() => go(firstTodo!.screen)}>{states.some((s) => s !== 'todo') ? 'Continue check-in' : 'Start check-in'}</button>
        )}
        <button className="btn ghost" onClick={() => go('dashboard')}>Store dashboard</button>

        <div className="small muted" style={{ lineHeight: 1.5 }}>
          Withdrawal cards can also be entered during the day. They will already be listed when you reach step 2 tonight.
        </div>
        <div className="between small" style={{ marginTop: 10 }}>
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
