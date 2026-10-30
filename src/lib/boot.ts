/**
 * The boot screen lives in index.html, outside React, so it paints instantly and keeps
 * one continuous animation from first byte to the app being ready.
 *
 * Loading psychology used here:
 * - Something branded shows at once (no blank screen).
 * - The bar always creeps forward and never goes backwards, so it never looks stuck.
 * - Each message names the real step being done, so the wait feels purposeful.
 * - A returning person is greeted by name, which makes the wait feel shorter.
 * - It finishes with a small "done" moment (the tick), then fades into the app.
 * - If the network is slow it says so honestly and offers "Try again".
 */
let pct = 6;
let cap = 28;
let creep: number | undefined;
let slowTimer: number | undefined;
let finished = false;
let shownAt = performance.now();

const el = () => document.getElementById('boot');

function setBar(v: number) {
  pct = Math.max(pct, Math.min(v, 100));
  const bar = document.getElementById('bootBar');
  if (bar) bar.style.width = `${pct}%`;
}

function setMsg(text: string) {
  const m = document.getElementById('bootMsg');
  if (!m || m.textContent === text) return;
  m.classList.add('swap');
  setTimeout(() => { m.textContent = text; m.classList.remove('swap'); }, 180);
}

function startCreep() {
  const w = window as unknown as { __bootCreep?: number };
  if (w.__bootCreep) { clearInterval(w.__bootCreep); w.__bootCreep = undefined; }
  if (creep) clearInterval(creep);
  creep = window.setInterval(() => { if (pct < cap - 0.5) setBar(pct + (cap - pct) * 0.08); }, 250);
}

function watchSlow() {
  if (slowTimer) clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => {
    if (finished) return;
    setMsg('Slow connection. Still working on it…');
    slowTimer = window.setTimeout(() => { if (!finished) el()?.classList.add('slow'); }, 9000);
  }, 6000);
}

/** Move to a named step. `upTo` is how far the bar may creep while this step runs. */
export function bootStep(message: string, at: number, upTo: number) {
  if (finished) return;
  setMsg(message);
  setBar(at);
  cap = Math.max(cap, upTo);
  startCreep();
  watchSlow();
}

/** Show the boot screen again (e.g. loading the store right after signing in). */
export function bootShow(message: string) {
  const b = el();
  if (!b) return;
  finished = false;
  pct = 10; cap = 30;
  b.classList.remove('gone', 'ready', 'slow');
  shownAt = performance.now();
  bootStep(message, 12, 40);
}

/** Finish: complete the bar, draw the tick, then fade into the app. */
export function bootDone(opts: { quick?: boolean } = {}) {
  const b = el();
  if (!b || finished) return;
  finished = true;
  if (creep) clearInterval(creep);
  if (slowTimer) clearTimeout(slowTimer);
  b.classList.remove('slow');
  setBar(100);
  setMsg('Ready');
  b.classList.add('ready');
  // Short visits skip the flourish; a longer wait earns the little "done" moment.
  const waited = performance.now() - shownAt;
  const hold = opts.quick || waited < 500 ? 150 : 650;
  setTimeout(() => b.classList.add('gone'), hold);
}

export const isBootDone = () => finished || !!document.getElementById('boot')?.classList.contains('gone');

/** Remember who was here so the next visit greets them at once. */
export function rememberVisitor(name: string, site: string) {
  try { localStorage.setItem('ssms-last', JSON.stringify({ name: name.split(' ')[0], site })); } catch { /* ignore */ }
}
/** Greet the person actually signing in (a new account on a shared phone must not see the last person's name). */
export function bootGreet(name: string, site?: string) {
  const first = name.split(' ')[0];
  let back = false;
  try { back = JSON.parse(localStorage.getItem('ssms-last') || 'null')?.name === first; } catch { /* ignore */ }
  const h = document.getElementById('bootHello');
  void site; // no site on the welcome: not everyone has one (procurement)
  if (h) h.textContent = `${back ? 'Welcome back' : 'Welcome'}, ${first}`;
}
export function forgetVisitor() {
  try { localStorage.removeItem('ssms-last'); } catch { /* ignore */ }
}
