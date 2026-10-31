// Guest accounts: a copy of the person's site (e.g. Reveal) made at sign-in and kept in this browser.
// The guest uses every screen as a store keeper would; nothing reaches the real store
// (the database also refuses any write made with a guest's sign-in).
import { addDays, today } from './dates';
import type { Store } from './demoBackend';
import { buildAstanaTraining } from './trainingData';
import type { Backend, Role, Submission, User } from './types';

const FLAG = 'ssms-guest';
export const GUEST_KEY = 'ssms-guest-store';
const SITE = 'site-reveal'; // the demo backend's internal site id (never shown)

export function isGuest(): boolean {
  try { return sessionStorage.getItem(FLAG) === '1' && !!localStorage.getItem(GUEST_KEY); } catch { return false; }
}

/** Copies the real site into this browser, then reloads into the guest copy. */
export async function startGuest(source: Backend, user: User) {
  const t = today();
  const [items, docs, takes, bal, list, site, week, alert, gone, incoming, days] = await Promise.all([
    source.items(), source.documents('2000-01-01', addDays(t, 30)), source.stockTakes().catch(() => []), source.balances(),
    source.checklist().catch(() => []), source.siteName(), source.projectWeek().catch(() => ({ anchorNo: null, anchorDate: null })),
    source.alertInfo().catch(() => null), source.dismissedIncoming().catch(() => []),
    source.incoming(false).catch(() => ({ connected: true, thisWeek: [], nextWeek: [], part: [] })),
    source.submittedDays(addDays(t, -60), t).catch(() => [] as string[]),
  ]);
  const subs: Record<string, Submission> = {};
  for (let k = 0; k < days.length; k += 10) {
    const got = await Promise.all(days.slice(k, k + 10).map((d) => source.submission(d).catch(() => null)));
    got.forEach((s) => { if (s) subs[s.day] = s; });
  }
  const now = new Date().toISOString();
  const store: Store = {
    items,
    meta: { company: site.company, site: site.site, user: { email: user.email, name: user.name, role: 'store', trainingWaived: true } },
    docs, nextLine: docs.reduce((m, d) => d.lines.reduce((n, l) => Math.max(n, l.id), m), 0) + 1,
    submissions: subs,
    reorder: Object.fromEntries(bal.filter((b) => b.reorder_level != null).map((b) => [b.item_id, b.reorder_level])),
    extraItems: [], signedIn: true,
    checklist: { [SITE]: list.map((i) => i.id) },
    stockTakes: takes,
    sites: [{ id: SITE, name: site.site, company: site.company, week_anchor_no: week.anchorNo, week_anchor_date: week.anchorDate, ...(site.structure ?? {}),
      alert_name: alert?.name ?? null, alert_phone: null /* never the real phone: a guest can't message the site manager */, alert_sent_at: alert?.sent_at ?? null, alert_sent_by: alert?.sent_by ?? null }],
    profiles: [{ id: 'demo-admin', full_name: user.name, email: user.email, phone: null, role: 'store', status: 'approved', site_id: SITE, created_at: now, decided_at: now }],
    corrections: [], drafts: [], dismissed: gone, incoming, copiedAt: now,
  };
  localStorage.setItem(GUEST_KEY, JSON.stringify(store));
  sessionStorage.setItem(FLAG, '1');
  history.replaceState(null, '', '/#/home');
  location.reload();
}

/** Project manager and the C-suite open on a full example store (no Zoho to connect). */
export const SHOWCASE_ROLES: Role[] = ['project_manager', 'coo', 'ceo'];
const OFF = 'ssms-showcase-off';
/** They chose "See real data" in this tab. */
export const showcaseOff = () => { try { return sessionStorage.getItem(OFF) === '1'; } catch { return false; } };
export const wantsShowcase = (u: User) => SHOWCASE_ROLES.includes(u.role) && !showcaseOff();

export async function startShowcase(source: Backend, user: User) {
  const items = await source.items();
  // In the demo they work as a store keeper: every button, including Send to Site Manager.
  const store = buildAstanaTraining(items, { email: user.email, name: user.name, role: 'store' }, today());
  store.meta = { ...store.meta!, user: { ...store.meta!.user, trainingWaived: true } };
  store.showcase = true; store.copiedAt = new Date().toISOString();
  localStorage.setItem(GUEST_KEY, JSON.stringify(store));
  try { sessionStorage.removeItem(OFF); } catch { /* ignore */ }
  sessionStorage.setItem(FLAG, '1');
  history.replaceState(null, '', '/#/home');
  location.reload();
}

/** Leave the example store for the real data (this tab). */
export function seeRealData() {
  try { sessionStorage.setItem(OFF, '1'); sessionStorage.removeItem(FLAG); localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
  history.replaceState(null, '', '/#/home');
  location.reload();
}

export function isShowcase(): boolean {
  try { return !!(JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') as Store | null)?.showcase; } catch { return false; }
}

/** Leaves the guest copy (on sign out). */
export function endGuest() {
  try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(OFF); localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
}

export function guestCopiedAt(): string | null {
  try { return (JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') as Store | null)?.copiedAt ?? null; } catch { return null; }
}
