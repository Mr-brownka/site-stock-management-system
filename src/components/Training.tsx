import { useState } from 'react';
import { api, live } from '../lib/api';
import { exitTraining, resetTraining, startTraining } from '../lib/training';
import type { User } from '../lib/types';
import { ask, toast } from './feedback';
import { Icon } from './fx';

/** Purple strip shown on every screen while training. */
export function TrainingBar() {
  if (api.mode !== 'training') return null;
  return (
    <div className="trainBar" role="status">
      <span className="trainTag">TRAINING</span>
      <span className="trainText"><span className="long">Practice copy of the real store. Nothing here changes real stock.</span><span className="short">Practice copy · real stock is safe</span></span>
      <span className="trainBtns">
        <button onClick={async () => { if (await ask({ title: 'Start the practice again?', body: <p>Everything entered in training is cleared and the copy goes back to how it started.</p>, yes: 'Reset practice' })) resetTraining(); }}>Reset</button>
        <button className="exit" onClick={exitTraining}>Exit training</button>
      </span>
    </div>
  );
}

/** Button that copies the real site into training mode. */
export function StartTraining({ user, className = 'railLink', label = 'Training mode' }: { user: User; className?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  if (api.mode === 'training') return null;
  const source = live ?? api;
  const go = async () => {
    const ok = await ask({
      title: 'Open training mode?',
      body: <>
        <p>Site Stock makes a practice copy of your site on this device: the item list, stock and the last 4 weeks of entries.</p>
        <p>New storekeepers can then do the whole evening check-in, fix mistakes and open reports. <b>Nothing they do changes the real store.</b></p>
        <p>A purple strip shows while training is on. Tap <b>Exit training</b> to go back.</p>
      </>,
      yes: 'Start training', tone: 'go',
    });
    if (!ok) return;
    setBusy(true);
    try { await startTraining(source, user); } catch (e) { toast((e as Error).message, 'warn'); setBusy(false); }
  };
  return <button className={className} disabled={busy} onClick={go}><Icon name="shield" />{busy ? 'Copying the store…' : label}</button>;
}
