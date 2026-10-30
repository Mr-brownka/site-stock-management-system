import { useEffect, useMemo, useState } from 'react';
import { Icon, Num, greeting } from '../components/fx';
import { continueEvening, startEvening, useFlow } from '../components/EveningFlow';
import { useIncomingCounts } from '../components/Incoming';
import { GetStarted } from '../components/Tour';
import { canEdit } from '../lib/access';
import { api } from '../lib/api';
import { periodRange } from '../lib/dates';
import { useData } from '../lib/store';
import { Home } from '../screens/Home';
import { shortDay } from './PhoneUI';
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

  const tiles = [
    { k: 'bal', icon: 'box', n: inStore as number | string, t: 'Balances', s: 'in store', run: () => go('balances') },
    { k: 'con', icon: 'bars', n: used as number | string, t: 'Consumption', s: `item${used === 1 ? '' : 's'} used this week`, run: () => go('consumption') },
    { k: 'inc', icon: 'truck', n: inc ? inc.week : '–', t: 'Incoming deliveries', s: inc ? 'this week' : 'Zoho not connected', run: () => go('incoming') },
    { k: 'st', icon: 'clip', n: lastTake == null ? '–' : lastTake, t: 'Last stock take', s: lastTake == null ? 'none yet' : `day${lastTake === 1 ? '' : 's'} ago`, run: () => go('stocktake') },
  ];
  return (
    <div className="pPage pGrey pHome">
      <header className="pHello">
        <span><small>{site || 'Store'} · {shortDay(day)}{projectWeek != null ? ` · Wk ${projectWeek}` : ''}</small><b>{greeting()}, {first}</b></span>
      </header>
      <GetStarted />
      {canEdit(user) && (
        <button className="pCheck" onClick={run}>
          <span className="pCheckRow"><b>{submission ? 'Day submitted · see the summary' : flowStage ? 'Continue the check-in' : 'Start the check-in'}</b><small>{submission ? '3 of 3' : `${done} of 3`}</small><span className="pCheckGo"><Icon name={submission ? 'check' : 'chevR'} size={17} /></span></span>
          <i className="pCheckBar"><i style={{ width: `${((submission ? 3 : done) / 3) * 100}%` }} /></i>
        </button>
      )}
      <div className="pTiles">
        {tiles.map((t) => (
          <button key={t.k} className={`pTileB ${t.k}`} onClick={t.run}>
            <span className="pTIc"><Icon name={t.icon} size={18} /></span>
            <b className="mono">{typeof t.n === 'number' ? <Num value={t.n} /> : t.n}</b>
            <small>{t.t} · {t.s}</small>
          </button>
        ))}
      </div>
      <button className={`pStrip ${lowItems.length ? 'low' : 'good'}`} onClick={() => go('low')}>
        <span className="pSIc"><Icon name="warn" size={17} /></span>
        <b>{lowItems.length ? (out === lowItems.length ? 'Finished' : 'Running low') : 'Nothing running low'}</b>
        <small>{lowItems.length ? `${lowItems.length} item${lowItems.length === 1 ? '' : 's'}` : 'All good'}</small><Icon name="chevR" size={18} />
      </button>
      <button className="pStrip sum" onClick={() => go('submitted')}>
        <span className="pSIc"><Icon name="calendar" size={17} /></span>
        <b>Today’s summary</b><small>{nIn} in · {nOut} out</small><Icon name="chevR" size={18} />
      </button>
    </div>
  );
}
