// Shared Zoho helpers for Bohari's edge functions. Read-only: nothing here writes to Zoho.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const APP_URL = Deno.env.get('BOHARI_APP_URL') ?? 'https://site-stock-management-system.vercel.app';
export const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/zoho-callback`;
export const ORG_ID = Deno.env.get('ZOHO_ORG_ID') ?? '838038949';
export const SCOPES = Deno.env.get('ZOHO_SCOPES') ??
  'ZohoInventory.purchasereceives.READ,ZohoInventory.purchaseorders.READ,ZohoBooks.purchaseorders.READ,ZohoBooks.settings.READ,ZohoBooks.contacts.READ';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** The signed-in Bohari user calling the function, or null. */
export async function caller(req: Request, db: SupabaseClient) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  return data.user ?? null;
}

const clientId = () => Deno.env.get('ZOHO_CLIENT_ID') ?? '';
const clientSecret = () => Deno.env.get('ZOHO_CLIENT_SECRET') ?? '';
export const configured = () => !!clientId() && !!clientSecret();

export function authUrl(state: string, accounts = 'https://accounts.zoho.com') {
  const p = new URLSearchParams({ response_type: 'code', client_id: clientId(), scope: SCOPES, redirect_uri: REDIRECT_URI, access_type: 'offline', prompt: 'consent', state });
  return `${accounts}/oauth/v2/auth?${p}`;
}

export async function exchangeCode(code: string, accounts: string) {
  const p = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId(), client_secret: clientSecret(), redirect_uri: REDIRECT_URI, code });
  const r = await fetch(`${accounts}/oauth/v2/token?${p}`, { method: 'POST' });
  return await r.json() as { access_token?: string; refresh_token?: string; api_domain?: string; error?: string };
}

export async function refreshAccess(refresh: string, accounts: string) {
  const p = new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId(), client_secret: clientSecret(), refresh_token: refresh });
  const r = await fetch(`${accounts}/oauth/v2/token?${p}`, { method: 'POST' });
  const j = await r.json() as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`Zoho sign-in expired (${j.error ?? r.status}). Connect Zoho again.`);
  return j.access_token;
}

export async function zget(api: string, token: string, path: string, params: Record<string, string> = {}) {
  const u = `${api}${path}?${new URLSearchParams(params)}`;
  const r = await fetch(u, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* not json */ }
  return { ok: r.ok && (j.code === 0 || j.code === undefined), status: r.status, body: j };
}
