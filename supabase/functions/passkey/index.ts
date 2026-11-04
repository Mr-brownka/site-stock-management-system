// 20 · Sign in with fingerprint / Face ID (passkeys). The phone keeps the private key; we keep only the public key.
// After the phone proves it is that person, we hand back a one-time sign-in token (as a magic link would).
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from 'npm:@simplewebauthn/server@10.0.1';
import { isoBase64URL } from 'npm:@simplewebauthn/server@10.0.1/helpers';
import { admin, caller, cors, json } from '../_shared/zoho.ts';

// Where Ostock runs. A passkey made on one of these works only there.
const ALLOWED = ['site-stock-management-system.vercel.app', 'ostock.co.ke', 'www.ostock.co.ke', 'localhost'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const b = await req.json().catch(() => ({})) as { action?: string; cid?: string; response?: unknown; device?: string };
  if (b.action === 'ping') return json({ ok: true });
  const origin = req.headers.get('origin') ?? '';
  let host = '';
  try { host = new URL(origin).hostname; } catch { /* none */ }
  if (!ALLOWED.includes(host)) return json({ error: 'Open Ostock from its own address to use fingerprint sign-in.' }, 400);
  const rpID = host;
  const db = admin();

  const takeChallenge = async (cid?: string) => {
    if (!cid) return null;
    const { data } = await db.from('passkey_challenges').delete().eq('id', cid).select('challenge, user_id, created_at').maybeSingle();
    if (!data || Date.now() - new Date(data.created_at).getTime() > 10 * 60_000) return null;
    return data as { challenge: string; user_id: string | null };
  };

  try {
    if (b.action === 'reg-options') {
      const u = await caller(req, db);
      if (!u) return json({ error: 'Sign in first' }, 401);
      const { data: prof } = await db.from('profiles').select('full_name, guest, access').eq('id', u.id).maybeSingle();
      if (prof?.guest || prof?.access === 'demo') return json({ error: 'Not available in the demo.' });
      const { data: mine } = await db.from('passkeys').select('credential_id, transports').eq('user_id', u.id);
      const options = await generateRegistrationOptions({
        rpName: 'Ostock', rpID, userName: u.email ?? u.id, userDisplayName: prof?.full_name ?? u.email ?? 'Ostock user',
        userID: new TextEncoder().encode(u.id), attestationType: 'none',
        excludeCredentials: (mine ?? []).map((k) => ({ id: k.credential_id, transports: k.transports ?? undefined })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      });
      const { data: ch } = await db.from('passkey_challenges').insert({ challenge: options.challenge, user_id: u.id }).select('id').single();
      return json({ options, cid: ch!.id });
    }
    if (b.action === 'reg-verify') {
      const u = await caller(req, db);
      if (!u) return json({ error: 'Sign in first' }, 401);
      const ch = await takeChallenge(b.cid);
      if (!ch || ch.user_id !== u.id) return json({ error: 'That took too long. Try again.' });
      // deno-lint-ignore no-explicit-any
      const v = await verifyRegistrationResponse({ response: b.response as any, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return json({ error: 'Could not check it. Try again.' });
      const info = v.registrationInfo;
      // deno-lint-ignore no-explicit-any
      const tr = ((b.response as any)?.response?.transports ?? null) as string[] | null;
      const { error } = await db.from('passkeys').insert({ user_id: u.id, credential_id: info.credentialID, public_key: isoBase64URL.fromBuffer(info.credentialPublicKey), counter: info.counter, transports: tr, device: String(b.device ?? '').slice(0, 60) || null });
      if (error) return json({ error: /duplicate/.test(error.message) ? 'This device is already set up.' : 'Could not save it.' });
      return json({ ok: true });
    }
    if (b.action === 'login-options') {
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
      const { data: ch } = await db.from('passkey_challenges').insert({ challenge: options.challenge }).select('id').single();
      return json({ options, cid: ch!.id });
    }
    if (b.action === 'login-verify') {
      const ch = await takeChallenge(b.cid);
      if (!ch) return json({ error: 'That took too long. Try again.' });
      // deno-lint-ignore no-explicit-any
      const resp = b.response as any;
      const { data: key } = await db.from('passkeys').select('id, user_id, credential_id, public_key, counter, transports').eq('credential_id', resp?.id ?? '').maybeSingle();
      if (!key) return json({ error: 'That fingerprint isn’t set up for Ostock yet. Sign in with your password, then turn it on in Me.' });
      const v = await verifyAuthenticationResponse({
        response: resp, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        authenticator: { credentialID: key.credential_id, credentialPublicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter), transports: key.transports ?? undefined },
      });
      if (!v.verified) return json({ error: 'Could not check it. Try again.' });
      await db.from('passkeys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', key.id);
      const { data: prof } = await db.from('profiles').select('status, email').eq('id', key.user_id).maybeSingle();
      if (!prof || prof.status === 'removed' || prof.status === 'declined') return json({ error: 'This account can’t sign in. Ask the admin.' });
      const { data: au } = await db.auth.admin.getUserById(key.user_id);
      const email = au.user?.email ?? prof.email;
      if (!email) return json({ error: 'Sign in with your password this time.' });
      const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
      if (error || !link?.properties?.hashed_token) return json({ error: 'Could not sign you in. Try your password.' });
      return json({ token_hash: link.properties.hashed_token });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || 'Something went wrong' });
  }
});
