// Incoming deliveries for the dashboard: read-only from Zoho, for the caller's site.
//  · This week / next week: purchase orders whose expected delivery date falls in that week and that are not fully received.
//    Late ones (due in the last 4 weeks, still not delivered) stay on this week's list until they arrive or are removed.
//  · Pending deliveries: orders not delivered in the week they were due (late), and purchase-order lines with part received and part still owed. Each order shows for 2 weeks from the
//    day its first part came in (this week and the next), then drops off. Orders the store marked "Not coming" are left out.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { admin, caller, cors, json, refreshAccess, zget } from '../_shared/zoho.ts';

type Rec = Record<string, unknown>;
const dayOf = (v: unknown) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? '')); return m ? m[1] : ''; };
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const str = (v: unknown) => (v == null || v === '' ? null : String(v));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

function custom(r: Rec, re: RegExp): string | null {
  for (const f of (r.custom_fields as Rec[] | undefined) ?? []) {
    const names = [f.label, f.api_name, f.placeholder, f.field_name].map((x) => String(x ?? ''));
    if (names.some((n) => re.test(n))) return str(f.value_formatted ?? f.value);
  }
  for (const [k, v] of Object.entries((r.custom_field_hash as Rec | undefined) ?? {})) if (re.test(k) && !/_unformatted$/.test(k)) return str(v);
  return null;
}

