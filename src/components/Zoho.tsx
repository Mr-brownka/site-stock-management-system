import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import type { ZohoRef, ZohoStatus } from '../lib/types';
import { toast } from './feedback';

/** Opens the exact record in Zoho Books. The tab opens straight away (so it isn't blocked), shows a short
 *  "Opening…" note while the record is looked up, then lands on it. Falls back to the list if it can't be found. */
export async function openInZoho(ref: ZohoRef) {
  const w = window.open('', '_blank');
  if (w) { try { w.document.title = 'Opening Zoho Books…'; w.document.body.innerHTML = '<p style="font:15px system-ui;color:#555;padding:40px;text-align:center">Opening ' + (ref.po || ref.grn || 'the record') + ' in Zoho Books…</p>'; } catch { /* cross-origin */ } }
  const r = await api.zohoOpen(ref).catch(() => ({ url: undefined, error: 'offline' }));
  const url = r.url ?? 'https://books.zoho.com/app#/purchaseorders';
  if (w) w.location.href = url; else window.open(url, '_blank', 'noopener');
  if (r.error && !r.url) toast('Couldn’t find it in Zoho. Opened the list instead.');
}

/** "Open in Zoho Books ↗" for one record. */
export function ZohoOpen({ zref, className = 'btn ghost', label = 'Open in Zoho Books ↗' }: { zref: ZohoRef; className?: string; label?: string }) {
  return <button type="button" className={className} onClick={(e) => { e.stopPropagation(); openInZoho(zref); }}>{label}</button>;
}

/** The small blue tag on anything that came from Zoho Books. */
/** From Zoho: the Zoho Books icon, with the goods received note number when there is one. */
export const ZohoTag = ({ grn }: { grn?: string | null }) => (
  <span className="zohoTag" title="From Zoho Books"><ZohoBooksMark size={16} />{grn ? <span className="mono">{grn}</span> : null}</span>
);

const ago = (iso: string | null) => {
  if (!iso) return 'not yet';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Zoho Books' own logo, from the file in public/brand (dropped in by the owner). Falls back to the ZOHO tag. */
export function ZohoBooksMark({ size = 20 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  return ok
    ? <img className="zbMark" src="/brand/zoho-books.png" alt="" aria-hidden="true" width={size} height={size} onError={() => setOk(false)} />
    : <b className="zohoWord">ZOHO</b>;
}

/** Is a Zoho check running right now? Shared, so every Refresh button spins together. */
let syncing = false;
const syncListeners = new Set<(v: boolean) => void>();
const setSyncing = (v: boolean) => { syncing = v; syncListeners.forEach((f) => f(v)); };
export function useZohoSyncing() {
  const [v, setV] = useState(syncing);
  useEffect(() => { syncListeners.add(setV); return () => { syncListeners.delete(setV); }; }, []);
  return v;
}

let shared: ZohoStatus | null | undefined;
const listeners = new Set<(s: ZohoStatus | null) => void>();
const publish = (s: ZohoStatus | null) => { shared = s; listeners.forEach((f) => f(s)); };
export async function loadZoho() { publish(await api.zohoStatus().catch(() => null)); return shared ?? null; }

/** My Zoho connection, shared by every place that shows it. null = Zoho not set up (or demo). */
export function useZoho() {
  const [s, setS] = useState<ZohoStatus | null | undefined>(shared);
  useEffect(() => { listeners.add(setS); if (shared === undefined) loadZoho(); return () => { listeners.delete(setS); }; }, []);
  return s;
}

export function useZohoConnect() {
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try { await api.zohoConnect(); } catch (e) { toast((e as Error).message, 'warn'); setBusy(false); }
  };
  return { connect, busy };
}

/** Runs in the background: welcomes people back from Zoho's sign-in, and keeps deliveries coming in. */
export function ZohoAutoSync() {
  const { refresh, refreshUnfinished } = useData();
  const running = useRef(false);
  const sync = useCallback(async (loud: boolean) => {
    if (running.current) return;
    running.current = true;
    const started = Date.now();
    if (loud) setSyncing(true);
    try {
      const r = await api.zohoSync();
      await loadZoho();
      if (r.error) { if (loud) toast(`Zoho: ${r.error}`, 'warn'); return; }
      if (r.imported) { await refresh(); refreshUnfinished(); toast(`${r.imported} deliver${r.imported === 1 ? 'y' : 'ies'} came in from Zoho`); }
      // A big first check is done in parts; carry straight on with the next part.
      if (r.more) setTimeout(() => { running.current = false; sync(loud); }, 1500);
      else if (loud) toast(r.pending ? `Zoho checked · ${r.pending} waiting for the admin to match items` : 'Zoho checked · nothing new');
    } finally {
      running.current = false;
      // Keep the spin on screen long enough to be seen, even when Zoho answers fast.
      if (loud) setTimeout(() => setSyncing(false), Math.max(0, 900 - (Date.now() - started)));
    }
  }, [refresh, refreshUnfinished]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const z = q.get('zoho');
    if (z) {
      history.replaceState(null, '', location.pathname + location.hash);
      if (z === 'connected') { toast('Zoho connected · checking for deliveries'); loadZoho().then(() => sync(true)); }
      else if (z === 'declined') toast('Zoho was not connected. You can try again any time.', 'warn');
      else toast(`Zoho: ${q.get('why') ?? 'something went wrong'}`, 'warn');
    }
    // Check on opening (if the last check was more than 3 minutes ago), then every 5 minutes.
    loadZoho().then((s) => { if (s?.connected && (!s.last_sync_at || Date.now() - new Date(s.last_sync_at).getTime() > 180_000)) sync(false); });
    const t = setInterval(() => { if (shared?.connected && document.visibilityState === 'visible') sync(false); }, 300_000);
    return () => clearInterval(t);
  }, [sync]);
  useEffect(() => { zohoSyncNow = () => sync(true); }, [sync]);
  return null;
}
let zohoSyncNow: () => void = () => undefined;
export const checkZohoNow = () => zohoSyncNow();

