// Starts "Connect my Zoho": remembers who asked, then sends them to Zoho's own sign-in page.
import { admin, authUrl, caller, clientIdHint, configured, cors, json } from '../_shared/zoho.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (new URL(req.url).searchParams.get('check') === '1') return json({ configured: configured(), clientId: clientIdHint() });
  if (!configured()) return json({ error: 'Zoho is not set up on the server yet (client id or secret missing).' }, 500);
  const db = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'Sign in to Bohari first.' }, 401);
  await db.from('zoho_states').delete().lt('created_at', new Date(Date.now() - 3600_000).toISOString());
  const { data, error } = await db.from('zoho_states').insert({ user_id: user.id }).select('state').single();
  if (error) return json({ error: error.message }, 500);
  let body: { mail?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }
  return json({ url: authUrl(data.state, 'https://accounts.zoho.com', body.mail === true) });
});
