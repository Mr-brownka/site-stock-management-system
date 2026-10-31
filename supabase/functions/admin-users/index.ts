// Admin adds a person (name, password, role, site, access, pages) or sets a new password for someone.
// People sign in with their first and last name; behind it each gets a private login address (never shown).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { admin, caller, cors, json } from '../_shared/zoho.ts';

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'user';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db: SupabaseClient = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const { data: me } = await db.from('profiles').select('role, status').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin' || me?.status !== 'approved') return json({ error: 'Only the admin can do this.' }, 403);
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (b.action === 'password') {
    const id = String(b.user_id ?? ''), pw = String(b.password ?? '');
    if (pw.length < 6) return json({ error: 'The password needs at least 6 characters.' });
    const { error } = await db.auth.admin.updateUserById(id, { password: pw });
    if (error) return json({ error: error.message });
    await db.from('issued_passwords').upsert({ user_id: id, password: pw, set_at: new Date().toISOString(), set_by: user.id });
    return json({ ok: true });
  }

  if (b.action === 'delete') {
    // Delete an account for good. Only for people with nothing on record; otherwise "Remove access" keeps their entries.
    const id = String(b.user_id ?? '');
    if (!id || id === user.id) return json({ error: 'You can’t delete your own account.' });
    const used = await Promise.all([
      db.from('documents').select('id', { count: 'exact', head: true }).eq('created_by', id),
      db.from('correction_requests').select('id', { count: 'exact', head: true }).eq('created_by', id),
      db.from('day_submissions').select('day', { count: 'exact', head: true }).eq('submitted_by', id),
      db.from('stock_takes').select('id', { count: 'exact', head: true }).eq('created_by', id),
      db.from('incoming_dismissed').select('po_id', { count: 'exact', head: true }).eq('dismissed_by', id),
    ]);
    if (used.some((r) => (r.count ?? 0) > 0)) return json({ error: 'This person has entries on record, so the account can’t be deleted. Use “Remove access” instead: they can’t sign in and their entries stay.' });
    await db.from('drafts').delete().eq('created_by', id);
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message });
    return json({ ok: true });
  }

  if (b.action === 'create') {
    const full = String(b.full_name ?? '').replace(/\s+/g, ' ').trim();
    const pw = String(b.password ?? '');
    const role = ['admin', 'store', 'site_manager', 'procurement', 'accounts', 'coo', 'ceo', 'project_manager'].includes(String(b.role)) ? String(b.role) : 'store';
    // Pages and access come from the role; a store keeper can be made view only one by one.
    // Demo mode: anyone can be set to open on the example store instead of the real one.
    const access = b.access === 'demo' ? 'demo' : role === 'store' && b.access === 'read' ? 'read' : 'edit';
    const pages = null;
    if (full.split(' ').length < 2) return json({ error: 'Type the first and last name.' });
    if (pw.length < 6) return json({ error: 'The password needs at least 6 characters.' });
    const { data: same } = await db.from('profiles').select('id').ilike('full_name', full).neq('status', 'removed');
    if (same?.length) return json({ error: `Someone called ${full} already has an account. Add a middle name or initial to tell them apart.` });
    // A private login address the person never needs to know.
    let email = `${slug(full)}@people.ostock.co.ke`;
    for (let i = 2; i < 50; i++) {
      const { data: taken } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
      if (!taken) break;
      email = `${slug(full)}.${i}@people.ostock.co.ke`;
    }
    const { data: made, error } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: full, phone: b.phone ?? '', site_id: b.site_id ?? '', role } });
    if (error || !made.user) return json({ error: error?.message ?? 'Could not create the account.' });
    const { error: e2 } = await db.from('profiles').upsert({
      id: made.user.id, full_name: full, email, phone: (b.phone as string) || null, role, access, pages, head_office: b.head_office === true,
      site_id: (b.site_id as string) || null, status: 'approved', decided_at: new Date().toISOString(),
      training_waived: role !== 'store',
    });
    if (e2) return json({ error: e2.message });
    await db.from('issued_passwords').upsert({ user_id: made.user.id, password: pw, set_at: new Date().toISOString(), set_by: user.id });
    return json({ ok: true, id: made.user.id });
  }
  return json({ error: 'Unknown action' }, 400);
});