/** The Zoho refresh button: just the Zoho Books logo. Clicking it brings in new goods received; a ring turns round it while Zoho is being checked. */
export function ZohoRefresh({ className = 'zohoLogoBtn' }: { className?: string; label?: string }) {
  const busy = useZohoSyncing();
  return (
    <button className={`zohoLogoBtn ${className === 'zohoLogoBtn' ? '' : 'inCard'} ${busy ? 'busy' : ''}`} onClick={checkZohoNow} disabled={busy} aria-busy={busy}
      title={busy ? 'Checking Zoho Books…' : 'Refresh from Zoho Books'} aria-label={busy ? 'Refreshing from Zoho Books' : 'Refresh from Zoho Books'}>
      <ZohoBooksMark size={22} />
    </button>
  );
}

/** True when this store's deliveries come from Zoho: then they are never typed in Bohari (no double counting). */
export function useZohoDeliveries() {
  const s = useZoho();
  return !!s?.connected;
}

/** Status line + actions, for the account menu and the welcome page. */
export function ZohoStatusLine({ compact }: { compact?: boolean }) {
  const s = useZoho();
  const { connect, busy } = useZohoConnect();
  if (s === undefined || s === null) return null;
  if (!s.connected) {
    return compact
      ? <button className="railLink zohoMenu" onClick={connect} disabled={busy}><span className="zohoDot off" /><span className="rlText">{busy ? 'Opening Zoho…' : 'Connect my Zoho'}</span></button>
      : (
        <div className="zohoCard">
          <div><b>Connect your Zoho</b><span>So goods you receive in Zoho appear in the system by themselves. You sign in on Zoho’s own page; the system can only read.</span></div>
          <button className="btn" onClick={connect} disabled={busy}><ZohoTag />{busy ? 'Opening Zoho…' : 'Connect my Zoho'}</button>
        </div>
      );
  }
  // Zoho refused or the sign-in ran out: the fix is to connect again (and accept the permissions).
  const reconnect = !!s.last_error && /allow|authori|expired|connect zoho again|invalid_(token|client|grant)/i.test(s.last_error);
  if (reconnect) {
    return compact
      ? <button className="railLink zohoMenu" onClick={connect} disabled={busy} title={s.last_error ?? ''}><span className="zohoDot err" /><span className="rlText">{busy ? 'Opening Zoho…' : 'Reconnect Zoho'}</span></button>
      : <div className="zohoCard"><div><b>Reconnect your Zoho</b><span>Zoho needs you to accept access again.</span><span className="zohoErr">{s.last_error}</span></div><button className="btn" onClick={connect} disabled={busy}><ZohoTag />{busy ? 'Opening Zoho…' : 'Reconnect Zoho'}</button></div>;
  }
  return compact
    ? <button className="railLink zohoMenu" onClick={checkZohoNow} title={s.last_error ?? `Connected${s.zoho_email ? ` as ${s.zoho_email}` : ''}`}><span className={`zohoDot ${s.last_error ? 'err' : ''}`} /><span className="rlText">{s.last_error ? 'Zoho needs attention' : `Zoho · checked ${ago(s.last_sync_at)}`}</span></button>
    : <div className="zohoCard ok"><div><b>Zoho connected</b><span>{s.zoho_email ? `${s.zoho_email} · ` : ''}checked {ago(s.last_sync_at)} · {s.imported} brought in</span>{s.last_error && <span className="zohoErr">{s.last_error}</span>}</div><ZohoRefresh className="btn ghost sm zohoRefresh" /></div>;
}
