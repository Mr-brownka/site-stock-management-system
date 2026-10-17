import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AdminApi, Backend, Balance, CorrectionRequest, Doc, DocInput, Field, Item, Line, LineInput, Profile, SiteDoc, SiteInfo, Submission, User } from './types';

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
      const { data, error } = await sb.from('profiles').select('id, full_name, email, phone, role, status, site_id, created_at, decided_at').order('created_at', { ascending: false });
      if (error) fail(error);
      return (data ?? []) as Profile[];
    },
    async setProfile(id, patch) {
      const { error } = await sb.from('profiles').update({ ...patch, decided_at: new Date().toISOString() }).eq('id', id);
      if (error) fail(error);
    },
    async sites() {
      const { data, error } = await sb.from('sites').select('id, name, created_at, companies(name)').order('created_at');
      if (error) fail(error);
      return (data ?? []).map((r: Record<string, unknown>) => {
        const c = r.companies as { name?: string } | { name?: string }[] | null;
        return { id: String(r.id), name: String(r.name), company: (Array.isArray(c) ? c[0]?.name : c?.name) ?? '' };
      });
    },
    async addSite(name) {
      const { data: one } = await sb.from('sites').select('company_id').limit(1).single();
      const { error } = await sb.from('sites').insert({ name, company_id: one?.company_id });
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
  const mySite = () => (siteCache ??= (async () => {
    const { data: u } = await sb.auth.getUser();
    const { data } = await sb.from('profiles').select('site_id').eq('id', u.user?.id ?? '').maybeSingle();
    return (data?.site_id as string) ?? '00000000-0000-0000-0000-000000000000';
  })());
  sb.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') recovery = true; if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') siteCache = null; });

  return {
    mode: 'live',

    async currentUser() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const { data: p } = await sb.from('profiles').select('full_name, role, status, site_id').eq('id', u.id).maybeSingle();
      return {
        email: u.email ?? '', name: p?.full_name || (u.email ?? '').split('@')[0],
        role: (p?.role ?? 'store') as User['role'], status: (p?.status ?? 'pending') as User['status'], siteId: p?.site_id ?? null,
      };
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
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
      recovery = false;
      history.replaceState(null, '', location.pathname);
    },

    async siteName() {
      const { data: u } = await sb.auth.getUser();
      const { data: p } = await sb.from('profiles').select('site_id').eq('id', u.user?.id ?? '').maybeSingle();
      const { data } = await sb.from('sites').select('name, companies(name)').eq('id', p?.site_id ?? '').maybeSingle();
      const c = (data as { companies?: { name?: string } | { name?: string }[] } | null)?.companies;
      const company = Array.isArray(c) ? c[0]?.name : c?.name;
      return { company: company ?? '', site: data?.name ?? 'Site store' };
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

    async myCorrections() {
      const { data, error } = await sb.from('correction_requests').select('*').eq('site_id', await mySite()).order('created_at', { ascending: false }).limit(200);
      if (error) fail(error);
      return (data ?? []).map(toCorrection);
    },

    admin: adminApi(sb),

    async items() {
      const rows = await fetchAll<Item>((a, b) => sb.from('items').select('id,name,unit').order('name').range(a, b));
      return rows.map((r) => ({ id: num(r.id), name: r.name, unit: r.unit }));
    },

    async addItem(name, unit) {
      const { data, error } = await sb.from('items').insert({ name, unit }).select('id,name,unit').single();
      if (error) fail(error);
      return { id: num(data.id), name: data.name, unit: data.unit };
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

    async removeDocument(id) {
      const { error } = await sb.from('documents').delete().eq('id', id);
      if (error) fail(error);
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
      const { data, error } = await sb.from('day_submissions').select('day,submitted_at,steps').eq('site_id', await mySite()).eq('day', day).maybeSingle();
      if (error) fail(error);
      return (data as Submission) ?? null;
    },

    async submitDay(day, steps) {
      const { error } = await sb.from('day_submissions').insert({ day, steps });
      if (error) fail(error);
    },

    async setReorder(itemId, level) {
      const { error } = await sb.from('site_items').update({ reorder_level: level }).eq('site_id', await mySite()).eq('item_id', itemId);
      if (error) fail(error);
    },
  };
}
