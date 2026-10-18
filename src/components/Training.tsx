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
      <span className="trainText"><span className="long">Practice store with example data. Nothing here changes real stock.</span><span className="short">Practice store · real stock is safe</span></span>
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
        <p>Opens a practice store, <b>Comex Builders · Astana</b>, with two months of example entries: deliveries, withdrawal cards, returns, transfers, corrections, sign-ups and reports.</p>
        <p>Use it to train storekeepers or to show management. <b>Nothing done here changes the real store.</b></p>
        <p>A purple strip shows while training is on. Tap <b>Exit training</b> to go back.</p>
      </>,
      yes: 'Start training', tone: 'go',
    });
    if (!ok) return;
    setBusy(true);
    try { await startTraining(source, user); } catch (e) { toast((e as Error).message, 'warn'); setBusy(false); }
  };
  if (className.includes('wBtn')) return (
    <button className={className} disabled={busy} onClick={go}>
      <Icon name="shield" size={28} />
      <span><b>{busy ? 'Opening the practice store…' : label}</b><small>Practise the full evening check-in on example data</small></span>
      <Icon name="arrow" size={22} />
    </button>
  );
  return <button className={className} disabled={busy} onClick={go}><Icon name="shield" />{busy ? 'Opening the practice store…' : label}</button>;
}
