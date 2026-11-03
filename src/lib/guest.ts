// Guest accounts: a copy of the person's site (e.g. Reveal) made at sign-in and kept in this browser.
// The guest uses every screen as a store keeper would; nothing reaches the real store
// (the database also refuses any write made with a guest's sign-in).
import { addDays, today } from './dates';
import type { Store } from './demoBackend';
import type { Backend, Submission, User } from './types';

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

/** People the admin set to "Demo mode" open on a full example store (no Zoho to connect). */
const OFF = 'ssms-showcase-off';
/** They chose "See real data" in this tab. */
export const showcaseOff = () => { try { return sessionStorage.getItem(OFF) === '1'; } catch { return false; } };
export const wantsShowcase = (u: User) => u.access === 'demo' && u.role !== 'admin' && !showcaseOff();

export async function startShowcase(_source: Backend, user: User) {
  // Signed in on Demo mode: the server sends a read-only copy of Reveal (checked against their account).
  const snap = await fetchDemo({}, sessionJwt());
  await openShowcase(snap, user.email, user.name);
}

type Snap = {
  name?: string; error?: string;
  site?: { name: string; company: string; week_anchor_no: number | null; week_anchor_date: string | null; basements?: number; has_ground?: boolean; floors?: number | null; roof_name?: string | null; alert_name?: string | null };
  items?: { id: number | string; name: string; unit: string; in_zoho?: boolean }[];
  docs?: (Record<string, unknown> & { lines: Record<string, unknown>[] })[];
  stockTakes?: (Record<string, unknown> & { lines: { item_id: number | string; qty: number | string }[] })[];
  submissions?: { day: string; submitted_at: string; steps: Submission['steps']; closed_reason: string | null }[];
  siteItems?: { item_id: number | string; reorder_level: number | string | null; low_alert: boolean }[];
  checklist?: (number | string)[];
  incoming?: unknown; dismissed?: unknown[];
};
const sessionJwt = () => {
  try { for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token$/.test(k)) return (JSON.parse(localStorage.getItem(k) || 'null') as { access_token?: string } | null)?.access_token ?? null; } catch { /* ignore */ }
  return null;
};
async function fetchDemo(body: { token?: string }, jwt: string | null): Promise<Snap> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined, key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) throw new Error('The demo opens on the live site only.');
  const r = await fetch(`${url}/functions/v1/demo-open`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${jwt ?? key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})) as Snap;
  if (!j.name || !j.site || !j.items) throw new Error(j.error ?? 'The demo could not be opened. Try again in a minute.');
  return j;
}

/** Builds the demo from Reveal's real data, kept only in this browser, and opens it. Nothing reaches the real store. */
export async function openShowcase(snap: Snap, email: string, name: string) {
  const n = (v: unknown) => Number(v) || 0;
  const docs = (snap.docs ?? []).map((d) => ({ ...d, id: String(d.id), lines: d.lines.map((l) => ({
    id: n(l.id), document_id: String(l.document_id), kind: l.kind, move_date: String(l.move_date), item_id: n(l.item_id), qty: n(l.qty),
    subphase: (l.subphase as string) ?? null, return_of: l.return_of == null ? null : n(l.return_of), corrects_kind: (l.corrects_kind as string) ?? null })) })) as unknown as Store['docs'];
  const s = snap.site!;
  const now = new Date().toISOString();
  const store: Store = {
    items: snap.items!.map((i) => ({ id: n(i.id), name: i.name, unit: i.unit, in_zoho: i.in_zoho !== false })),
    // In the demo they work as a store keeper: every button, including Send to Site Manager.
    meta: { company: s.company, site: s.name, user: { email, name, role: 'store', trainingWaived: true } },
    docs, nextLine: docs.reduce((m, d) => d.lines.reduce((x, l) => Math.max(x, l.id), m), 0) + 1,
    submissions: Object.fromEntries((snap.submissions ?? []).map((x) => [x.day, { day: x.day, submitted_at: x.submitted_at, steps: x.steps ?? {}, closed_reason: x.closed_reason ?? null }])),
    reorder: Object.fromEntries((snap.siteItems ?? []).filter((x) => x.reorder_level != null).map((x) => [n(x.item_id), n(x.reorder_level)])),
    lowOff: (snap.siteItems ?? []).filter((x) => x.low_alert === false).map((x) => n(x.item_id)),
    extraItems: [], signedIn: true,
    checklist: { [SITE]: (snap.checklist ?? []).map(n) },
    stockTakes: (snap.stockTakes ?? []).map((t) => ({ ...t, lines: t.lines.map((l) => ({ item_id: n(l.item_id), qty: n(l.qty) })) })) as unknown as Store['stockTakes'],
    sites: [{ id: SITE, name: s.name, company: s.company, week_anchor_no: s.week_anchor_no, week_anchor_date: s.week_anchor_date,
      ...(s.floors ? { basements: s.basements ?? 0, has_ground: s.has_ground ?? true, floors: s.floors, roof_name: s.roof_name ?? null } : {}),
      alert_name: s.alert_name ?? null, alert_phone: null /* a demo never messages the real site manager */ }],
    profiles: [{ id: 'demo-admin', full_name: name, email, phone: null, role: 'store', status: 'approved', site_id: SITE, created_at: now, decided_at: now }],
    corrections: [], drafts: [], dismissed: (snap.dismissed ?? []) as Store['dismissed'],
    ...(snap.incoming ? { incoming: snap.incoming as Store['incoming'] } : {}),
    showcase: true, copiedAt: now,
  };
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
  try { sessionStorage.removeItem(FLAG); sessionStorage.removeItem(OFF); localStorage.removeItem(GUEST_KEY); localStorage.removeItem(LINK); } catch { /* ignore */ }
}

// ── Demo links: management opens their own demo from a WhatsApp link, without signing in. ──
const LINK = 'ostock-demo-link';
/** The demo link this browser was opened with (kept, so coming back opens the same demo). */
export const demoLinkToken = () => { try { return localStorage.getItem(LINK); } catch { return null; } };
export const demoUrl = (token: string) => `${location.origin}/?demo=${token}`;

/** Opens the demo for a link. Coming back with the same link keeps everything entered; a new link (or Reset) starts afresh. */
export async function openDemoLink(token: string, fresh = false) {
  let keep = false;
  try { keep = !fresh && localStorage.getItem(LINK) === token && isShowcase(); } catch { /* ignore */ }
  if (!keep) {
    const snap = await fetchDemo({ token }, null);
    localStorage.setItem(LINK, token);
    await openShowcase(snap, `demo-${token.slice(0, 8)}@demo.ostock`, snap.name!);
    return;
  }
  sessionStorage.setItem(FLAG, '1');
  history.replaceState(null, '', '/#/home');
  location.reload();
}

export function guestCopiedAt(): string | null {
  try { return (JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') as Store | null)?.copiedAt ?? null; } catch { return null; }
}

/** Demo mode (the example store), not a guest's copy of a real site. */
export const isDemoMode = () => isGuest() && isShowcase();
