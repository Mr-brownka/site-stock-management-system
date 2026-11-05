// Personal links: …/?demo=TOKEN opens Ostock with no password.
//  · Demo-mode people: { mode: 'demo' } — the app opens the read-only copy of Reveal (as before; old links keep working).
//  · Everyone else: a one-time sign-in token for that person, so the app signs them in as themselves
//    (their own site, access and name on every entry). The admin can switch a link off by making a new one.
import { admin, cors, json } from './zoho.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const b = await req.json().catch(() => ({})) as { token?: string };
  const token = String(b.token ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'This link is not valid. Ask the admin for a new one.' });
  const db = admin();
  const { data: p } = await db.from('profiles').select('id, full_name, status, access, email').eq('demo_token', token).maybeSingle();
  if (!p) return json({ error: 'This link has been switched off. Ask the admin for a new one.' });
  if (p.status !== 'approved') return json({ error: 'This account can’t open Ostock right now. Ask the admin.' });
  if (p.access === 'demo') return json({ mode: 'demo', name: p.full_name });
  const { data: au } = await db.auth.admin.getUserById(p.id);
  const email = au.user?.email ?? p.email;
  if (!email) return json({ error: 'This account has no sign-in set up. Ask the admin.' });
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link?.properties?.hashed_token) return json({ error: 'Could not open Ostock just now. Try again.' });
  return json({ mode: 'user', name: p.full_name, token_hash: link.properties.hashed_token });
});
