import { Confetti } from '../components/fx';
import { fmt } from '../components/ui';
import { longDate } from '../lib/dates';
import { STEPS, useData } from '../lib/store';
import { delta } from '../lib/types';

export function Submitted() {
  const { day, docsToday, balances, submission, stepState, go, itemById } = useData();
  const todayDelta = new Map<number, number>();
  docsToday.forEach((d) => d.lines.forEach((l) => todayDelta.set(l.item_id, (todayDelta.get(l.item_id) ?? 0) + delta(l.kind, l.qty))));
  const rows = balances.filter((b) => todayDelta.has(b.item_id)).map((b) => ({ ...b, from: b.balance - (todayDelta.get(b.item_id) ?? 0) }));
  const low = rows.filter((r) => r.reorder_level != null && r.balance <= r.reorder_level);

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
        {rows.length > 0 && (
          <div className="stack enter" style={{ animationDelay: '.5s' }}>
            <div className="label">Balances after today</div>
            <div className="card" style={{ overflow: 'hidden' }}>
              {rows.map((r) => {
                const isLow = r.balance <= 0 || (r.reorder_level != null && r.balance <= r.reorder_level);
                return (
                  <div key={r.item_id} className="between" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-2)' }}>
                    <b style={{ fontSize: 14 }}>{itemById.get(r.item_id)?.name ?? r.name}</b>
                    <span className="mono" style={{ whiteSpace: 'nowrap', fontSize: 14 }}>{fmt(r.from)} → <b className={isLow ? 'low' : ''}>{fmt(r.balance)}</b> {r.unit}</span>
                  </div>
                );
              })}
            </div>
            {low.length > 0 && <div className="small" style={{ color: 'var(--red)', fontWeight: 600 }}>{low.map((l) => l.name).join(', ')} {low.length === 1 ? 'is' : 'are'} at or below the reorder level. Tell the site manager.</div>}
          </div>
        )}
        <button className="btn" onClick={() => go('dashboard')}>Open the store dashboard</button>
        <button className="btn ghost" onClick={() => go('home')}>Back to start</button>
      </main>
    </div>
  );
}
