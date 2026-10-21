// Sends an email from the signed-in person's own Zoho Mail (e.g. a stock take to the site manager).
// Uses the same Zoho connection as Books; email needs the person to have allowed Zoho Mail once.
import { admin, caller, cors, json, refreshAccess } from '../_shared/zoho.ts';

const mailHost = (accounts: string) => accounts.replace('://accounts.', '://mail.');
const isEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const user = await caller(req, db);
  if (!user) return json({ error: 'Sign in to Bohari first.' }, 401);
  let b: { to?: string[]; cc?: string[]; subject?: string; html?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }
  const to = (b.to ?? []).map((x) => x.trim()).filter(isEmail);
  const cc = (b.cc ?? []).map((x) => x.trim()).filter(isEmail);
  if (!to.length) return json({ error: 'Add at least one email address to send to.' });
  if (!b.subject || !b.html) return json({ error: 'Nothing to send.' });
  if (b.html.length > 900_000) return json({ error: 'This email is too large to send.' });

  const { data: c } = await db.from('zoho_connections').select('refresh_token, accounts_domain').eq('user_id', user.id).maybeSingle();
  if (!c) return json({ error: 'Connect your Zoho first to send email.', reconnect: true });
  let token: string;
  try { token = await refreshAccess(c.refresh_token, c.accounts_domain); } catch (e) { return json({ error: (e as Error).message, reconnect: true }); }
  const host = mailHost(c.accounts_domain || 'https://accounts.zoho.com');
  const auth = { Authorization: `Zoho-oauthtoken ${token}` };

  const acc = await fetch(`${host}/api/accounts`, { headers: auth });
  const aj = await acc.json().catch(() => ({})) as { data?: { accountId?: string; primaryEmailAddress?: string; mailboxAddress?: string; emailAddress?: { mailId: string; isPrimary?: boolean }[] }[]; status?: { description?: string } };
  if (!acc.ok || !aj.data?.length) {
    return json({ error: 'Zoho Mail has not allowed Bohari to send email yet. Allow it once, then try again.', reconnect: true, detail: aj.status?.description ?? acc.status });
  }
  const a = aj.data[0];
  const from = a.primaryEmailAddress ?? a.mailboxAddress ?? a.emailAddress?.find((e) => e.isPrimary)?.mailId ?? a.emailAddress?.[0]?.mailId;
  if (!a.accountId || !from) return json({ error: 'Could not find your Zoho Mail address.' });

  const r = await fetch(`${host}/api/accounts/${a.accountId}/messages`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromAddress: from, toAddress: to.join(','), ...(cc.length ? { ccAddress: cc.join(',') } : {}), subject: b.subject, content: b.html, mailFormat: 'html' }),
  });
  const rj = await r.json().catch(() => ({})) as { status?: { code?: number; description?: string }; data?: { moreInfo?: string } };
  if (!r.ok || (rj.status?.code && rj.status.code !== 200)) {
    const why = rj.data?.moreInfo ?? rj.status?.description ?? `Zoho Mail answered ${r.status}`;
    return json({ error: `Not sent: ${why}`, reconnect: r.status === 401 || /scope|oauth|token/i.test(why) });
  }
  return json({ ok: true, from });
});
