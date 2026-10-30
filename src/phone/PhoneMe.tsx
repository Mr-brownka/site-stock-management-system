import { useState } from 'react';
import { ChangePassword } from '../components/ChangePassword';
import { Icon } from '../components/fx';
import { StartTraining } from '../components/Training';
import { UnfinishedCard } from '../components/Unfinished';
import { ZohoStatusLine } from '../components/Zoho';
import { canEdit, canSee, roleLabel } from '../lib/access';
import { api } from '../lib/api';
import { signal } from '../lib/signals';
import { useData } from '../lib/store';
import { PTop } from './PhoneUI';

/** "Me" on the phone: a page, not a pop-up. */
export function PhoneMe() {
  const { user, site, go, signOut, openAdmin } = useData();
  const [pw, setPw] = useState(false);
  const initials = user.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="pPage pMe">
      {pw && <ChangePassword onClose={() => setPw(false)} />}
      <PTop title="Me" back={false} />
      <section className="pWho"><span className="pAv">{initials}</span><span><b>{user.name}</b><small>{roleLabel(user)}{site ? ` · ${site}` : ''}{api.mode === 'demo' ? ' · demo' : ''}</small></span></section>
      <div className="pFinish"><UnfinishedCard /></div>
      <div className="pRows boxed">
        <button className="pRow" onClick={() => go('submitted')}><span className="pRowIc"><Icon name="calendar" size={18} /></span><b>Today’s summary</b><Icon name="chevR" size={18} /></button>
        {canEdit(user) && canSee(user, 'corrections') && <button className="pRow" onClick={() => go('corrections')}><span className="pRowIc"><Icon name="fix" size={18} /></span><b>Fix an error</b><Icon name="chevR" size={18} /></button>}
        <button className="pRow" onClick={() => signal('palette')}><span className="pRowIc"><Icon name="search" size={18} /></span><b>Search items and pages</b><Icon name="chevR" size={18} /></button>
      </div>
      <div className="pRows boxed pMeList">
        {user.role === 'admin' && <button className="railLink" onClick={openAdmin}><Icon name="user" /><span className="rlText">Admin</span></button>}
        <ZohoStatusLine compact />
        {(user.role === 'admin' || user.role === 'store') && <StartTraining user={user} label="Training mode" />}
        <button className="railLink" onClick={() => setPw(true)}><Icon name="lock" /><span className="rlText">Change password</span></button>
        <button className="railLink signOut" onClick={signOut}><Icon name="out" /><span className="rlText">Sign out</span></button>
      </div>
    </div>
  );
}
