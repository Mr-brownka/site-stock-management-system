import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminApi, Backend, Balance, CorrectionRequest, Doc, DocInput, Draft, Field, Item, Line, LineInput, Profile, SiteDoc, SiteInfo, StockTake, Submission, User, ZohoConnection, ZohoItemMatch, ZohoLogRow, ZohoRun, Incoming, IncomingDismissed, ZohoPending, ZohoStatus, ZohoSyncResult } from './types';

const PAGE = 1000;

/** Supabase returns at most 1,000 rows per request, so page through. */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function fail(error: unknown): never {
  const msg = (error as { message?: string })?.message ?? String(error);
  throw new Error(msg);
}

const FIELD: Record<Field, { col: string; kinds: string[] | null }> = {
  supplier: { col: 'party', kinds: ['delivery'] },
  issued_to: { col: 'party', kinds: ['issue'] },
  site: { col: 'party', kinds: ['transfer_in', 'transfer_out'] },
  activity: { col: 'activity', kinds: ['issue'] },
  supervisor: { col: 'supervisor', kinds: ['issue'] },
  authorised_by: { col: 'authorised_by', kinds: ['transfer_in', 'transfer_out'] },
};

const num = (v: unknown) => Number(v ?? 0);

function toCorrection(r: Record<string, unknown>): CorrectionRequest {
  return { ...(r as unknown as CorrectionRequest), item_id: num(r.item_id), from_qty: num(r.from_qty), to_qty: num(r.to_qty), movement_id: r.movement_id == null ? null : num(r.movement_id) };
}

function toBalance(r: Record<string, unknown>): Balance {
  return {
    site_id: r.site_id as string, item_id: num(r.item_id), name: String(r.name), unit: String(r.unit), reorder_level: r.reorder_level == null ? null : num(r.reorder_level),
    first_seen: String(r.first_seen), balance: num(r.balance), deliveries: num(r.deliveries),
  };
}

