import { useState, type ReactNode } from 'react';
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
        {(user.role === 'admin' || user.role === 'store') && api.mode !== 'training' && <Row icon="shield" label={training.busy ? 'Opening the practice store…' : 'Training mode'} onClick={training.go} />}
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
