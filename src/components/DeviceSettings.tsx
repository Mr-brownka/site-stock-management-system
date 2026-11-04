import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { canPrompt, currentSub, DEFAULT_PREFS, isInstalled, isIos, promptInstall, pushNeedsInstall, pushSupported, subscribe } from '../lib/pwa';
import type { PasskeyRow, PushPrefs } from '../lib/types';
import { Icon } from './fx';
import { toast } from './feedback';

const PREF_LABEL: [keyof PushPrefs, string, string][] = [
  ['reminder', 'Reminder before the register closes', '5:30 pm, if today isn’t submitted yet'],
  ['delivery', 'A Zoho delivery arrived', 'As soon as Zoho brings one in'],
  ['low', 'Items running low', 'Every morning at 8:00, when something is low'],
];

export const passkeySupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential;

/** 19 · 20 · This phone: install Ostock as an app, notifications, and fingerprint / Face ID sign-in. */
export function DeviceSettings() {
  const dev = api.device;
  const [ready, setReady] = useState<{ push: boolean; passkey: boolean } | null>(null);
  const [, setTick] = useState(0);
  const [prefs, setPrefs] = useState<PushPrefs | null>(null); // null = off on this phone
  const [keys, setKeys] = useState<PasskeyRow[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!dev) return;
    dev.ready().then(setReady).catch(() => setReady({ push: false, passkey: false }));
    const on = () => setTick((n) => n + 1);
    window.addEventListener('ostock-install', on);
    return () => window.removeEventListener('ostock-install', on);
  }, [dev]);
  useEffect(() => {
    if (!dev || !ready) return;
    if (ready.push) currentSub().then((s) => (s ? dev.pushGet(s.endpoint) : null)).then(setPrefs).catch(() => setPrefs(null));
    if (ready.passkey) dev.passkeys().then(setKeys).catch(() => setKeys([]));
  }, [dev, ready]);
  if (!dev || api.mode !== 'live') return null;

  const run = async (k: string, f: () => Promise<void>) => { setBusy(k); try { await f(); } catch (e) { const m = (e as Error).message; if (!/abort|cancel|not allowed/i.test(m)) toast(m, 'warn'); } finally { setBusy(''); } };
  const turnOn = () => run('push', async () => { const s = await subscribe(); await dev.pushSave(s.toJSON(), DEFAULT_PREFS); setPrefs(DEFAULT_PREFS); toast('Notifications are on for this phone', 'ok'); });
  const turnOff = () => run('push', async () => { const s = await currentSub(); if (s) { await dev.pushRemove(s.endpoint).catch(() => undefined); await s.unsubscribe(); } setPrefs(null); toast('Notifications are off for this phone'); });
  const setPref = (k: keyof PushPrefs, v: boolean) => run(k, async () => { const s = await currentSub(); if (!s || !prefs) return; const p = { ...prefs, [k]: v }; await dev.pushSave(s.toJSON(), p); setPrefs(p); });

  const installed = isInstalled();
  return (
    <div className="dv">
      <h3 className="dvH">Ostock on this {/Mobi|Android|iPhone/.test(navigator.userAgent) ? 'phone' : 'device'}</h3>

      <section className="dvCard">
        <div className="dvRow"><span className="dvIc"><Icon name="box" size={18} /></span>
          <span className="dvT"><b>Ostock as an app</b><small>{installed ? 'Installed. It opens full screen from its own icon.' : 'An icon on the home screen, opens full screen, works with no signal.'}</small></span>
          {installed ? <span className="dvOk">On</span> : canPrompt() ? <button className="btn accent sm" onClick={() => promptInstall()}>Install</button> : null}
        </div>
        {!installed && !canPrompt() && <p className="dvHow">{isIos() ? <>On iPhone: tap <b>Share</b> <Icon name="upload" size={13} /> at the bottom of Safari, then <b>Add to Home Screen</b>.</> : <>Open the browser menu <b>⋮</b> and choose <b>Install app</b> or <b>Add to Home screen</b>.</>}</p>}
      </section>

      <section className="dvCard">
        <div className="dvRow"><span className="dvIc"><Icon name="alert" size={18} /></span>
          <span className="dvT"><b>Notifications</b><small>{!ready ? 'Checking…' : !ready.push ? 'Coming very soon: being switched on.' : !pushSupported() ? 'This browser can’t show notifications.' : pushNeedsInstall() ? 'On iPhone, add Ostock to the home screen first (above).' : prefs ? 'On for this phone' : 'Off for this phone'}</small></span>
          {ready?.push && pushSupported() && !pushNeedsInstall() && (
            <button role="switch" aria-checked={!!prefs} aria-label="Notifications on this phone" className={`dvSwitch ${prefs ? 'on' : ''}`} disabled={busy === 'push'} onClick={prefs ? turnOff : turnOn}><i /></button>
          )}
        </div>
        {prefs && PREF_LABEL.map(([k, t, s]) => (
          <label key={k} className="dvRow dvSub"><span className="dvT"><b>{t}</b><small>{s}</small></span>
            <input type="checkbox" className="dvCheck" checked={prefs[k]} disabled={busy === k} onChange={(e) => setPref(k, e.target.checked)} aria-label={t} /></label>
        ))}
        {prefs && <button className="dvLink" disabled={busy === 'test'} onClick={() => run('test', async () => { toast(await dev.pushTest()); })}>{busy === 'test' ? 'Sending…' : 'Send me a test notification'}</button>}
      </section>

      <section className="dvCard">
        <div className="dvRow"><span className="dvIc"><Icon name="lock" size={18} /></span>
          <span className="dvT"><b>Sign in with fingerprint or Face ID</b><small>{!ready ? 'Checking…' : !ready.passkey ? 'Coming very soon: being switched on.' : !passkeySupported() ? 'This browser can’t do it.' : keys?.length ? `On · ${keys.length} device${keys.length === 1 ? '' : 's'}` : 'No more typing the password on this phone'}</small></span>
          {ready?.passkey && passkeySupported() && <button className="btn sm" disabled={busy === 'pk'} onClick={() => run('pk', async () => { await dev.passkeyAdd(); setKeys(await dev.passkeys()); toast('Done. Next time, tap “Use fingerprint or Face ID” on the sign-in page.', 'ok'); })}>{busy === 'pk' ? 'Waiting…' : keys?.length ? 'Add this device' : 'Turn on'}</button>}
        </div>
        {keys?.map((k) => (
          <div key={k.id} className="dvRow dvSub"><span className="dvT"><b>{k.device || 'Device'}</b><small>Added {new Date(k.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</small></span>
            <button className="btn ghost sm" onClick={() => run(`rm${k.id}`, async () => { await dev.passkeyRemove(k.id); setKeys((ks) => (ks ?? []).filter((x) => x.id !== k.id)); })}>Remove</button></div>
        ))}
      </section>
    </div>
  );
}

/** The same, as a pop-up from the laptop menu. */
export function DeviceSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dvSheet" role="dialog" aria-modal="true" aria-label="App, notifications and sign-in">
        <button className="iconBtn dvClose" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        <DeviceSettings />
      </section>
    </div>, document.body);
}
