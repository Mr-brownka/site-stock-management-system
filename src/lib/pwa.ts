/** 19 · Ostock as an app on the phone: the service worker, "Install", and notifications. */
import type { PushPrefs } from './types';

export const VAPID_PUBLIC = 'BNSu_GVKBGpC4uiHIH0zubjNYJHVQ9D-CyK0rOF1AHR1RKyDC8tWH4IkZPq4qIEkhryZNa2c3zQKZ-lOQ2gclAU';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let installEvt: InstallEvent | null = null;
const fire = () => window.dispatchEvent(new Event('ostock-install'));

export function installPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e as InstallEvent; fire(); });
  window.addEventListener('appinstalled', () => { installEvt = null; fire(); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
  }
}

export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
/** Android/Chrome/Edge: the browser can show its own install box. */
export const canPrompt = () => !!installEvt;
export async function promptInstall() {
  if (!installEvt) return false;
  await installEvt.prompt();
  const r = await installEvt.userChoice;
  installEvt = null; fire();
  return r.outcome === 'accepted';
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhones only allow notifications once Ostock is on the home screen. */
export const pushNeedsInstall = () => isIos() && !isInstalled();

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks the phone for permission (once) and returns this phone's address for notifications. */
export async function subscribe(): Promise<PushSubscription> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for Ostock. Allow them in the phone’s settings for this site, then try again.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
}

export const DEFAULT_PREFS: PushPrefs = { reminder: true, low: true, delivery: true };
