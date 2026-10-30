// Zoho sends the person back here after they accept. We swap the one-time code for a
// long-lived read-only token, keep it on the server, and return them to Bohari.
// No Bohari sign-in header arrives here (it's a browser redirect), so the one-time `state`
// created by zoho-start for that person is what proves who it is.
import { admin, APP_URL, exchangeCode, ORG_ID, zget } from '../_shared/zoho.ts';


Deno.serve(async (req) => {
  let home = APP_URL;
  const back = (q: Record<string, string>) => Response.redirect(`${home}/?${new URLSearchParams(q)}#/home`, 302);
  const u = new URL(req.url);
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  const accounts = u.searchParams.get('accounts-server') ?? 'https://accounts.zoho.com';
  const db = admin();
  const { data: st } = state ? await db.from('zoho_states').select('user_id, created_at, return_to').eq('state', state).maybeSingle() : { data: null };
  home = st?.return_to ?? APP_URL;
  if (u.searchParams.get('error')) return back({ zoho: 'declined' });
  if (!code || !state) return back({ zoho: 'error', why: 'Zoho did not send a code back.' });
  if (!/^https:\/\/accounts\.zoho\.[a-z.]+$/.test(accounts)) return back({ zoho: 'error', why: 'Unexpected Zoho server.' });

  await db.from('zoho_states').delete().eq('state', state);
  if (!st || Date.now() - new Date(st.created_at).getTime() > 20 * 60_000) return back({ zoho: 'error', why: 'The sign-in took too long. Try again.' });

  const tok = await exchangeCode(code, accounts);
  if (!tok.refresh_token || !tok.access_token) return back({ zoho: 'error', why: `Zoho refused (${tok.error ?? 'no token'}).` });
  const api = tok.api_domain ?? 'https://www.zohoapis.com';

  // Which Zoho organisation (Comex), and who signed in.
  let org = ORG_ID, email: string | null = null;
  const orgs = await zget(api, tok.access_token, '/books/v3/organizations');
  const list = (orgs.body.organizations as { organization_id: string }[] | undefined) ?? [];
  if (list.length && !list.some((o) => String(o.organization_id) === ORG_ID)) org = String(list[0].organization_id);
  const me = await zget(api, tok.access_token, '/books/v3/users/me', { organization_id: org });
  email = ((me.body.user as { email?: string } | undefined)?.email) ?? null;

  const { data: prof } = await db.from('profiles').select('site_id').eq('id', st.user_id).maybeSingle();
  // Imports start from the day a store first connects (Nairobi date). Reconnecting keeps the original start date.
  const { data: prev } = await db.from('zoho_connections').select('import_from').eq('user_id', st.user_id).maybeSingle();
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const { error } = await db.from('zoho_connections').upsert({
    user_id: st.user_id, site_id: prof?.site_id ?? null, zoho_email: email, org_id: org, api_domain: api,
    accounts_domain: accounts, refresh_token: tok.refresh_token, api_kind: null, import_from: prev?.import_from ?? today, connected_at: new Date().toISOString(), last_error: null,
  });
  if (error) return back({ zoho: 'error', why: error.message });
  return back({ zoho: 'connected' });
});
