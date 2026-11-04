import { useEffect, useMemo, useState } from 'react';
import { Icon, greeting } from '../components/fx';
import { continueEvening, startEvening, useFlow } from '../components/EveningFlow';
import { useIncomingCounts } from '../components/Incoming';
import { GetStarted } from '../components/Tour';
import { canEdit } from '../lib/access';
import { api } from '../lib/api';
import { periodRange } from '../lib/dates';
import { useData } from '../lib/store';
import { Home } from '../screens/Home';
import { FlipNum, shortDay } from './PhoneUI';
import './phone.css';

const IN = ['delivery', 'transfer_in', 'return'], OUT = ['issue', 'transfer_out'];

/** Phone home (design B): check-in strip, four tiles, the low-stock strip, today's summary strip. Nothing else. */
export function PhoneHome() {
  const { day, user, balances, docsToday, stepState, submission, go, lowItems, recent, catchUp, pendingDays, site, projectWeek } = useData();
  const flowStage = useFlow(day);
  const inc = useIncomingCounts();
  const [lastTake, setLastTake] = useState<number | null>(null);
  useEffect(() => {
    api.stockTakes().then((t) => {
      const last = [...t].sort((a, b) => b.count_date.localeCompare(a.count_date))[0];
      setLastTake(last ? Math.max(0, Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(last.count_date.slice(0, 10) + 'T00:00:00Z')) / 864e5)) : null);
    }).catch(() => undefined);
  }, [day]);
  const used = useMemo(() => {
    const from = periodRange('week', day).from;
    return new Set(recent.filter((d) => d.kind === 'issue' && d.doc_date >= from && d.doc_date <= day).flatMap((d) => d.lines.map((l) => l.item_id))).size;
  }, [recent, day]);

  // Missed days and catch-up keep the full check-in page.
  if (catchUp || pendingDays.length) return <Home />;

  const done = (['issued', 'returns', 'transfers'] as const).filter((k) => stepState(k) !== 'todo').length;
  const run = () => (submission ? go('submitted') : flowStage ? continueEvening(day, go) : startEvening(day, go, docsToday.some((d) => d.kind === 'issue')));
  const inStore = balances.filter((b) => b.balance > 0).length;
  const nIn = docsToday.filter((d) => IN.includes(d.kind)).length, nOut = docsToday.filter((d) => OUT.includes(d.kind)).length;
  const out = lowItems.filter((b) => b.balance <= 0).length;
  const first = user.name.split(' ')[0];

  return (
    <div className="pPage pGrey pHome pHomeB">
      {/* Design B: a green header holds the greeting and the check-in (frosted glass, three steps). */}
      <section className="pHero">
        <header className="pHello">
          <span><small>{site || 'Store'} · {shortDay(day)}{projectWeek != null ? ` · Wk ${projectWeek}` : ''}</small><b>{greeting()}, {first}</b></span>
        </header>
        {canEdit(user) && (
          <button className="pCheck pGlass" onClick={run}>
            <span className="pCheckRow"><b>{submission ? 'Day submitted' : flowStage ? 'Continue the check-in' : 'Start the check-in'}</b><small className="mono">{submission ? '3 of 3' : `${done} of 3`}</small><span className="pCheckGo"><Icon name={submission ? 'check' : 'chevR'} size={18} /></span></span>
            <span className="pSteps3" aria-hidden="true">{(['issued', 'returns', 'transfers'] as const).map((k) => <i key={k} className={submission || stepState(k) !== 'todo' ? 'on' : ''} />)}</span>
            <span className="pSteps3L" aria-hidden="true"><span>Issued</span><span>Returns</span><span>Transfers</span></span>
          </button>
        )}
      </section>
      <GetStarted />
      {/* Design B: three key numbers on one floating card, a warning only when something is low, then one clean list. */}
      <section className="hbGlance" aria-label="Your store at a glance">
        <button onClick={() => go('balances')}><b className="mono"><FlipNum value={inStore} /></b><small>In store</small></button>
        <button onClick={() => go('consumption')}><b className="mono"><FlipNum value={used} /></b><small>Used this week</small></button>
        <button onClick={() => go('incoming')}><b className="mono">{inc ? <FlipNum value={inc.week} /> : '–'}</b><small>Coming in</small></button>
      </section>
      {lowItems.length > 0 && (
        <button className="hbAlert" onClick={() => go('low')}>
          <Icon name="warn" size={19} /><b>{out === lowItems.length ? `${out} item${out === 1 ? '' : 's'} finished` : `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} running low`}</b><Icon name="chevR" size={18} />
        </button>
      )}
      <nav className="hbList" aria-label="Go to">
        {[
          { k: 'bal', icon: 'box', t: 'Balances', r: '', run: () => go('balances') },
          { k: 'con', icon: 'bars', t: 'Consumption', r: '', run: () => go('consumption') },
          { k: 'inc', icon: 'truck', t: 'Incoming deliveries', r: inc ? (inc.today ? `${inc.today} today` : inc.late ? `${inc.late} late` : '') : '', run: () => go('incoming') },
          { k: 'st', icon: 'clip', t: 'Stock take', r: lastTake == null ? '' : lastTake === 0 ? 'Today' : `${lastTake} day${lastTake === 1 ? '' : 's'} ago`, run: () => go('stocktake') },
          { k: 'sum', icon: 'calendar', t: 'Today’s summary', r: `${nIn} in · ${nOut} out`, run: () => go('submitted') },
        ].map((r) => (
          <button key={r.k} className={`hbRow ${r.k}`} onClick={r.run}>
            <span className="hbIc"><Icon name={r.icon} size={18} /></span><b>{r.t}</b>{r.r && <small>{r.r}</small>}<Icon name="chevR" size={17} />
          </button>
        ))}
      </nav>
    </div>
  );
}
