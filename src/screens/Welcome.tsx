import { ComexLogo } from '../components/Brand';
import { Icon } from '../components/fx';
import { useData } from '../lib/store';
import { ZohoStatusLine } from '../components/Zoho';

/** A store with no stock yet starts here: count it once (the first stock take sets the opening balances). */
export function Welcome() {
  const { user, site, go, signOut, balances } = useData();
  const first = user.name.split(' ')[0];
  const hasStock = balances.length > 0;
  const admin = user.role === 'admin';
  return (
    <div className="wel">
      <div className="welGlow" aria-hidden />
      <div className="welLogo"><ComexLogo width={190} /></div>
      {site && <span className="welSite"><i aria-hidden />{site} store</span>}
      <span className="welHi">Welcome, {first}</span>
      <h1 className="welTitle">{hasStock ? 'Your store is ready' : 'Set up your store'}</h1>
      <p className="welLead">{hasStock ? 'Open the dashboard. A short guide shows you around the first time.' : 'Count the store once: your first stock take sets the opening balances.'}</p>
      {!admin && <div className="welZoho"><ZohoStatusLine /></div>}
      {hasStock
        ? <button className="welGo" onClick={() => go('home')}>Open the dashboard<span><Icon name="arrow" size={20} /></span></button>
        : <button className="welGo" onClick={() => go('stocktake')}>Start first stock take<span><Icon name="arrow" size={20} /></span></button>}
      <footer className="welFoot">
        {admin ? <button className="btn link" onClick={() => go('home')}>Back to the dashboard</button> : <button className="btn link" onClick={signOut}>Sign out</button>}
      </footer>
    </div>
  );
}
