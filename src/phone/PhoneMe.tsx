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
import { DeviceSheet } from '../components/DeviceSettings';
import { isInstalled } from '../lib/pwa';


/** "Me" on the phone (design B, 5 Nov): an ID card with you and your site, sites one tap away, then two short lists. */
export function PhoneMe() {
  const { user, site, signOut, go, openAdmin, unconfirmed, drafts, projectWeek, company, lowItems } = useData();
  const editor = canEdit(user);
  const [pw, setPw] = useState(false);
  const [dev, setDev] = useState(false);
  const [conn, setConn] = useState(false);
  const [sites, setSites] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState('');
  const z = useZoho();
  const { connect, busy: zBusy } = useZohoConnect();
  const training = useStartTraining(user);
  useEffect(() => { api.signupSites().then((x) => setSites(x.map((y) => ({ id: y.id, name: y.name })))).catch(() => setSites([])); }, []);
  const canSwitch = !!user.headOffice || user.role === 'admin' || user.role === 'procurement';
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const n = unconfirmed.length + drafts.length;
  const zohoBad = !!z?.last_error && /allow|authori|expired|connect zoho again|invalid_(token|client|grant)/i.test(z.last_error);
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
  const devText = [isInstalled() ? 'Installed' : 'Not installed', 'notifications', 'fingerprint'].join(' · ');
  return (
    <div className="pPage bPage">
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      {dev && <DeviceSheet onClose={() => setDev(false)} />}
      <section className="bId" aria-label="You">
        <div className="bIdTop"><span className="bAv">{initials}</span><span><b>{user.name}</b><small>{roleLabel(user)}{api.mode === 'demo' ? ' · demo' : ''}</small></span></div>
        <div className="bIdSite">
          <span><small>Your site</small><b>{site || 'No site yet'}</b><em>{projectWeek != null ? `Project week ${projectWeek} · ` : ''}{company || 'Comex Builders'}</em></span>
          {site && <SiteLogo name={site} dark height={34} />}
        </div>
      </section>
      {sites && sites.length > 1 && (
        <div className="bSites" role="group" aria-label="Sites">
          {sites.map((x) => <button key={x.id} type="button" className={x.name === site ? 'on' : ''} disabled={!!busy} aria-pressed={x.name === site} onClick={() => open(x.id, x.name)}>{busy === x.id ? 'Opening…' : x.name}</button>)}
        </div>
      )}
      <nav className="bList" aria-label="My work">
        {editor && <MeRow icon="report" label="To finish" onClick={() => go('tofinish')} right={n > 0 ? <span className="pSetBadge">{n}</span> : <small className="bMute">Nothing</small>} />}
        {!editor && <MeRow icon="warn" label="Running low" onClick={() => go('low')} right={<small className="bMute">{lowItems.length ? `${lowItems.length} item${lowItems.length === 1 ? '' : 's'}` : 'Nothing'}</small>} />}
        {editor && canSee(user, 'corrections') && <MeRow icon="fix" label="Fix an error" onClick={() => go('corrections')} />}
        {user.role === 'admin' && <MeRow icon="user" label="Admin" onClick={openAdmin} />}
        {(user.role === 'admin' || user.role === 'store') && api.mode !== 'training' && api.mode !== 'guest' && <MeRow icon="shield" label={training.busy ? 'Opening the practice store…' : 'Training mode'} onClick={training.go} />}
      </nav>
      <nav className="bList" aria-label="Settings">
        {api.mode === 'live' && <MeRow icon="alert" label="App, notifications, sign-in" sub={devText} onClick={() => setDev(true)} />}
        {editor && z && <MeRow icon="truck" label="Connections" sub={`Zoho Books ${!z.connected ? 'not connected' : zohoBad ? 'needs reconnecting' : 'on'}${z.connected ? ' · Zoho Mail' : ''}`} onClick={() => setConn(!conn)} chev={conn ? 'chevD' : 'chevR'} />}
        {editor && z && conn && (
          <div className="bSub">
            <button type="button" onClick={() => (!z.connected || zohoBad ? connect() : checkZohoNow())}><b>Zoho Books</b><small className={!z.connected || zohoBad ? 'pSetWarn' : 'bOkChip'}>{zBusy ? 'Opening…' : !z.connected ? 'Connect' : zohoBad ? 'Reconnect' : 'On · check now'}</small></button>
            {z.connected && <button type="button" onClick={() => api.zohoConnect(true).catch((e) => toast((e as Error).message, 'warn'))}><b>Zoho Mail</b><small className="bMute">For emailing stock takes</small></button>}
          </div>
        )}
        <MeRow icon="lock" label="Password" sub="Only needed without your link" onClick={() => setPw(true)} />
      </nav>
      <button type="button" className="bOut" onClick={signOut}>Sign out</button>
    </div>
  );
}

function MeRow({ icon, label, sub, right, onClick, chev = 'chevR' }: { icon: string; label: string; sub?: string; right?: ReactNode; onClick: () => void; chev?: string }) {
  return (
    <button type="button" className="bRow" onClick={onClick}>
      <span className="bIc"><Icon name={icon} size={18} /></span><span className="bT"><b>{label}</b>{sub && <small>{sub}</small>}</span>{right}<Icon name={chev} size={17} />
    </button>
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
