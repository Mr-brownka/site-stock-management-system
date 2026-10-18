import { CrateMark, SiteLogo } from '../components/Brand';
import { Icon } from '../components/fx';
import { StartTraining } from '../components/Training';
import { useData } from '../lib/store';

/** First screen for a store that has no stock take yet: train first, or start the first stock take. */
export function Welcome() {
  const { user, company, site, go, signOut } = useData();
  const first = user.name.split(' ')[0];
  return (
    <div className="welcome">
      <section className="wBrand">
        <div className="wGlow" aria-hidden />
        <CrateMark size={96} animate />
        <div className="wName"><b>SITE STOCK</b><span>{(company || 'Comex Builders').toUpperCase()}</span></div>
        {site && <div className="wSite"><SiteLogo name={site} height={64} /></div>}
        <p>Every delivery, card, return and transfer, entered the same evening. Live balances for the site store.</p>
      </section>
      <section className="wActions">
        <div className="wHello">
          <span className="label">Welcome, {first}</span>
          <h1>How would you like to start?</h1>
          <p className="muted">You can practise first. Nothing done in training touches the real store.</p>
        </div>
        <StartTraining user={user} className="wBtn train" label="Self training" />
        <button className="wBtn go" onClick={() => go('stocktake')}>
          <Icon name="box" size={28} />
          <span><b>Continue to first stock take</b><small>Print the store’s checklist, count, then type the quantities</small></span>
          <Icon name="arrow" size={22} />
        </button>
        <button className="btn link" style={{ alignSelf: 'center' }} onClick={signOut}>Sign out</button>
      </section>
    </div>
  );
}
