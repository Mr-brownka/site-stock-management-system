// Reads goods received (purchase receives) from Zoho and turns them into Bohari deliveries.
// Read-only towards Zoho. Each connection imports only receives whose Zoho Project is its own site.
// Called by the app (for the signed-in person) or by a schedule with the service key ({ all: true }).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { admin, caller, cors, json, refreshAccess, zget } from '../_shared/zoho.ts';

type Conn = { user_id: string; site_id: string | null; org_id: string; api_domain: string; accounts_domain: string; refresh_token: string; api_kind: string | null; last_sync_at: string | null; imported: number };
type Rec = Record<string, unknown>;
type Parsed = { id: string; grn: string; po: string | null; date: string; vendor: string | null; project: string | null; subphase: string | null; dn: string | null; lines: { zid: string; name: string; unit: string | null; qty: number }[] };

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/''/g, '"').replace(/[\u2018\u2019\u201C\u201D]/g, '"').replace(/\s+/g, ' ').trim();
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** Custom fields arrive as a list of {label, value} (or api_name/placeholder). Find one by label. */
function custom(r: Rec, re: RegExp): string | null {
  const list = (r.custom_fields as Rec[] | undefined) ?? [];
  for (const f of list) {
    const names = [f.label, f.api_name, f.placeholder, f.field_name].map((x) => String(x ?? ''));
    if (names.some((n) => re.test(n))) return str(f.value_formatted ?? f.value);
  }
  const hash = (r.custom_field_hash as Rec | undefined) ?? {};
  for (const [k, v] of Object.entries(hash)) if (re.test(k) && !/_unformatted$/.test(k)) return str(v);
  return null;
}

function parse(r: Rec, po: Rec | null): Parsed {
  const lines = ((r.line_items as Rec[] | undefined) ?? []).map((l) => ({
    zid: String(l.item_id ?? l.line_item_id ?? ''), name: String(l.name ?? l.item_name ?? ''), unit: str(l.unit), qty: Number(l.quantity ?? l.quantity_received ?? 0),
  })).filter((l) => l.zid && l.qty > 0);
  return {
    id: String(r.receive_id ?? r.purchasereceive_id ?? r.purchase_receive_id),
    grn: String(r.receive_number ?? r.purchasereceive_number ?? ''),
    po: str(r.purchaseorder_number ?? po?.purchaseorder_number),
    date: String(r.date ?? r.receive_date ?? '').slice(0, 10),
    vendor: str(r.vendor_name ?? po?.vendor_name),
    project: custom(r, /project/i) ?? (po ? custom(po, /project/i) : null),
    subphase: custom(r, /sub.?phase/i) ?? (po ? custom(po, /sub.?phase/i) : null),
    dn: custom(r, /delivery.?note/i) ?? str(r.reference_number),
    lines,
  };
}

/** Which Zoho API answers for this organisation: Inventory's or Books'. Records what each said, to diagnose. */
const tried: string[] = [];
async function discover(api: string, token: string, org: string) {
  tried.length = 0;
  for (const [kind, path] of [['inventory', '/inventory/v1/purchasereceives'], ['books', '/books/v3/purchasereceives']] as const) {
    const r = await zget(api, token, path, { organization_id: org, per_page: '1' });
    if (r.ok && Array.isArray(r.body.purchasereceives)) return kind;
    tried.push(`${kind} ${r.status} code ${String(r.body.code ?? '-')}: ${String(r.body.message ?? '').slice(0, 120)}`);
  }
  const po = await zget(api, token, '/books/v3/purchaseorders', { organization_id: org, per_page: '1' });
  tried.push(`books POs ${po.status} code ${String(po.body.code ?? '-')}`);
  // Backup route: does a purchase order carry its receives? Note which fields mention receiving.
  const first = ((po.body.purchaseorders as Rec[] | undefined) ?? [])[0];
  if (first?.purchaseorder_id) {
    const pd = await zget(api, token, `/books/v3/purchaseorders/${first.purchaseorder_id}`, { organization_id: org });
    const p = (pd.body.purchaseorder ?? {}) as Rec;
    const keys = Object.keys(p).filter((k) => /receiv/i.test(k));
    const line = ((p.line_items as Rec[] | undefined) ?? [])[0] ?? {};
    tried.push(`PO fields: ${keys.join(',') || 'none'}; line fields: ${Object.keys(line).filter((k) => /receiv|quantity/i.test(k)).join(',')}`);
  }
  return null;
}
const base = (kind: string) => (kind === 'books' ? '/books/v3' : '/inventory/v1');

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^0+/, '');
/** A delivery already typed in Bohari for the same receive: same delivery note number (digits only),
 *  or same day, same vendor and the same items and quantities. Only unlinked, hand-typed ones. */
