// 19 · Phone notifications. Called by the schedule (reminder 5:30 pm, low stock 8:00 am), by the database when a
// Zoho delivery comes in, and by a signed-in person for "Send me a test". Keys live in public.app_secrets.
import webpush from 'npm:web-push@3.6.7';
import { admin, caller, cors, json } from '../_shared/zoho.ts';

type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string; prefs: Record<string, boolean> };
type Msg = { title: string; body: string; url: string; tag: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const b = await req.json().catch(() => ({})) as { kind?: string; site_id?: string; party?: string; grn?: string };
  const { data: sec } = await db.from('app_secrets').select('name, value');
  const S = Object.fromEntries((sec ?? []).map((r) => [r.name, r.value])) as Record<string, string>;
  if (!S.vapid_public || !S.vapid_private) return json({ error: 'Notifications are not set up yet.' });
  webpush.setVapidDetails('mailto:admin@ostock.co.ke', S.vapid_public, S.vapid_private);

  // Who is allowed to call: the schedule / database (secret header) or a signed-in person testing their own phone.
  const fromServer = !!S.cron_secret && req.headers.get('x-cron-secret') === S.cron_secret;
  let testUser: string | null = null;
  if (!fromServer) {
    if (b.kind !== 'test') return json({ error: 'Not allowed' }, 401);
    testUser = (await caller(req, db))?.id ?? null;
    if (!testUser) return json({ error: 'Sign in first' }, 401);
  }

  const send = async (subs: Sub[], m: Msg) => {
    let sent = 0;
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 6 * 3600 }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.from('push_subs').delete().eq('id', s.id); }
    }
    return sent;
  };
  // Store people (edit access, approved) of a site, with their phones.
  const storeSubs = async (siteId: string | null, pref: string) => {
    let q = db.from('profiles').select('id, site_id').eq('status', 'approved').eq('role', 'store').neq('access', 'demo');
    if (siteId) q = q.eq('site_id', siteId);
    const { data: people } = await q;
    const ids = (people ?? []).map((p) => p.id);
    if (!ids.length) return [] as (Sub & { site_id: string })[];
    const { data: subs } = await db.from('push_subs').select('id, user_id, endpoint, p256dh, auth, prefs').in('user_id', ids);
    const siteOf = new Map((people ?? []).map((p) => [p.id, p.site_id as string]));
    return ((subs ?? []) as Sub[]).filter((s) => s.prefs?.[pref] !== false).map((s) => ({ ...s, site_id: siteOf.get(s.user_id)! }));
  };
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Nairobi

  if (b.kind === 'test') {
    const { data: subs } = await db.from('push_subs').select('id, user_id, endpoint, p256dh, auth, prefs').eq('user_id', testUser!);
    const sent = await send((subs ?? []) as Sub[], { title: 'Ostock', body: 'Notifications work on this phone.', url: '/', tag: 'test' });
    return json({ sent });
  }
  if (b.kind === 'delivery' && b.site_id) {
    const subs = await storeSubs(b.site_id, 'delivery');
    const sent = await send(subs, { title: 'Delivery arrived', body: `${b.party ?? 'A supplier'}${b.grn ? ` · ${b.grn}` : ''} came in from Zoho. Check it in Deliveries.`, url: '/#/rec-deliveries', tag: `dlv-${b.grn ?? Date.now()}` });
    return json({ sent });
  }
  if (b.kind === 'reminder') {
    const subs = await storeSubs(null, 'reminder');
    const { data: done } = await db.from('day_submissions').select('site_id').eq('day', today);
    const doneSites = new Set((done ?? []).map((d) => d.site_id));
    const sent = await send(subs.filter((s) => s.site_id && !doneSites.has(s.site_id)), { title: 'Register closes at 6:00 pm', body: 'Today isn’t submitted yet. Open Ostock to finish the check-in.', url: '/#/home', tag: `rem-${today}` });
    return json({ sent });
  }
  if (b.kind === 'low') {
    const subs = await storeSubs(null, 'low');
    const { data: low } = await db.from('stock_balances').select('site_id, name, balance, reorder_level, low_alert').not('reorder_level', 'is', null);
    const bySite = new Map<string, string[]>();
    (low ?? []).filter((r) => r.low_alert !== false && Number(r.balance) <= Number(r.reorder_level)).forEach((r) => bySite.set(r.site_id, [...(bySite.get(r.site_id) ?? []), r.name]));
    let sent = 0;
    for (const [site, names] of bySite) {
      sent += await send(subs.filter((s) => s.site_id === site), { title: `${names.length} item${names.length === 1 ? '' : 's'} running low`, body: names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : ''), url: '/#/low', tag: `low-${today}` });
    }
    return json({ sent });
  }
  return json({ error: 'Unknown kind' }, 400);
});
