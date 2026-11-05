// Fetches Zoho's full item list (read only) into public.zoho_items, the master list used to check stock take uploads.
// Who can run it: an admin (signed in) or the server (x-cron-secret). Uses any working Zoho connection.
import { admin, caller, cors, json, refreshAccess, zget } from '../_shared/zoho.ts';

type Rec = Record<string, unknown>;
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const { data: sec } = await db.from('app_secrets').select('value').eq('name', 'cron_secret').maybeSingle();
  const fromServer = !!sec?.value && req.headers.get('x-cron-secret') === sec.value;
  if (!fromServer) {
    const u = await caller(req, db);
    if (!u) return json({ error: 'Sign in first' }, 401);
    const { data: p } = await db.from('profiles').select('role').eq('id', u.id).maybeSingle();
    if (p?.role !== 'admin') return json({ error: 'Only the admin can refresh the Zoho item list.' }, 403);
  }
  const { data: conns } = await db.from('zoho_connections').select('*').order('last_sync_at', { ascending: false });
  let lastErr = 'Nobody has connected Zoho yet.';
  for (const c of (conns ?? []) as Rec[]) {
    try {
      const token = await refreshAccess(String(c.refresh_token), String(c.accounts_domain));
      const base = c.api_kind === 'inventory' ? '/inventory/v1' : '/books/v3';
      const rows: Rec[] = [];
      for (let page = 1; page <= 100; page++) {
        const r = await zget(String(c.api_domain), token, `${base}/items`, { organization_id: String(c.org_id), per_page: '200', page: String(page) });
        if (!r.ok) throw new Error(`Zoho said ${r.status}: ${String(r.body.message ?? '').slice(0, 140)}`);
        const items = (r.body.items as Rec[] | undefined) ?? [];
        rows.push(...items);
        const more = (r.body.page_context as Rec | undefined)?.has_more_page;
        if (!more || !items.length) break;
      }
      const now = new Date().toISOString();
      const up = rows.map((z) => ({ zoho_item_id: String(z.item_id), name: String(z.name ?? z.item_name ?? '').trim(), unit: str(z.unit), sku: str(z.sku), status: str(z.status), item_type: str(z.item_type ?? z.product_type), category: str(z.category_name ?? z.group_name), fetched_at: now }))
        .filter((z) => z.zoho_item_id && z.name);
      for (let i = 0; i < up.length; i += 500) {
        const { error } = await db.from('zoho_items').upsert(up.slice(i, i + 500));
        if (error) throw new Error(error.message);
      }
      // Items no longer in Zoho drop off.
      await db.from('zoho_items').delete().lt('fetched_at', now);
      await db.from('zoho_items_fetch').upsert({ id: 1, at: now, total: up.length, error: null });
      return json({ total: up.length, active: up.filter((z) => z.status !== 'inactive').length });
    } catch (e) { lastErr = (e as Error).message; }
  }
  await db.from('zoho_items_fetch').upsert({ id: 1, at: new Date().toISOString(), error: lastErr });
  return json({ error: lastErr });
});
