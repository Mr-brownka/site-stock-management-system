// Every error the app hits is recorded quietly (who, which screen, the message), so a white page can be traced.
// Works in every mode, including demo links with no sign-in. Never more than 20 per tab, never the same one twice.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const seen = new Set<string>();
let sent = 0;

const version = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src.split('/').pop() ?? '';
const who = () => { try { return (JSON.parse(localStorage.getItem('ssms-last') || 'null') as { name?: string } | null)?.name ?? null; } catch { return null; } };
const mode = () => { try { return sessionStorage.getItem('ssms-guest') === '1' ? 'guest/demo' : sessionStorage.getItem('ssms-training') === '1' ? 'training' : 'live'; } catch { return null; } };
/** The signed-in person's token, so the row carries who it was (none in a demo link). */
const jwt = () => {
  try {
    for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) return (JSON.parse(localStorage.getItem(k) || 'null') as { access_token?: string } | null)?.access_token ?? null;
  } catch { /* ignore */ }
  return null;
};

export function logError(e: unknown, where?: string) {
  if (!url || !key) return;
  const err = e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
  const msg = String(err.message || err).slice(0, 2000);
  const sig = msg + '|' + (where ?? '');
  if (!msg || seen.has(sig) || sent >= 20) return;
  seen.add(sig); sent++;
  const body = { who: who(), mode: mode(), screen: where ?? (location.hash.replace(/^#\/?/, '') || 'home'), message: msg, stack: (err.stack ?? '').slice(0, 8000), url: location.href.slice(0, 500), version: version(), agent: navigator.userAgent.slice(0, 300) };
  fetch(`${url}/rest/v1/client_errors`, { method: 'POST', keepalive: true, headers: { apikey: key, Authorization: `Bearer ${jwt() ?? key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }).catch(() => undefined);
}

export function installErrorLog() {
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message, 'window'));
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason, 'promise'));
}

/** A new version went live while the app is open: show a small "New version · Refresh" note instead of failing later. */
export function watchForNewVersion(onNew: () => void) {
  const mine = version();
  if (!mine) return;
  let told = false;
  const check = async () => {
    if (told || document.visibilityState !== 'visible') return;
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
      const now = /\/assets\/(index-[^"']+\.js)/.exec(html)?.[1];
      if (now && now !== mine) { told = true; onNew(); }
    } catch { /* offline: try later */ }
  };
  setInterval(check, 5 * 60_000);
  document.addEventListener('visibilitychange', check);
}
