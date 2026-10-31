import { useEffect, useState } from 'react';
import { api, live } from '../lib/api';
import { exitTraining, resetTraining, startTraining } from '../lib/training';
import { guestCopiedAt, isShowcase, showcaseOff, startGuest, startShowcase } from '../lib/guest';
import type { User } from '../lib/types';
import { ask, toast } from './feedback';
import { Icon } from './fx';

/** Purple strip shown on every screen while training. */
export function TrainingBar() {
  if (api.mode === 'guest') return isShowcase() ? <ShowcaseBar /> : <GuestBar />;
  if (api.mode === 'live' && showcaseOff()) return <BackToDemo />;
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

/** Project manager and C-suite: the example store. */
function ShowcaseBar() {
  return (
    <div className="trainBar guestBar" role="status">
      <span className="trainTag">DEMO</span>
      <span className="trainText"><span className="long">Example store to show how Ostock works. The figures are not real.</span><span className="short">Demo · example figures</span></span>
      <span className="trainBtns"><button onClick={async () => {
        if (!live || !(await ask({ title: 'Reset the demo?', body: <p>Everything entered in the demo is cleared and it starts again.</p>, yes: 'Reset demo' }))) return;
        const u = await live.currentUser().catch(() => null);
        if (u) await startShowcase(live, u).catch((e) => toast((e as Error).message, 'warn'));
      }}>Reset</button></span>
    </div>
  );
}

/** After "See real data": a way back to the example store. */
function BackToDemo() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { live?.currentUser().then(setUser).catch(() => undefined); }, []);
  if (!user || user.access !== 'demo' || !live) return null;
  return (
    <div className="trainBar guestBar" role="status">
      <span className="trainTag">REAL</span>
      <span className="trainText"><span className="long">You are looking at the real data.</span><span className="short">Real data</span></span>
      <span className="trainBtns"><button onClick={() => startShowcase(live!, user).catch((e) => toast((e as Error).message, 'warn'))}>Back to demo</button></span>
    </div>
  );
}

/** Strip shown on every screen for a guest account. */
function GuestBar() {
  const at = guestCopiedAt();
  const reload = async () => {
    if (!live) return;
    const u = await live.currentUser().catch(() => null);
    if (u) await startGuest(live, u).catch((e) => toast((e as Error).message, 'warn'));
  };
  return (
    <div className="trainBar guestBar" role="status">
      <span className="trainTag">GUEST</span>
      <span className="trainText"><span className="long">A copy of this site{at ? ` from ${new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. Use anything; nothing here changes the real store.</span><span className="short">Guest copy · the real store is safe</span></span>
      <span className="trainBtns">
        <button onClick={async () => { if (await ask({ title: 'Start again from the real data?', body: <p>Everything you entered is cleared and a fresh copy of the site is made.</p>, yes: 'Fresh copy' })) reload(); }}>Fresh copy</button>
      </span>
    </div>
  );
}

/** Opens the practice store after a quick confirmation. */
export function useStartTraining(user: User) {
  const [busy, setBusy] = useState(false);
  const source = live ?? api;
  const go = async () => {
    const ok = await ask({
      title: 'Open training mode?',
      body: <>
        <p>Opens a practice store, <b>Comex Builders · Astana</b>, with two months of example entries: deliveries, withdrawal cards, returns, transfers, corrections, sign-ups and reports.</p>
        <p>Do the four evening steps and tap <b>Submit the day</b>. That counts as one training day (Monday to Saturday). <b>Nothing done here changes the real store.</b></p>
        <p>A purple strip shows while training is on. Tap <b>Exit training</b> to go back.</p>
      </>,
      yes: 'Start training', tone: 'go',
    });
    if (!ok) return;
    setBusy(true);
    try { await startTraining(source, user); } catch (e) { toast((e as Error).message, 'warn'); setBusy(false); }
  };
  return { go, busy };
}

/** Button that copies the real site into training mode. */
export function StartTraining({ user, className = 'railLink', label = 'Training mode' }: { user: User; className?: string; label?: string }) {
  const { go, busy } = useStartTraining(user);
  if (api.mode === 'training' || api.mode === 'guest') return null;
  return <button className={className} title={label} disabled={busy} onClick={go}><Icon name="shield" /><span className="rlText">{busy ? 'Opening the practice store…' : label}</span></button>;
}