function adminApi(sb: SupabaseClient): AdminApi {
  return {
    async profiles() {
      const { data, error } = await sb.from('profiles').select('id, full_name, email, phone, role, status, site_id, created_at, decided_at, training_days, training_waived, access, pages, head_office').order('created_at', { ascending: false });
      if (error) fail(error);
      return (data ?? []) as Profile[];
    },
    async createPerson(p) {
      const { data, error } = await sb.functions.invoke('admin-users', { body: { action: 'create', ...p } });
      if (error) throw new Error(error.message);
      if ((data as { error?: string }).error) throw new Error((data as { error: string }).error);
    },
    async issuedPasswords() {
      const { data, error } = await sb.from('issued_passwords').select('user_id, password, set_at');
      if (error) return {};
      return Object.fromEntries((data ?? []).map((r) => [String(r.user_id), { password: String(r.password), set_at: String(r.set_at) }]));
    },
    async setPersonPassword(userId, password) {
      const { data, error } = await sb.functions.invoke('admin-users', { body: { action: 'password', user_id: userId, password } });
      if (error) throw new Error(error.message);
      if ((data as { error?: string }).error) throw new Error((data as { error: string }).error);
    },
    async setProfile(id, patch) {
      const { error } = await sb.from('profiles').update({ ...patch, ...(patch.status ? { decided_at: new Date().toISOString() } : {}) }).eq('id', id);
      if (error) fail(error);
    },
    async sites() {
      const { data, error } = await sb.from('sites').select('id, name, created_at, week_anchor_no, week_anchor_date, basements, has_ground, floors, roof_name, companies(name)').order('created_at');
      if (error) fail(error);
      return (data ?? []).map((r: Record<string, unknown>) => {
        const c = r.companies as { name?: string } | { name?: string }[] | null;
        return { id: String(r.id), name: String(r.name), company: (Array.isArray(c) ? c[0]?.name : c?.name) ?? '', week_anchor_no: (r.week_anchor_no as number) ?? null, week_anchor_date: (r.week_anchor_date as string) ?? null,
          basements: (r.basements as number) ?? 0, has_ground: (r.has_ground as boolean) ?? true, floors: (r.floors as number) ?? null, roof_name: (r.roof_name as string) ?? null };
      });
    },
    async addSite(name, structure) {
      const { data: one } = await sb.from('sites').select('company_id').limit(1).single();
      const { error } = await sb.from('sites').insert({ name, company_id: one?.company_id, ...(structure ?? {}) });
      if (error) fail(error);
    },
    async alertContacts() {
      const { data, error } = await sb.from('sites').select('id, alert_name, alert_phone');
      if (error) return {};
      return Object.fromEntries((data ?? []).map((r) => [r.id, { name: r.alert_name, phone: r.alert_phone }]));
    },
    async zohoProjects() {
      const { data, error } = await sb.from('sites').select('id, zoho_project');
      if (error) return {};
      return Object.fromEntries((data ?? []).map((r) => [r.id, r.zoho_project]));
    },
    async setZohoProject(siteId, project) {
      const { error } = await sb.from('sites').update({ zoho_project: project.trim() || null }).eq('id', siteId);
      if (error) fail(error);
    },
    async zohoConnections() {
      const { data, error } = await sb.rpc('zoho_overview');
      if (error) return [];
      return (data ?? []) as ZohoConnection[];
    },
    async zohoPending() {
      const { data, error } = await sb.from('zoho_pending').select('zoho_receive_id, site_id, project, grn, receive_date, vendor, reason').order('receive_date', { ascending: false });
      if (error) return [];
      return (data ?? []) as ZohoPending[];
    },
    async assignPending(receiveId, siteId) {
      const { error } = await sb.from('zoho_pending').update({ site_id: siteId, reason: 'Placed by the admin' }).eq('zoho_receive_id', receiveId);
      if (error) fail(error);
    },
    async zohoItems() {
      const { data, error } = await sb.from('zoho_item_map').select('zoho_item_id, item_id, zoho_name, zoho_unit').order('created_at', { ascending: false });
      if (error) return [];
      return (data ?? []) as ZohoItemMatch[];
    },
    async zohoLog() {
      // zoho_log arrives with migration 0016; until it has run the log is simply empty.
      const { data, error } = await sb.from('zoho_log').select('zoho_receive_id, site_id, project, grn, po, vendor, receive_date, status, detail, lines, updated_at')
        .order('receive_date', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false }).limit(500);
      if (error) return [];
      return (data ?? []) as ZohoLogRow[];
    },
    async zohoRuns() {
      const { data, error } = await sb.from('zoho_runs').select('site_id, at, listed, recent, imported, waiting, linked, other_site, note').order('at', { ascending: false }).limit(60);
      if (error) return [];
      return (data ?? []) as ZohoRun[];
    },
    async matchZohoItem(zohoItemId, itemId) {
      const { error } = await sb.from('zoho_item_map').update({ item_id: itemId }).eq('zoho_item_id', zohoItemId);
      if (error) fail(error);
    },
    async setAlertContact(siteId, c) {
      const { error } = await sb.from('sites').update({ alert_name: c.name, alert_phone: c.phone }).eq('id', siteId);
      if (error) fail(/column/.test(error.message) ? { ...error, message: 'The database update for WhatsApp contacts has not been run yet.' } : error);
    },
    async setStructure(id, structure) {
      const { error } = await sb.from('sites').update(structure).eq('id', id);
      if (error) fail(error);
    },
    async renameSite(id, name) {
      const { error } = await sb.from('sites').update({ name }).eq('id', id);
      if (error) fail(error);
    },
    async corrections() {
      const { data, error } = await sb.from('correction_requests').select('*').order('created_at', { ascending: false }).limit(300);
      if (error) fail(error);
      return (data ?? []).map(toCorrection);
    },
    async decide(id, approve, note) {
      const { error } = await sb.rpc('decide_correction', { request_id: id, approve, decision: note ?? null });
      if (error) fail(error);
    },
    async balances() {
      const rows = await fetchAll<Record<string, unknown>>((a, b) => sb.from('stock_balances').select('*').order('name').range(a, b));
      return rows.map(toBalance);
    },
    async submissions(day) {
      const { data, error } = await sb.from('day_submissions').select('site_id, day, submitted_at').eq('day', day);
      if (error) fail(error);
      return data ?? [];
    },
    async documents(from, to) {
      const rows = await fetchAll<Record<string, unknown>>((a, b) =>
        sb.from('documents').select('*, movements(*)').gte('doc_date', from).lte('doc_date', to).order('created_at', { ascending: false }).range(a, b));
      return rows.map((r) => ({ ...(r as unknown as SiteDoc), lines: ((r.movements as Record<string, unknown>[]) ?? []).map(toLine) }));
    },
    async updateItem(id, name, unit) {
      const { error } = await sb.from('items').update({ name, unit }).eq('id', id);
      if (error) fail(error);
    },
    async mergeItems(keepId, dropId) {
      const { error } = await sb.rpc('merge_items', { keep_id: keepId, drop_id: dropId });
      if (error) fail(error);
    },
    async setReorder(siteId, itemId, level) {
      const { error } = await sb.from('site_items').update({ reorder_level: level }).eq('site_id', siteId).eq('item_id', itemId);
      if (error) fail(error);
    },
    async checklist(siteId) {
      const rows = await fetchAll<Record<string, unknown>>((a, b) => sb.from('site_checklist').select('item_id').eq('site_id', siteId).order('position').range(a, b));
      return rows.map((r) => num(r.item_id));
    },
    async setChecklist(siteId, itemIds) {
      const { error } = await sb.from('site_checklist').delete().eq('site_id', siteId);
      if (error) fail(error);
      if (!itemIds.length) return;
      const { error: e2 } = await sb.from('site_checklist').insert(itemIds.map((item_id, position) => ({ site_id: siteId, item_id, position })));
      if (e2) fail(e2);
    },
    async setProjectWeek(siteId, week) {
      const { error } = await sb.rpc('set_project_week', { p_site: siteId, p_week: week });
      if (error) fail(error);
    },
  };
}

