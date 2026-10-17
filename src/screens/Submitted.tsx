import { Confetti, Icon, PulseDot } from '../components/fx';
import { longDate } from '../lib/dates';
import { STEPS, useData } from '../lib/store';
import { delta } from '../lib/types';

export function Submitted() {
  const { day, docsToday, balances, submission, stepState, go, isLow } = useData();
  const todayDelta = new Map<number, number>();
  docsToday.forEach((d) => d.lines.forEach((l) => todayDelta.set(l.item_id, (todayDelta.get(l.item_id) ?? 0) + delta(l.kind, l.qty))));
  const rows = balances.filter((b) => todayDelta.has(b.item_id)).map((b) => ({ ...b, from: b.balance - (todayDelta.get(b.item_id) ?? 0) }));
  const low = rows.filter((r) => isLow(r));
  const openBalances = () => { try { sessionStorage.setItem('ssms-dash', 'bal'); } catch { /* ignore */ } go('dashboard'); };

  const detail = (i: number) => {
    const s = STEPS[i];
    const ds = docsToday.filter((d) => s.kinds.includes(d.kind));
    if (!ds.length) return 'Nothing today';
    const lines = ds.reduce((a, d) => a + d.lines.length, 0);
    const noun = s.key === 'deliveries' ? 'delivery note' : s.key === 'issued' ? 'withdrawal card' : s.key === 'returns' ? 'return' : 'transfer';
    return `${ds.length} ${noun}${ds.length === 1 ? '' : 's'} · ${lines} item line${lines === 1 ? '' : 's'}`;
  };

  return (
    <div className="phone">
      <header className="top ok center celebrate" style={{ padding: '30px 20px 24px', gap: 8 }}>
        {submission && <Confetti />}
        <svg className="bigTick" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M7 12.5l3.2 3.2L17 9" /></svg>
        <h1>{submission ? 'Day submitted' : 'Not submitted yet'}</h1>
        <div className="sub">{longDate(day)}{submission ? ` · ${new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}` : ''}</div>
      </header>
      <main className="body">
        <div className="card steps">
          {STEPS.map((s, i) => (
            <div key={s.key} className="step enter" style={{ animationDelay: `${0.2 + i * 0.07}s` }}>
              <span className={`dot ${stepState(s.key) !== 'todo' ? 'done' : ''}`}>✓</span>
              <span style={{ flex: 1 }}><b style={{ display: 'block' }}>{s.label}</b><span className="small muted">{detail(i)}</span></span>
            </div>
          ))}
        </div>
        <button className="balBtn enter" style={{ animationDelay: '.45s' }} onClick={openBalances}>
          <span className="balIcon"><Icon name="chart" size={26} /></span>
          <span className="balText">
            <b>Balances after today</b>
            <span>{rows.length ? `${rows.length} item${rows.length === 1 ? '' : 's'} changed today` : 'No stock moved today'}{low.length ? <> · <span className="balLow"><PulseDot />{low.length} low</span></> : ''}</span>
          </span>
          <span className="balGo"><Icon name="arrow" size={22} /></span>
        </button>
        <button className="btn ghost" onClick={() => go('home')}>Back to start</button>
      </main>
    </div>
  );
}
