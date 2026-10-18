import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { STEPS, useData, type Screen } from '../lib/store';
import { SiteLogo, Wordmark } from './Brand';
import { Icon, PulseDot, Ring, useMinutesToClose } from './fx';
import { StartTraining } from './Training';
import { Welcome } from '../screens/Welcome';

const NAV: { screen: Screen; label: string; icon: string; match: Screen[] }[] = [
  { screen: 'home', label: 'Check-in', icon: 'checkin', match: ['home', 'dashboard', 'deliveries', 'issued', 'returns', 'transfers', 'submitted'] },
  { screen: 'reports', label: 'Reports', icon: 'report', match: ['reports'] },
  { screen: 'corrections', label: 'Fix a mistake', icon: 'fix', match: ['corrections'] },
  { screen: 'stocktake', label: 'Stock take', icon: 'box', match: ['stocktake'] },
];
// Screens that show the phone tab bar (not the step-by-step forms).
const TABBAR: Screen[] = ['home', 'dashboard', 'corrections', 'submitted', 'reports', 'stocktake'];

export function closeLabel(min: number): string {
  if (min <= 0) return 'Register closed at 6:00 pm';
  const h = Math.floor(min / 60), m = min % 60;
  return `Register closes in ${h ? `${h}h ` : ''}${m}m`;
}

export function AppShell({ screen, children }: { screen: Screen; children: ReactNode }) {
  const { user, site, company, go, signOut, openAdmin, stepState, submission, lowItems, balances } = useData();
  // A store with no stock take yet starts on the welcome page.
  if (!balances.length && (screen === 'home' || screen === 'dashboard')) return <Welcome />;
  const done = STEPS.filter((s) => stepState(s.key) !== 'todo').length;
  const min = useMinutesToClose();
  const urgent = !submission && min < 60;

  return (
    <div className={`shell ${TABBAR.includes(screen) ? 'hasTab' : ''}`}>
      <aside className="rail" aria-label="Main menu">
        <Wordmark company={company || 'Comex Builders'} size={40} />
        {site && <div className="railSite"><SiteLogo name={site} height={44} /></div>}
        <nav className="railNav">
          {NAV.map((n) => (
            <button key={n.screen} className="railLink" aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <Icon name={n.icon} />{n.label}
              {n.screen === 'home' && lowItems.length > 0 && <span className="railLow"><PulseDot />{lowItems.length}</span>}
            </button>
          ))}
          {user.role === 'admin' && <button className="railLink" onClick={openAdmin}><Icon name="shield" />Admin page</button>}
          <StartTraining user={user} />
        </nav>
        <div className={`railToday ${urgent ? 'urgent' : ''}`}>
          <Ring done={submission ? 4 : done} total={4} size={56} />
          <div>
            <b>{submission ? 'Day submitted' : done === 4 ? 'Ready to submit' : 'Today’s check-in'}</b>
            <span>{submission ? 'All four steps done' : closeLabel(min)}</span>
          </div>
        </div>
        <div className="railFoot">
          <span>{user.name}{api.mode === 'demo' ? ' · demo' : ''}</span>
          <button className="railLink" onClick={signOut}><Icon name="out" />Sign out</button>
        </div>
      </aside>
      <div className="shellMain">
        <div className="screen" key={screen}>{children}</div>
      </div>
      {TABBAR.includes(screen) && (
        <nav className="tabbar" aria-label="Main menu">
          {NAV.map((n) => (
            <button key={n.screen} aria-current={n.match.includes(screen) ? 'page' : undefined} onClick={() => go(n.screen)}>
              <span className="tbIcon"><Icon name={n.icon} size={22} />{n.screen === 'home' && lowItems.length > 0 && <PulseDot />}</span>
              {{ home: 'Check-in', corrections: 'Fix', stocktake: 'Stock take' }[n.screen as string] ?? n.label}
            </button>
          ))}
          {user.role === 'admin' && <button onClick={openAdmin}><span className="tbIcon"><Icon name="shield" size={22} /></span>Admin</button>}
        </nav>
      )}
    </div>
  );
}