function toLine(r: Record<string, unknown>): Line {
  return {
    id: num(r.id), document_id: String(r.document_id), kind: r.kind as Line['kind'], move_date: String(r.move_date),
    item_id: num(r.item_id), qty: num(r.qty), subphase: (r.subphase as string) ?? null, return_of: r.return_of == null ? null : num(r.return_of),
    corrects_kind: (r.corrects_kind as string) ?? null,
  };
}

export function supabaseBackend(url: string, key: string): Backend {
  // Read before the client consumes the link: a reset-password email opens the app with type=recovery.
  let recovery = typeof location !== 'undefined' && /type=recovery/.test(location.hash + location.search);
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  // The signed-in person's own site. Admins can read every site, so everyday screens filter by this.
  let siteCache: Promise<string> | null = null;
  // Which site the signed-in person belongs to. Only a real answer is kept: a failed lookup is retried next time
  // and raises an error, instead of quietly pointing at "no site" (which made the store look empty and
  // opened "Set up your store" until the page was refreshed).
  let siteUser: string | null = null;
  const lookupSite = async () => {
    const { data: ses } = await sb.auth.getSession();
    let uid = ses.session?.user.id;
    if (!uid) { const { data: u } = await sb.auth.getUser(); uid = u.user?.id; }
    if (!uid) throw new Error('Your sign-in has expired. Sign in again.');
    const { data, error } = await sb.from('profiles').select('site_id').eq('id', uid).maybeSingle();
    if (error) throw new Error(error.message);
    siteUser = uid;
    return (data?.site_id as string) ?? '00000000-0000-0000-0000-000000000000';
  };
  const mySite = () => (siteCache ??= lookupSite().catch((e) => { siteCache = null; throw e; }));
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    // The browser re-confirms the sign-in now and then (e.g. on coming back to the tab): same person, same site.
    if (event === 'SIGNED_OUT' || (event === 'SIGNED_IN' && session?.user.id !== siteUser)) siteCache = null;
  });

  return {
    mode: 'live',

    async currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const { data: p } = await sb.from('profiles').select('full_name, role, status, site_id, training_days, training_waived, access, pages, head_office').eq('id', u.id).maybeSingle();
      return {
        email: u.email ?? '', name: p?.full_name || (u.email ?? '').split('@')[0],
        role: (p?.role ?? 'store') as User['role'], status: (p?.status ?? 'pending') as User['status'], siteId: p?.site_id ?? null,
        trainingDays: (p?.training_days as string[] | null) ?? [], trainingWaived: !!p?.training_waived,
        access: (p?.access ?? 'edit') as User['access'], pages: (p?.pages as string[] | null) ?? null, headOffice: !!p?.head_office,
      };
    },

    async signIn(who, password) {
      // First and last name (no @): the name-login function finds the account; email still works too.
      if (!who.includes('@')) {
        const { data, error } = await sb.functions.invoke('name-login', { body: { name: who, password } });
        if (error) throw new Error('Could not reach the server. Check the internet and try again.');
        const r = data as { access_token?: string; refresh_token?: string; error?: string };
        if (!r.access_token || !r.refresh_token) throw new Error(r.error ?? 'Name or password is wrong.');
        const { error: e2 } = await sb.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
        if (e2) fail(e2);
        return;
      }
      const { error } = await sb.auth.signInWithPassword({ email: who, password });
      if (error) fail(error);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async sendPasswordReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
      if (error) fail(error);
    },

    isRecovery() {
      return recovery;
    },

    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) fail(error);
      // Their own password now: the one the admin gave out is forgotten.
      await sb.rpc('forget_issued_password').then(() => undefined, () => undefined);
      recovery = false;
      history.replaceState(null, '', location.pathname);
    },

    async alertInfo() {
      const { data, error } = await sb.from('sites').select('alert_name, alert_phone, alert_sent_at, alert_sent_by').eq('id', await mySite()).maybeSingle();
      if (error || !data) return null;
      return { name: data.alert_name, phone: data.alert_phone, sent_at: data.alert_sent_at, sent_by: data.alert_sent_by };
    },
    async markAlertSent() { await sb.rpc('mark_alert_sent', {}); },
    async zohoStatus() {
      const { data, error } = await sb.rpc('my_zoho');
      if (error) return null;
      const r = (data as ZohoStatus[] | null)?.[0];
      return r ? { ...r, connected: true } : { connected: false, zoho_email: null, last_sync_at: null, last_error: null, imported: 0 };
    },
    async zohoConnect(mail) {
      const { data, error } = await sb.functions.invoke('zoho-start', { body: mail ? { mail: true } : {} });
      if (error || !data?.url) fail({ message: (data as { error?: string } | null)?.error ?? error?.message ?? 'Could not start the Zoho sign-in.' });
      location.href = data.url;
    },
    async sendMail(m) {
      const { data, error } = await sb.functions.invoke('zoho-mail', { body: m });
      if (error) return { error: error.message };
      return data as { ok?: boolean; error?: string; reconnect?: boolean; from?: string };
    },
    async dismissedIncoming() {
      const { data, error } = await sb.from('incoming_dismissed').select('po_id, po, vendor, reason, dismissed_at').eq('site_id', await mySite());
      if (error) { if (/incoming_dismissed/.test(error.message)) return []; fail(error); }
      return (data ?? []) as IncomingDismissed[];
    },
    async dismissIncoming(o) {
      const { error } = await sb.from('incoming_dismissed').insert(o);
      if (error) fail(error);
    },
    async restoreIncoming(poId) {
      const { error } = await sb.from('incoming_dismissed').delete().eq('site_id', await mySite()).eq('po_id', poId);
      if (error) fail(error);
    },
    async incoming() {
      const { data, error } = await sb.functions.invoke('zoho-incoming', { body: {} });
      if (error) return { connected: true, error: error.message };
      return data as Incoming;
    },
    async zohoOpen(q) {
      const { data, error } = await sb.functions.invoke('zoho-open', { body: q });
      if (error) return { error: error.message };
      return data as { url?: string; error?: string };
    },
    async zohoSync() {
      const { data, error } = await sb.functions.invoke('zoho-sync', { body: {} });
      if (error) return { connected: true, error: error.message };
      return data as ZohoSyncResult;
    },
    async zohoDisconnect() { const { error } = await sb.rpc('disconnect_zoho'); if (error) fail(error); },
    async checkDelivery(docId) { const { error } = await sb.rpc('check_delivery', { doc: docId }); if (error) fail(error); },
    async siteName() {
      const { data: u } = await sb.auth.getUser();
      const { data: p } = await sb.from('profiles').select('site_id').eq('id', u.user?.id ?? '').maybeSingle();
      const { data } = await sb.from('sites').select('name, basements, has_ground, floors, roof_name, companies(name)').eq('id', p?.site_id ?? '').maybeSingle();
      const c = (data as { companies?: { name?: string } | { name?: string }[] } | null)?.companies;
      const company = Array.isArray(c) ? c[0]?.name : c?.name;
      const st = data as { basements?: number; has_ground?: boolean; floors?: number | null; roof_name?: string | null } | null;
      return { company: company ?? '', site: data?.name ?? 'Site store',
        structure: st?.floors ? { basements: st.basements ?? 0, has_ground: st.has_ground ?? true, floors: st.floors, roof_name: st.roof_name ?? null } : null };
    },

    async signUp(input) {
      const { email, password, ...meta } = input;
      const { error } = await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: `${location.origin}/` } });
      if (error) fail(error);
    },

    async signupSites() {
      const { data, error } = await sb.rpc('signup_sites');
      if (error) fail(error);
      return (data ?? []) as SiteInfo[];
    },

    async requestCorrection(input) {
      const { error } = await sb.from('correction_requests').insert(input);
      if (error) fail(error);
    },

    async deleteEntry(docId, why, note) {
      const { data, error } = await sb.rpc('delete_entry', { doc_id: docId, why, note: note ?? null });
      if (error) fail(error);
      return data as 'deleted' | 'asked';
    },
    async saveRegister(day, store, lines) {
      const { data, error } = await sb.rpc('save_register', { on_date: day, store: store ?? '', items: lines });
      if (error) fail(error);
      return data as 'new' | 'added';
    },
    async myCorrections() {
      const { data, error } = await sb.from('correction_requests').select('*').eq('site_id', await mySite()).order('created_at', { ascending: false }).limit(200);
      if (error) fail(error);
      return (data ?? []).map(toCorrection);
    },

    admin: adminApi(sb),

    async items() {
      // in_zoho arrives with migration 0015; until it has run, every item counts as in Zoho.
      const rows = await fetchAll<Item>((a, b) => sb.from('items').select('id,name,unit,in_zoho').order('name').range(a, b))
        .catch(() => fetchAll<Item>((a, b) => sb.from('items').select('id,name,unit').order('name').range(a, b)));
      return rows.map((r) => ({ id: num(r.id), name: r.name, unit: r.unit, in_zoho: r.in_zoho !== false }));
    },

    async addItem(name, unit) {
      const { data, error } = await sb.from('items').insert({ name, unit }).select('id,name,unit').single();
      if (error) fail(error);
      return { id: num(data.id), name: data.name, unit: data.unit };
    },

    async siteTeam() {
      const { data, error } = await sb.from('profiles').select('full_name').eq('site_id', await mySite()).eq('status', 'approved').order('full_name');
      if (error) return [];
      return [...new Set((data ?? []).map((r) => String(r.full_name ?? '').trim()).filter(Boolean))];
    },
    async remembered(field) {
      const f = FIELD[field];
      let q = sb.from('documents').select(f.col).eq('site_id', await mySite()).not(f.col, 'is', null);
      if (f.kinds) q = q.in('kind', f.kinds);
      const { data, error } = await q.limit(2000);
      if (error) fail(error);
      const set = new Set<string>();
      (data as unknown as Record<string, string>[]).forEach((r) => { const v = (r[f.col] || '').trim(); if (v) set.add(v); });
      return [...set].sort((a, b) => a.localeCompare(b));
    },

    async saveDocument(doc: DocInput, lines: LineInput[]) {
      const { data, error } = await sb.from('documents').insert(doc).select('id').single();
      if (error) fail(error);
      if (!lines.length) return;
      const { error: e2 } = await sb.from('movements').insert(lines.map((l) => ({ ...l, document_id: data.id })));
      if (e2) {
        await sb.from('documents').delete().eq('id', data.id);
        fail(e2);
      }
    },

    async unconfirmed() {
      const { data, error } = await sb.from('documents').select('*, movements(*)').eq('site_id', await mySite()).neq('to_confirm', '{}').order('doc_date', { ascending: false }).limit(100);
      if (error) fail(error);
      return (data ?? []).map((r: Record<string, unknown>) => ({ ...(r as unknown as Doc), lines: ((r.movements as Record<string, unknown>[]) ?? []).map(toLine) }));
    },
    async confirmDetails(docId, fields) {
      const { error } = await sb.rpc('confirm_details', { doc: docId, fields });
      if (error) fail(error);
    },
    async drafts() {
      const { data, error } = await sb.from('drafts').select('*').eq('site_id', await mySite()).order('created_at');
      if (error) fail(error);
      // The table calls the label `title`.
      return (data ?? []).map(({ title, ...r }) => ({ ...r, label: title ?? '' })) as Draft[];
    },
    async saveDraft({ label, ...d }) {
      const { error } = await sb.from('drafts').insert({ ...d, title: label });
      if (error) fail(error);
    },
    async deleteDraft(id) {
      const { error } = await sb.from('drafts').delete().eq('id', id);
      if (error) fail(error);
    },

    async removeDocument(id) {
      // A submitted day is locked: the database quietly removes nothing, so check that the entry really went.
      const { data, error } = await sb.from('documents').delete().eq('id', id).select('id');
      if (error) fail(error);
      if (!data?.length) throw new Error('LOCKED');
    },

    async documents(from, to) {
      const site = await mySite();
      const rows = await fetchAll<Record<string, unknown>>((a, b) =>
        sb.from('documents').select('*, movements(*)').eq('site_id', site).gte('doc_date', from).lte('doc_date', to).order('created_at').range(a, b));
      return rows.map((r) => ({
        ...(r as unknown as Doc),
        lines: ((r.movements as Record<string, unknown>[]) ?? []).map(toLine).sort((x, y) => x.id - y.id),
      }));
    },

    async linesBetween(from, to) {
      const site = await mySite();
      const rows = await fetchAll<Record<string, unknown>>((a, b) =>
        sb.from('movements').select('id,document_id,kind,move_date,item_id,qty,subphase,return_of,corrects_kind').eq('site_id', site).gte('move_date', from).lte('move_date', to).order('id').range(a, b));
      return rows.map(toLine);
    },

    async balances() {
      const site = await mySite();
      const rows = await fetchAll<Record<string, unknown>>((a, b) => sb.from('stock_balances').select('*').eq('site_id', site).order('name').range(a, b));
      return rows.map(toBalance);
    },

    async submission(day) {
      const { data, error } = await sb.from('day_submissions').select('day,submitted_at,steps,closed_reason').eq('site_id', await mySite()).eq('day', day).maybeSingle();
      if (error) fail(error);
      return (data as Submission) ?? null;
    },

    async viewSite(siteId) {
      const { error } = await sb.rpc('view_site', { site: siteId });
      if (error) fail(error);
      siteCache = null;
    },
    async submittedDays(from, to) {
      const { data, error } = await sb.from('day_submissions').select('day').eq('site_id', await mySite()).gte('day', from).lte('day', to);
      if (error) fail(error);
      return (data ?? []).map((r) => String(r.day));
    },
    async submitDay(day, steps, closedReason) {
      const { error } = await sb.from('day_submissions').insert({ day, steps, ...(closedReason ? { closed_reason: closedReason } : {}) });
      if (error) fail(error);
    },

    async lastSubmittedDay(before) {
      const { data, error } = await sb.from('day_submissions').select('day').eq('site_id', await mySite()).lt('day', before).order('day', { ascending: false }).limit(1).maybeSingle();
      if (error) fail(error);
      return (data?.day as string) ?? null;
    },

    async recordTrainingDay(day) {
      const { data, error } = await sb.rpc('record_training_day', { d: day });
      if (error) fail(error);
      return (data as number) ?? 0;
    },

    async setReorder(itemId, level) {
      const { error } = await sb.from('site_items').update({ reorder_level: level }).eq('site_id', await mySite()).eq('item_id', itemId);
      if (error) fail(error);
    },

    async checklist() {
      const site = await mySite();
      const rows = await fetchAll<Record<string, unknown>>((a, b) => sb.from('site_checklist').select('position, items(id,name,unit)').eq('site_id', site).order('position').range(a, b));
      return rows.map((r) => { const i = (Array.isArray(r.items) ? r.items[0] : r.items) as Item; return { id: num(i.id), name: i.name, unit: i.unit }; });
    },

    async stockTakes() {
      const site = await mySite();
      const { data, error } = await sb.from('stock_takes').select('*, stock_take_lines(item_id, qty)').eq('site_id', site).order('count_date', { ascending: false }).order('created_at', { ascending: false });
      if (error) fail(error);
      return (data ?? []).map((r: Record<string, unknown>) => ({ ...(r as unknown as StockTake), lines: ((r.stock_take_lines as Record<string, unknown>[]) ?? []).map((l) => ({ item_id: num(l.item_id), qty: num(l.qty) })) }));
    },

    async saveStockTake(input) {
      const site = await mySite();
      const { count } = await sb.from('documents').select('id', { count: 'exact', head: true }).eq('site_id', site);
      const first = !count;
      let documentId: string | null = null;
      if (first) {
        const lines = input.lines.filter((l) => l.qty > 0);
        const { data, error } = await sb.from('documents').insert({ kind: 'opening', doc_date: input.count_date, doc_time: input.end_time, reason: 'First stock take', party: input.counted_by }).select('id').single();
        if (error) fail(error);
        documentId = data.id;
        if (lines.length) {
          const { error: e2 } = await sb.from('movements').insert(lines.map((l) => ({ ...l, document_id: data.id })));
          if (e2) { await sb.from('documents').delete().eq('id', data.id); fail(e2); }
        }
      }
      const { lines, ...head } = input;
      const { data: t, error } = await sb.from('stock_takes').insert({ ...head, is_first: first, status: first ? 'confirmed' : 'recorded', document_id: documentId }).select('id').single();
      if (error) fail(error);
      if (lines.length) {
        const { error: e3 } = await sb.from('stock_take_lines').insert(lines.map((l) => ({ ...l, stock_take_id: t.id })));
        if (e3) fail(e3);
      }
    },

    async projectWeek() {
      const { data } = await sb.from('sites').select('week_anchor_no, week_anchor_date').eq('id', await mySite()).maybeSingle();
      return { anchorNo: (data?.week_anchor_no as number) ?? null, anchorDate: (data?.week_anchor_date as string) ?? null };
    },

    async setProjectWeek(week) {
      const { error } = await sb.rpc('set_project_week', { p_site: await mySite(), p_week: week });
      if (error) fail(error);
    },

    async entryDays(from, to) {
      const site = await mySite();
      const rows = await fetchAll<Record<string, unknown>>((a, b) => sb.from('documents').select('doc_date').eq('site_id', site).neq('kind', 'opening').gte('doc_date', from).lte('doc_date', to).range(a, b));
      return [...new Set(rows.map((r) => String(r.doc_date)))];
    },
  };
}
