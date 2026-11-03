// Opens a demo with Reveal's real data, read only. Two ways in:
//  · a person's own demo link (token), no sign-in;
//  · a signed-in person the admin set to Demo mode.
// Returns a copy of the site (items, entries, counts, check-ins, incoming); nothing is ever written.
// The app keeps the copy in the person's browser, so whatever they do there never reaches the real store.
import { admin, caller, cors, json } from '../_shared/zoho.ts';

type Rec = Record<string, unknown>;
const SITE_NAME = (Deno.env.get('DEMO_SITE') ?? 'Reveal').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const b = await req.json().catch(() => ({})) as { token?: string };
  const db = admin();
  let name: string | null = null;
  const token = String(b.token ?? '');
  if (token) {
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'This demo link is not valid.' });
    const { data: p } = await db.from('profiles').select('full_name, status, access').eq('demo_token', token).maybeSingle();
    if (!p || p.status !== 'approved' || p.access !== 'demo') return json({ error: 'This demo link has ended. Ask for a new one.' });
    name = p.full_name as string;
  } else {
    const u = await caller(req, db);
    if (!u) return json({ error: 'Sign in first.' }, 401);
    const { data: p } = await db.from('profiles').select('full_name, status, access').eq('id', u.id).maybeSingle();
    if (!p || p.status !== 'approved' || p.access !== 'demo') return json({ error: 'Only people on Demo mode can open the demo.' }, 403);
    name = p.full_name as string;
  }

  const all = async (q: (a: number, z: number) => PromiseLike<{ data: Rec[] | null }>) => {
    const rows: Rec[] = [];
    for (let a = 0; a < 50000; a += 1000) { const { data } = await q(a, a + 999); rows.push(...(data ?? [])); if (!data || data.length < 1000) break; }
    return rows;
  };
  const { data: site } = await db.from('sites').select('*, companies(name)').eq('name', SITE_NAME).maybeSingle();
  if (!site) return json({ name, error: 'The demo site is not set up.' });
  const sid = site.id as string;
  const [items, docs, takes, subs, siteItems, checklist, cache, gone] = await Promise.all([
    all((a, z) => db.from('items').select('id, name, unit, in_zoho').order('id').range(a, z)),
    all((a, z) => db.from('documents').select('*, movements(id, document_id, kind, move_date, item_id, qty, subphase, return_of, corrects_kind)').eq('site_id', sid).order('created_at').range(a, z)),
    all((a, z) => db.from('stock_takes').select('id, count_date, start_time, end_time, counted_by, checked_by, is_first, status, created_at, stock_take_lines(item_id, qty)').eq('site_id', sid).order('count_date').range(a, z)),
    all((a, z) => db.from('day_submissions').select('day, submitted_at, steps, closed_reason').eq('site_id', sid).order('day').range(a, z)),
    all((a, z) => db.from('site_items').select('item_id, reorder_level, low_alert').eq('site_id', sid).range(a, z)),
    all((a, z) => db.from('site_checklist').select('item_id, position').eq('site_id', sid).order('position').range(a, z)),
    db.from('zoho_incoming_cache').select('body').eq('site_id', sid).maybeSingle().then((r) => r.data?.body ?? null),
    all((a, z) => db.from('incoming_dismissed').select('po_id, po, vendor, reason, dismissed_at').eq('site_id', sid).range(a, z)),
  ]);
  const company = (Array.isArray(site.companies) ? site.companies[0] : site.companies) as { name?: string } | null;
  return json({
    name,
    site: { name: site.name, company: company?.name ?? 'Comex Builders', week_anchor_no: site.week_anchor_no, week_anchor_date: site.week_anchor_date,
      basements: site.basements, has_ground: site.has_ground, floors: site.floors, roof_name: site.roof_name, alert_name: site.alert_name },
    items,
    docs: docs.map((d) => { const { movements, site_id: _s, ...rest } = d; void _s; return { ...rest, lines: ((movements as Rec[]) ?? []).sort((x, y) => Number(x.id) - Number(y.id)) }; }),
    stockTakes: takes.map((t) => { const { stock_take_lines, ...rest } = t; return { ...rest, lines: stock_take_lines ?? [] }; }),
    submissions: subs,
    siteItems,
    checklist: checklist.map((c) => c.item_id),
    incoming: cache,
    dismissed: gone,
  });
});