type Line = { name: string; unit: string | null; ordered: number; received: number };
type Order = { late?: boolean; id: string; po: string; vendor: string | null; subphase?: string | null; date: string; expected: string | null; status: string; lines: Line[]; lastIn?: string | null; firstIn?: string | null; grns?: { id?: string; grn: string; date: string; lines: string }[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db: SupabaseClient = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const { data: prof } = await db.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
  const siteId = prof?.site_id as string | undefined;
  if (!siteId) return json({ connected: false });
  const { data: site } = await db.from('sites').select('name, zoho_project').eq('id', siteId).single();
  const mine = norm(site?.zoho_project || site?.name);
  // Any Zoho connection for this site will do (the store keeper's, or the admin's).
  const { data: conns } = await db.from('zoho_connections').select('*').eq('site_id', siteId).order('last_sync_at', { ascending: false });
  const c = (conns ?? [])[0] as Rec | undefined;
  if (!c) return json({ connected: false });

  // One shared answer per site: fresh for 20 minutes for everyone; Refresh asks again at most every 3 minutes.
  // Zoho allows 10,000 calls a day for the whole organisation, and one full check costs well over a hundred.
  const body = await req.json().catch(() => ({})) as Rec;
  const { data: cached } = await db.from('zoho_incoming_cache').select('body, checked_at').eq('site_id', siteId).maybeSingle();
  const age = cached ? Date.now() - new Date(String(cached.checked_at)).getTime() : Infinity;
  if (cached && (age < 20 * 60_000) && !(body.force === true && age > 3 * 60_000)) return json(cached.body);
  // Zoho is checked 07:00–19:00 Nairobi time only; outside those hours the last check stands.
  const hour = new Date(Date.now() + 3 * 3600_000).getUTCHours();
  if (hour < 7 || hour >= 19) return json(cached ? { ...(cached.body as Rec), offHours: true } : { connected: true, error: 'Zoho is checked from 7:00 to 19:00. The first check is at 7:00.' });

  try {
    const token = await refreshAccess(String(c.refresh_token), String(c.accounts_domain));
    const api = String(c.api_domain), org = String(c.org_id);
    const base = c.api_kind === 'inventory' ? '/inventory/v1' : '/books/v3';
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10); // Nairobi
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const wk = addDays(today, -dow), wkEnd = addDays(wk, 6), nxt = addDays(wk, 7), nxtEnd = addDays(wk, 13);
    const since = addDays(today, -28);
    const debug: string[] = [];
    let calls = 0;
    const LIMIT = 'Zoho’s daily limit is used up · showing the last check';
    // Shared with every site and every check: lists and orders for 20 minutes, receives for good (they never change).
    const fresh = new Date(Date.now() - 20 * 60_000).toISOString();
    const cacheGet = async (keys: string[], maxAge: boolean) => {
      const out = new Map<string, Rec>();
      for (let k = 0; k < keys.length; k += 200) {
        let q = db.from('zoho_cache').select('key, body').in('key', keys.slice(k, k + 200));
        if (maxAge) q = q.gte('at', fresh);
        const { data } = await q;
        (data ?? []).forEach((x) => out.set(String(x.key), x.body as Rec));
      }
      return out;
    };
    const cachePut = (rows: { key: string; body: unknown }[]) => rows.length ? db.from('zoho_cache').upsert(rows.map((x) => ({ ...x, at: new Date().toISOString() }))) : Promise.resolve();
    const zcall = async (path: string, params: Record<string, string>) => {
      calls++;
      const r = await zget(api, token, path, { organization_id: org, ...params });
      if (r.status === 429) throw new Error(LIMIT);
      return r;
    };
    const listAll = async (what: 'purchaseorders' | 'purchasereceives') => {
      const k = `${what}:${org}`;
      const hit = (await cacheGet([k], true)).get(k);
      if (hit) return (hit.rows as Rec[]) ?? [];
      const rows: Rec[] = [];
      for (let page = 1; page <= 10; page++) {
        const r = await zcall(`${base}/${what}`, { page: String(page), per_page: '200' });
        if (!r.ok) { if (what === 'purchaseorders') throw new Error(`Zoho answered ${r.status}: ${String(r.body.message ?? '')}`); break; }
        rows.push(...((r.body[what] as Rec[]) ?? []));
        if (!(r.body.page_context as Rec | undefined)?.has_more_page) break;
      }
      await cachePut([{ key: k, body: { rows } }]);
      return rows;
    };

    // 1. Purchase orders: every page (Zoho's order is not dependable), kept if open-ish and due in the two weeks.
    const poRows = await listAll('purchaseorders');
    const closed = (s: unknown) => /cancel|closed|draft|^received$|fully/i.test(String(s ?? ''));
    // Late orders carry over: due in the last 4 weeks and still not delivered stay on this week's list (marked late)
    // until they come in, are closed in Zoho, or the store removes them.
    const lateFrom = addDays(wk, -28);
    const dueRows = poRows.filter((p) => { const e = dayOf(p.delivery_date ?? p.expected_delivery_date); return e && e >= lateFrom && e <= nxtEnd && !closed(p.status) && !/^received$/i.test(String(p.received_status ?? '')); });
    debug.push(`POs listed ${poRows.length}, due in the two weeks ${dueRows.length}`);

    const poCache = new Map<string, Rec | null>();
    const getPo = async (id: string) => {
      if (!poCache.has(id)) {
        const k = `po:${id}`;
        const hit = (await cacheGet([k], true)).get(k);
        if (hit) poCache.set(id, hit);
        else {
          const r = await zcall(`${base}/purchaseorders/${id}`, {});
          const po = (r.body.purchaseorder as Rec) ?? null;
          poCache.set(id, po);
          if (po) await cachePut([{ key: k, body: po }]);
        }
      }
      return poCache.get(id) ?? null;
    };

    // 2. Goods received in the last 4 weeks (all pages; filtered by date here).
    const recRows = await listAll('purchasereceives');
    const recent = recRows.filter((r) => { const d = dayOf(r.date ?? r.receive_date); return d && d >= since && d <= today; });
    // What each recent receive brought in, per PO line (used when the PO itself doesn't say what was received).
    const gotByPo = new Map<string, { grns: { id?: string; grn: string; date: string; lines: string }[]; byItem: Map<string, number>; byName: Map<string, number> }>();
    // Receives already known to belong to another site (from the delivery check) are skipped.
    const { data: seen } = await db.from('zoho_seen').select('zoho_receive_id, project');
    const elsewhere = new Set((seen ?? []).filter((x) => x.project && x.project !== 'before start date' && norm(x.project) !== mine).map((x) => String(x.zoho_receive_id)));
    let looked = 0;
    const recIds = recent.map((row) => String(row.receive_id ?? row.purchasereceive_id ?? '')).filter((id) => id && !elsewhere.has(id));
    const recHit = await cacheGet(recIds.map((id) => `rec:${id}`), false);
    for (const row of recent) {
      const id = String(row.receive_id ?? row.purchasereceive_id ?? '');
      if (!id || elsewhere.has(id)) continue;
      const rp = custom(row, /project/i);
      if (rp && norm(rp) !== mine) continue;
      let rec = recHit.get(`rec:${id}`);
      if (!rec) {
        if (++looked > 80) break;
        const d = await zcall(`${base}/purchasereceives/${id}`, {});
        rec = (d.body.purchasereceive as Rec | undefined) ?? undefined;
        if (rec) await cachePut([{ key: `rec:${id}`, body: rec }]);
        else rec = row;
      }
      const poId = str(rec.purchaseorder_id ?? row.purchaseorder_id);
      if (!poId) continue;
      const lines = ((rec.line_items as Rec[] | undefined) ?? []).map((l) => ({ id: String(l.item_id ?? ''), name: String(l.name ?? l.item_name ?? ''), q: num(l.quantity ?? l.quantity_received) }));
      const g = gotByPo.get(poId) ?? { grns: [] as { id?: string; grn: string; date: string; lines: string }[], byItem: new Map<string, number>(), byName: new Map<string, number>() };
      g.grns.push({ id, grn: String(rec.receive_number ?? rec.purchasereceive_number ?? ''), date: dayOf(rec.date ?? row.date), lines: lines.map((l) => `${l.name} ×${l.q}`).join(' · ') });
      lines.forEach((l) => { if (l.id) g.byItem.set(l.id, (g.byItem.get(l.id) ?? 0) + l.q); const n = norm(l.name); g.byName.set(n, (g.byName.get(n) ?? 0) + l.q); });
      gotByPo.set(poId, g);
    }
    debug.push(`receives in 4 weeks ${recent.length}, POs touched ${gotByPo.size}`);

    // 3. What the store already has in the system against each PO (every Zoho receive synced here, any date).
    const { data: inSys } = await db.from('documents').select('zoho_po, movements(qty, items(name))').eq('site_id', siteId).eq('kind', 'delivery').not('zoho_po', 'is', null);
    const sysByPo = new Map<string, Map<string, number>>();
    for (const d of (inSys ?? []) as Rec[]) {
      const m = sysByPo.get(String(d.zoho_po)) ?? new Map<string, number>();
      for (const mv of (d.movements as Rec[] | undefined) ?? []) { const n = norm((mv.items as Rec | undefined)?.name); m.set(n, (m.get(n) ?? 0) + num(mv.qty)); }
      sysByPo.set(String(d.zoho_po), m);
    }

    const toOrder = (p: Rec): Order => {
      const got = gotByPo.get(String(p.purchaseorder_id));
      const sys = sysByPo.get(String(p.purchaseorder_number ?? ''));
      const lines: Line[] = ((p.line_items as Rec[] | undefined) ?? []).map((l) => {
        const ordered = num(l.quantity);
        // The PO's own received count when Zoho gives it; otherwise what the recent receives brought.
        const own = l.quantity_received ?? l.received_quantity ?? l.quantity_billed_received;
        // Fully received means gone, so take the highest count any source gives: Zoho's own, the receives, or the system.
        const nm = norm(l.name ?? l.item_name);
        const received = Math.max(own != null ? num(own) : 0, got?.byItem.get(String(l.item_id ?? '')) ?? 0, got?.byName.get(nm) ?? 0, sys?.get(nm) ?? 0);
        return { name: String(l.name ?? l.item_name ?? 'Item'), unit: str(l.unit), ordered, received: Math.min(received, ordered) };
      });
      const grns = (got?.grns ?? []).sort((a, b) => b.date.localeCompare(a.date));
      return { id: String(p.purchaseorder_id), po: String(p.purchaseorder_number ?? ''), vendor: str(p.vendor_name), subphase: custom(p, /sub.?phase/i), date: dayOf(p.date), expected: dayOf(p.delivery_date ?? p.expected_delivery_date) || null,
        status: String(p.received_status ?? p.order_status ?? p.status ?? ''), lines, lastIn: grns[0]?.date ?? null, firstIn: grns[grns.length - 1]?.date ?? null, grns };
    };
    const ours = (p: Rec | null) => !!p && norm(custom(p, /project/i)) === mine;

    const thisWeek: Order[] = [], nextWeek: Order[] = [], part: Order[] = [];
    const { data: gone } = await db.from('incoming_dismissed').select('po_id').eq('site_id', siteId);
    const dismissed = new Set((gone ?? []).map((x) => String(x.po_id)));
    for (const row of dueRows) {
      if (dismissed.has(String(row.purchaseorder_id))) continue;
      const rp = custom(row, /project/i); // when the list already says the project, other sites' orders are never opened
      if (rp && norm(rp) !== mine) continue;
      const p = await getPo(String(row.purchaseorder_id));
      if (!ours(p)) continue;
      const o = toOrder(p!);
      o.lines = o.lines.filter((l) => l.received < l.ordered);
      if (!o.lines.length) continue;
      // Not delivered in the week it was due: it moves to Pending deliveries, marked late.
      if (o.expected! < wk) { o.late = true; part.push(o); }
      else (o.expected! <= wkEnd ? thisWeek : nextWeek).push(o);
    }
    const inPending = new Set(part.map((o) => o.id));
    // Part deliveries stay 2 weeks from the first part in; "Not coming" ones are left out.
    const keepFrom = addDays(today, -13);
    for (const poId of gotByPo.keys()) {
      if (dismissed.has(poId) || inPending.has(poId)) continue;
      const first = gotByPo.get(poId)!.grns.reduce((m, g) => (g.date && g.date < m ? g.date : m), '9999');
      if (first < keepFrom) continue;
      const p = await getPo(poId);
      if (!ours(p)) continue;
      // Zoho's own received count above what came in the last 4 weeks: the first part came earlier, so it's past 2 weeks.
      const inWindow = [...gotByPo.get(poId)!.byItem.values()].reduce((a, b) => a + b, 0);
      const ownTotal = ((p!.line_items as Rec[] | undefined) ?? []).reduce((a, l) => a + num(l.quantity_received ?? l.received_quantity ?? 0), 0);
      if (ownTotal > inWindow + 0.001) continue;
      const o = toOrder(p!);
      o.lines = o.lines.filter((l) => l.received > 0 && l.received < l.ordered); // part came, part still owed
      if (o.lines.length) part.push(o);
    }
    const byDate = (a: Order, b: Order) => String(a.expected).localeCompare(String(b.expected));
    thisWeek.sort(byDate); nextWeek.sort(byDate); part.sort((a, b) => String(a.expected ?? a.firstIn).localeCompare(String(b.expected ?? b.firstIn)));
    console.log(JSON.stringify({ site: siteId, calls, debug, thisWeek: thisWeek.length, nextWeek: nextWeek.length, part: part.length }));
    const web = `${api.replace(/^https:\/\/(www\.)?zohoapis/, c.api_kind === 'inventory' ? 'https://inventory.zoho' : 'https://books.zoho')}/app/${org}`;
    const out = { connected: true, web, checked_at: new Date().toISOString(), today, week: { from: wk, to: wkEnd }, next: { from: nxt, to: nxtEnd }, thisWeek, nextWeek, part };
    await db.from('zoho_incoming_cache').upsert({ site_id: siteId, body: out, checked_at: out.checked_at });
    return json(out);
  } catch (e) {
    // Zoho busy or out of calls: the last good answer, with the reason.
    const msg = /429|limit/i.test((e as Error).message) ? 'Zoho’s daily limit is used up · showing the last check' : (e as Error).message;
    return json(cached ? { ...(cached.body as Rec), error: msg } : { connected: true, error: msg });
  }
});