async function findTwin(db: SupabaseClient, siteId: string, p: Parsed, map: Map<string, number>): Promise<string | null> {
  if (!p.date) return null;
  const from = new Date(new Date(p.date).getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const to = new Date(new Date(p.date).getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const { data } = await db.from('documents').select('id, doc_date, ref_no, party, movements(item_id, qty)')
    .eq('site_id', siteId).eq('kind', 'delivery').is('zoho_receive_id', null).gte('doc_date', from).lte('doc_date', to);
  const dn = digits(p.dn), grn = digits(p.grn);
  const want = p.lines.map((l) => `${map.get(l.zid)}:${l.qty}`).sort().join('|');
  for (const d of (data ?? []) as { id: string; doc_date: string; ref_no: string | null; party: string | null; movements: { item_id: number; qty: number }[] }[]) {
    const ref = digits(d.ref_no);
    if (ref && (ref === dn || ref === grn)) return d.id;
    const items = (d.movements ?? []).map((m) => `${m.item_id}:${Number(m.qty)}`).sort().join('|');
    if (d.doc_date === p.date && norm(d.party) === norm(p.vendor) && items === want) return d.id;
  }
  return null;
}

async function place(db: SupabaseClient, c: Conn, p: Parsed, siteId: string): Promise<'imported' | 'pending' | 'skip' | 'linked'> {
  const { data: dup } = await db.from('documents').select('id').eq('zoho_receive_id', p.id).maybeSingle();
  if (dup) return 'skip';
  // Items: Zoho's item id first; otherwise the same name already in Bohari; otherwise wait for the admin.
  const ids = [...new Set(p.lines.map((l) => l.zid))];
  const { data: maps } = await db.from('zoho_item_map').select('zoho_item_id, item_id').in('zoho_item_id', ids);
  const map = new Map((maps ?? []).filter((m) => m.item_id).map((m) => [m.zoho_item_id, m.item_id as number]));
  const missing = p.lines.filter((l) => !map.has(l.zid));
  if (missing.length) {
    const { data: items } = await db.from('items').select('id, name');
    const byName = new Map((items ?? []).map((i) => [norm(i.name), i.id as number]));
    for (const l of missing) {
      const hit = byName.get(norm(l.name));
      if (hit) { map.set(l.zid, hit); await db.from('zoho_item_map').upsert({ zoho_item_id: l.zid, item_id: hit, zoho_name: l.name, zoho_unit: l.unit }); }
      else await db.from('zoho_item_map').upsert({ zoho_item_id: l.zid, item_id: null, zoho_name: l.name, zoho_unit: l.unit }, { onConflict: 'zoho_item_id', ignoreDuplicates: true });
    }
  }
  // Never count a delivery twice: if the store already typed this one into Bohari, link it to Zoho instead.
  const twin = await findTwin(db, siteId, p, map);
  if (twin) {
    await db.from('documents').update({ zoho_receive_id: p.id, zoho_grn: p.grn, zoho_po: p.po }).eq('id', twin);
    await db.from('zoho_pending').delete().eq('zoho_receive_id', p.id);
    return 'linked';
  }
  // A second Zoho receive with the same delivery note number as one already in Bohari: let the admin decide.
  if (digits(p.dn)) {
    const { data: same } = await db.from('documents').select('id, ref_no').eq('site_id', siteId).eq('kind', 'delivery').not('zoho_receive_id', 'is', null);
    if ((same ?? []).some((d) => digits(d.ref_no) === digits(p.dn))) {
      await db.from('zoho_pending').upsert({ zoho_receive_id: p.id, site_id: null, project: p.project, grn: p.grn, receive_date: p.date || null, vendor: p.vendor,
        reason: `Same delivery note (${p.dn}) as a delivery already in Bohari. Check it isn't the same goods twice.`, payload: p });
      return 'pending';
    }
  }
  const unmatched = p.lines.filter((l) => !map.has(l.zid));
  if (unmatched.length || !p.lines.length) {
    await db.from('zoho_pending').upsert({ zoho_receive_id: p.id, site_id: siteId, project: p.project, grn: p.grn, receive_date: p.date || null, vendor: p.vendor,
      reason: p.lines.length ? `Items to match: ${unmatched.map((l) => l.name).join(', ')}` : 'No items on the receive', payload: p });
    return 'pending';
  }
  const toConfirm = [!p.subphase && 'subphase', !p.vendor && 'party'].filter(Boolean);
  const { data: doc, error } = await db.from('documents').insert({
    site_id: siteId, kind: 'delivery', doc_date: p.date, ref_no: p.dn ?? p.grn, party: p.vendor, created_by: c.user_id,
    source: 'zoho', zoho_receive_id: p.id, zoho_grn: p.grn, zoho_po: p.po, to_confirm: toConfirm,
  }).select('id').single();
  if (error) { if (/duplicate/i.test(error.message)) return 'skip'; throw new Error(error.message); }
  const { error: e2 } = await db.from('movements').insert(p.lines.map((l) => ({ document_id: doc.id, item_id: map.get(l.zid), qty: l.qty, subphase: p.subphase })));
  if (e2) { await db.from('documents').delete().eq('id', doc.id); throw new Error(e2.message); }
  await db.from('zoho_pending').delete().eq('zoho_receive_id', p.id);
  return 'imported';
}

async function syncOne(db: SupabaseClient, c: Conn) {
  const out = { imported: 0, pending: 0, linked: 0, seen: 0, more: false, kind: c.api_kind as string | null, projects: [] as string[] };
  const projects = new Set<string>();
  if (!c.site_id) throw new Error('Your Bohari account has no site yet.');
  const { data: site } = await db.from('sites').select('name, zoho_project').eq('id', c.site_id).single();
  const mine = norm(site?.zoho_project || site?.name);
  // Receives waiting for item matches are retried first; the admin may have matched them since.
  const { data: waiting } = await db.from('zoho_pending').select('payload').eq('site_id', c.site_id);
  for (const w of waiting ?? []) { const r = await place(db, c, w.payload as Parsed, c.site_id); if (r === 'imported') out.imported++; }

  const token = await refreshAccess(c.refresh_token, c.accounts_domain);
  if (!out.kind) {
    out.kind = await discover(c.api_domain, token, c.org_id);
    if (!out.kind) throw new Error(`Zoho did not allow reading purchase receives. ${tried.join(' | ')}`);
    await db.from('zoho_connections').update({ api_kind: out.kind }).eq('user_id', c.user_id);
  }
  // First time: the last 14 days. After that, from 3 days before the last check (late edits in Zoho).
  // (Failed checks also stamp last_sync_at, so until something has come in, keep looking back 14 days.)
  const since = new Date(c.last_sync_at && c.imported > 0 ? new Date(c.last_sync_at).getTime() - 3 * 864e5 : Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const poCache = new Map<string, Rec | null>();
  // Keep each run short (server time limit): at most 40 receives looked up; the next check carries on.
  let lookups = 0;
  pages: for (let page = 1; page <= 10; page++) {
    const r = await zget(c.api_domain, token, `${base(out.kind)}/purchasereceives`, { organization_id: c.org_id, page: String(page), per_page: '100' });
    if (!r.ok) throw new Error(`Zoho answered ${r.status}: ${String(r.body.message ?? '')}`);
    const list = (r.body.purchasereceives as Rec[]) ?? [];
    let fresh = 0; // rows on this page within the window (Zoho's own order isn't guaranteed)
    for (const row of list) {
      const date = String(row.date ?? '').slice(0, 10);
      if (date && date < since) continue;
      fresh++;
      const id = String(row.receive_id ?? row.purchasereceive_id ?? '');
      if (!id) continue;
      out.seen++;
      // Already brought in, already waiting for the admin, or known to be another site's: no need to ask Zoho again.
      const [{ data: done }, { data: seen }, { data: waits }] = await Promise.all([
        db.from('documents').select('id').eq('zoho_receive_id', id).maybeSingle(),
        db.from('zoho_seen').select('project').eq('zoho_receive_id', id).maybeSingle(),
        db.from('zoho_pending').select('zoho_receive_id').eq('zoho_receive_id', id).maybeSingle(),
      ]);
      if (done || waits) continue;
      if (seen && norm(seen.project) !== mine) { if (seen.project) projects.add(seen.project); continue; }
      if (++lookups > 40) { out.more = true; break pages; }
      const d = await zget(c.api_domain, token, `${base(out.kind)}/purchasereceives/${id}`, { organization_id: c.org_id });
      const rec = (d.body.purchasereceive ?? d.body.purchase_receive ?? row) as Rec;
      const poId = str(rec.purchaseorder_id ?? row.purchaseorder_id);
      let po: Rec | null = null;
      if (poId) {
        if (!poCache.has(poId)) {
          const pr = await zget(c.api_domain, token, `${base(out.kind)}/purchaseorders/${poId}`, { organization_id: c.org_id });
          poCache.set(poId, (pr.body.purchaseorder as Rec) ?? null);
        }
        po = poCache.get(poId) ?? null;
      }
      const p = parse({ ...row, ...rec }, po);
      if (p.project) projects.add(p.project);
      if (!p.project) {
        // No Project filled in Zoho: the admin decides which site it belongs to.
        await db.from('zoho_pending').upsert({ zoho_receive_id: p.id, site_id: null, project: null, grn: p.grn, receive_date: p.date || null, vendor: p.vendor, reason: 'No Project in Zoho', payload: p }, { onConflict: 'zoho_receive_id', ignoreDuplicates: true });
        continue;
      }
      if (norm(p.project) !== mine) { await db.from('zoho_seen').upsert({ zoho_receive_id: p.id, project: p.project }); continue; } // another site's: not ours
      const res = await place(db, c, p, c.site_id);
      if (res === 'imported') out.imported++; else if (res === 'pending') out.pending++; else if (res === 'linked') out.linked++;
    }
    if (!fresh || !(r.body.page_context as Rec | undefined)?.has_more_page) break;
  }
  out.projects = [...projects];
  await db.from('zoho_connections').update({ last_sync_at: new Date().toISOString(), last_error: null, imported: c.imported + out.imported }).eq('user_id', c.user_id);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  let body: Rec = {};
  try { body = await req.json(); } catch { /* no body */ }
  const key = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const all = body.all === true && key === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let conns: Conn[] = [];
  if (all) {
    const { data } = await db.from('zoho_connections').select('*');
    conns = (data ?? []) as Conn[];
  } else {
    const user = await caller(req, db);
    if (!user) return json({ error: 'Sign in to Bohari first.' }, 401);
    const { data } = await db.from('zoho_connections').select('*').eq('user_id', user.id).maybeSingle();
    if (!data) return json({ connected: false });
    conns = [data as Conn];
  }
  const results = [];
  for (const c of conns) {
    try { results.push({ user: c.user_id, ...(await syncOne(db, c)) }); }
    catch (e) {
      const msg = (e as Error).message;
      await db.from('zoho_connections').update({ last_error: msg, last_sync_at: new Date().toISOString() }).eq('user_id', c.user_id);
      results.push({ user: c.user_id, error: msg });
    }
  }
  return json(all ? { results } : { connected: true, ...results[0] });
});
