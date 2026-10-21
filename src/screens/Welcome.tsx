import { ComexLogo } from '../components/Brand';
import { Confetti, Icon } from '../components/fx';
import { useStartTraining } from '../components/Training';
import { niceDate, weekday } from '../lib/dates';
import { useData } from '../lib/store';
import { TRAINING_DAYS, trainingPlan } from '../lib/trainingPlan';
import { ZohoStatusLine } from '../components/Zoho';

/**
 * Start page for someone new: 5 working days of practice (Mon–Sat), then the first stock take
 * (a store with no stock yet) or straight to check-in (a store that already has stock).
 */
export function Welcome() {
  const { user, site, go, signOut, balances } = useData();
  const plan0 = trainingPlan(user);
  const { go: practise, busy } = useStartTraining(user);
  const first = user.name.split(' ')[0];
  const hasStock = balances.length > 0;
  const preview = user.role === 'admin';
  // Admins don't train; on a store with no stock they go straight to the first stock take.
  const plan = preview && !hasStock ? { ...plan0, finished: true } : plan0;
  const current = plan.doneToday ? plan.done : Math.min(plan.done + 1, TRAINING_DAYS);
  const day = (d: string) => niceDate(d).split(' ').slice(0, 2).join(' ');

  const title = preview && !hasStock ? 'Set up your store' : plan.finished ? 'Training complete' : `Training · Day ${current} of ${TRAINING_DAYS}`;
  const lead = plan.finished
    ? (preview && !hasStock ? 'Count the store once: your first stock take sets the opening balances.' : hasStock ? 'Well done. Your store is ready.' : 'Well done. Now count the store: your first stock take sets the opening balances.')
    : plan.doneToday ? `Day ${plan.done} is done. Come back on ${plan.nextDay ? niceDate(plan.nextDay) : 'the next working day'} for Day ${plan.done + 1}.`
      : plan.sunday ? 'Sunday is a rest day. You can practise, but it doesn’t count.'
        : `${TRAINING_DAYS} working days of practice, Monday to Saturday. Then ${hasStock ? 'your store opens' : 'your first stock take'}.`;

  return (
    <div className="wel">
      <div className="welGlow" aria-hidden />
      {plan0.finished && !preview && <Confetti />}
      <div className="welLogo"><ComexLogo width={190} /></div>
      {site && <span className="welSite"><i aria-hidden />{site} store</span>}
      <span className="welHi">{plan.done ? 'Welcome back' : 'Welcome'}, {first}</span>
      <h1 className="welTitle">{title}</h1>
      <p className="welLead">{lead}</p>
      {!preview && <div className="welZoho"><ZohoStatusLine /></div>}

      {!(preview && !hasStock) && <ol className="welDays" aria-label={`Training: ${plan.done} of ${TRAINING_DAYS} days done`}>
        {plan.tiles.map((t, i) => {
          const gap = i > 0 && weekday(t.date) === 'Mon';
          return (
            <li key={t.date} className={`welDay ${t.state}${gap ? ' afterSun' : ''}`} style={{ animationDelay: `${120 + i * 70}ms` }}>
              {gap && <span className="welSun" aria-hidden>Sun off</span>}
              <span className="lbl">Day</span><b>{t.n}</b><span className="dt">{day(t.date)}</span>
              {t.state === 'done' && <span className="tick" aria-label="done"><Icon name="check" size={12} /></span>}
              {t.state === 'today' && <span className="now">Today</span>}
            </li>
          );
        })}
      </ol>}

      {plan.finished && !hasStock
        ? <button className="welGo" onClick={() => go('stocktake')}>Start first stock take<span><Icon name="arrow" size={20} /></span></button>
        : plan.finished
          ? <button className="welGo" onClick={() => go('home')}>Open check-in<span><Icon name="arrow" size={20} /></span></button>
          : <button className="welGo" disabled={busy} onClick={practise}>{busy ? 'Opening the practice store…' : plan.doneToday ? 'Practise again' : 'Start today’s practice'}<span><Icon name="arrow" size={20} /></span></button>}

      {!plan.finished && (
        <div className="welLock"><Icon name="lock" size={16} />
          <span>{hasStock ? 'Store opens' : 'First stock take unlocks'} after Day {TRAINING_DAYS}:</span> <b>{niceDate(plan.lastDay)}</b>
        </div>
      )}
      {plan.finished && !hasStock && <button className="btn link welAgain" disabled={busy} onClick={practise}>Practise once more</button>}

      <footer className="welFoot">
        {preview
          ? <button className="btn link" onClick={() => go('home')}>Back to check-in</button>
          : <button className="btn link" onClick={signOut}>Sign out</button>}
      </footer>
    </div>
  );
}
