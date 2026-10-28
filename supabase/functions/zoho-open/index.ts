// "Open in Zoho Books": finds the exact record (a purchase order or a goods receive) and returns its page in Zoho,
// so the button lands on that record instead of a list. Read-only.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { admin, caller, cors, json, refreshAccess, zget } from '../_shared/zoho.ts';

type Rec = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db: SupabaseClient = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const b = await req.json().catch(() => ({})) as { po?: string; po_id?: string; receive_id?: string; grn?: string; site_id?: string };
  const { data: prof } = await db.from('profiles').select('site_id, role').eq('id', user.id).maybeSingle();
  // Admins may open records of any site; everyone else uses their own site's connection.
  const siteId = (prof?.role === 'admin' && b.site_id) ? b.site_id : prof?.site_id;
  let q = db.from('zoho_connections').select('*').order('last_sync_at', { ascending: false });
  if (siteId) q = q.eq('site_id', siteId);
  const { data: conns } = await q;
  const c = (conns ?? [])[0] as Rec | undefined;
  if (!c) return json({ error: 'Zoho is not connected.' });
  const api = String(c.api_domain), org = String(c.org_id);
  const inv = c.api_kind === 'inventory';
  const base = inv ? '/inventory/v1' : '/books/v3';
  const web = `${api.replace(/^https:\/\/(www\.)?zohoapis/, inv ? 'https://inventory.zoho' : 'https://books.zoho')}/app/${org}`;
  const list = `${web}#/purchaseorders`;
  try {
    if (b.receive_id) return json({ url: `${web}#/purchasereceives/${b.receive_id}` });
    if (b.po_id) return json({ url: `${web}#/purchaseorders/${b.po_id}` });
    const token = await refreshAccess(String(c.refresh_token), String(c.accounts_domain));
    if (b.po) {
      const r = await zget(api, token, `${base}/purchaseorders`, { organization_id: org, purchaseorder_number: b.po });
      const hit = ((r.body.purchaseorders as Rec[] | undefined) ?? []).find((p) => String(p.purchaseorder_number) === b.po);
      if (hit) return json({ url: `${web}#/purchaseorders/${hit.purchaseorder_id}` });
    }
    if (b.grn) {
      const r = await zget(api, token, `${base}/purchasereceives`, { organization_id: org, search_text: b.grn });
      const hit = ((r.body.purchasereceives as Rec[] | undefined) ?? []).find((p) => String(p.receive_number ?? p.purchasereceive_number) === b.grn);
      if (hit) return json({ url: `${web}#/purchasereceives/${hit.receive_id ?? hit.purchasereceive_id}` });
    }
    return json({ url: list, note: 'Not found in Zoho; opened the list.' });
  } catch (e) {
    return json({ url: list, error: (e as Error).message });
  }
});
