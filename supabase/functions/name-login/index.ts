// Sign in with first and last name and password. Finds the person's login behind the scenes,
// then asks Supabase for a session exactly as an email sign-in would. Never returns the login address.
import { admin, cors, json } from '../_shared/zoho.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const b = await req.json().catch(() => ({})) as { name?: string; password?: string };
  const name = String(b.name ?? '').replace(/\s+/g, ' ').trim();
  const password = String(b.password ?? '');
  if (!name || !password) return json({ error: 'Type your name and password.' });
  const db = admin();
  const { data: people } = await db.from('profiles').select('email, status').ilike('full_name', name.replace(/[%_]/g, ''));
  const live = (people ?? []).filter((p) => p.status !== 'removed' && p.status !== 'declined' && p.email);
  if (live.length > 1) return json({ error: 'Two people share this name. Sign in with your email, or ask the admin.' });
  // Same answer whether the name or the password is wrong.
  const email = live[0]?.email ?? 'nobody@people.ostock.co.ke';
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok || !j.access_token) return json({ error: 'Name or password is wrong.' });
  return json({ access_token: j.access_token, refresh_token: j.refresh_token });
});
