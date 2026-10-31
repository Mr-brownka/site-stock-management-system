import { useEffect, useState, type ReactNode } from 'react';
import { SiteLogo } from '../components/Brand';
import { ChangePassword } from '../components/ChangePassword';
import { toast } from '../components/feedback';
import { Icon } from '../components/fx';
import { useStartTraining } from '../components/Training';
import { UnfinishedCard } from '../components/Unfinished';
import { checkZohoNow, useZoho, useZohoConnect } from '../components/Zoho';
import { canEdit, canSee, roleLabel } from '../lib/access';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { PTop } from './PhoneUI';

function Row({ icon, label, right, onClick, tone }: { icon: string; label: string; right?: ReactNode; onClick: () => void; tone?: 'red' }) {
  return (
    <button className={`pSetRow ${tone ?? ''}`} onClick={onClick}>
      <span className="pSetIc"><Icon name={icon} size={17} /></span><b>{label}</b>{right}<Icon name="chevR" size={17} />
    </button>
  );
}

/** "Me" on the phone (design C): grouped like phone settings. My work · Connections · Account, then Sign out. */
export function PhoneMe() {
  const { user } = useData();
  return canEdit(user) ? <StoreMe /> : <ViewerMe />;
}

/** Procurement, site managers and management: their site(s) first, nothing to fill in. */
function ViewerMe() {
  const { user, site, signOut, go, balances, lowItems, projectWeek } = useData();
  const [pw, setPw] = useState(false);
  const [sites, setSites] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { api.signupSites().then((x) => setSites(x.map((y) => ({ id: y.id, name: y.name })))).catch(() => setSites([])); }, []);
  const canSwitch = !!user.headOffice || user.role === 'admin';
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const open = async (id: string, name: string) => {
    if (name === site) return;
    if (!canSwitch) { toast(`Ask the admin to give you ${name} too`, 'warn'); return; }
    setBusy(id);
    try {
      await api.viewSite(id);
      try { Object.keys(localStorage).filter((k) => k.startsWith('ssms-cache:') || k.startsWith('ostock-incoming')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
      location.hash = '/home'; location.reload();
    } catch (e) { setBusy(''); toast((e as Error).message, 'warn'); }
  };
  return (
    <div className="pPage pGrey pMe">
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      <PTop title="Me" back={false} />
      <section className="pSetCard pWhoC"><span className="pAv">{initials}</span><span><b>{user.name}</b><small>{roleLabel(user)}{user.email && !user.email.endsWith('ostock.co.ke') ? ` · ${user.email}` : ''}</small></span></section>

      <div className="pSetH">Your site</div>
      <section className="pSetCard pSiteCard">
        <div className="pSiteTop">{site ? <SiteLogo name={site} height={40} /> : null}<span><b>{site || 'No site yet'}</b><small>{projectWeek != null ? `Project week ${projectWeek}` : 'Comex Builders'}</small></span></div>
        <div className="pSiteStats">
          <button onClick={() => go('balances')}><b className="mono">{balances.filter((b) => b.balance > 0).length}</b><small>items in store</small></button>
          <button onClick={() => go('low')} className={lowItems.length ? 'low' : ''}><b className="mono">{lowItems.length}</b><small>running low</small></button>
          <button onClick={() => go('stocktake')}><Icon name="download" size={20} /><small>live balances</small></button>
        </div>
      </section>

      <div className="pSetH">Sites</div>
      <section className="pSetCard">
        {sites === null && <div className="pEmpty">Loading…</div>}
        {sites?.map((x) => (
          <button key={x.id} className={`pSetRow pSiteRow ${x.name === site ? 'on' : ''}`} onClick={() => open(x.id, x.name)} disabled={!!busy}>
            <span className="pSetIc">{x.name.slice(0, 1)}</span><b>{busy === x.id ? 'Opening…' : x.name}</b>
            {x.name === site ? <small className="pSetOk">Viewing</small> : canSwitch ? <Icon name="chevR" size={17} /> : <small className="pSetMuted">Ask the admin</small>}
          </button>
        ))}
      </section>
      <p className="pLead pSitesNote">{canSwitch ? 'Tap a site to look at it. Every site Comex adds appears here.' : 'Every site Comex adds appears here. The admin decides which ones you can open.'}</p>

      <div className="pSetH">Account</div>
      <section className="pSetCard"><Row icon="lock" label="Change password" onClick={() => setPw(true)} /></section>
      <button className="pSetCard pSignOut" onClick={signOut}>Sign out</button>
    </div>
  );
}

function StoreMe() {
  const { user, site, go, signOut, openAdmin, unconfirmed, drafts } = useData();
  const [pw, setPw] = useState(false);
  const z = useZoho();
  const { connect, busy } = useZohoConnect();
  const training = useStartTraining(user);
  const n = unconfirmed.length + drafts.length;
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const zohoBad = !!z?.last_error && /allow|authori|expired|connect zoho again|invalid_(token|client|grant)/i.test(z.last_error);
  return (
    <div className="pPage pGrey pMe">
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      <PTop title="Me" back={false} />
      <section className="pSetCard pWhoC"><span className="pAv">{initials}</span><span><b>{user.name}</b><small>{roleLabel(user)}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</small></span></section>

      <div className="pSetH">My work</div>
      <section className="pSetCard">
        <Row icon="report" label="To finish" onClick={() => go('tofinish')} right={n > 0 ? <span className="pSetBadge">{n}</span> : <small className="pSetMuted">Nothing</small>} />
        {canEdit(user) && canSee(user, 'corrections') && <Row icon="fix" label="Fix an error" onClick={() => go('corrections')} />}
        {user.role === 'admin' && <Row icon="user" label="Admin" onClick={openAdmin} />}
      </section>

      {z !== undefined && z !== null && <>
        <div className="pSetH">Connections</div>
        <section className="pSetCard">
          <Row icon="truck" label="Zoho Books" onClick={() => (!z.connected || zohoBad ? connect() : checkZohoNow())}
            right={<small className={!z.connected || zohoBad ? 'pSetWarn' : 'pSetOk'}>{busy ? 'Opening…' : !z.connected ? 'Connect' : zohoBad ? 'Reconnect' : 'On'}</small>} />
          {z.connected && <Row icon="mail" label="Zoho Mail" onClick={() => api.zohoConnect(true).catch((e) => toast((e as Error).message, 'warn'))} right={<small className="pSetMuted">For emailing stock takes</small>} />}
        </section>
      </>}

      <div className="pSetH">Account</div>
      <section className="pSetCard">
        {(user.role === 'admin' || user.role === 'store') && api.mode !== 'training' && api.mode !== 'guest' && <Row icon="shield" label={training.busy ? 'Opening the practice store…' : 'Training mode'} onClick={training.go} />}
        <Row icon="lock" label="Change password" onClick={() => setPw(true)} />
      </section>

      <button className="pSetCard pSignOut" onClick={signOut}>Sign out</button>
    </div>
  );
}

/** Everything started but not finished, on its own page. */
export function PhoneToFinish() {
  const { unconfirmed, drafts } = useData();
  const n = unconfirmed.length + drafts.length;
  return (
    <div className="pPage pGrey">
      <PTop title="To finish" back="me" />
      <p className="pLead">Things started but not saved yet. They don’t count in stock until finished.</p>
      <div className="pFinishList">{n ? <UnfinishedCard /> : <div className="pEmpty">Nothing to finish. All done.</div>}</div>
    </div>
  );
}
