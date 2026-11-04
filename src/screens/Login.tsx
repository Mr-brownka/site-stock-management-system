import { Wordmark } from '../components/Brand';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export function Login({ onIn, onCreate, notice }: { onIn: () => void; onCreate: () => void; notice?: string }) {
  // The name used last time on this device stays filled in (the phone or browser keeps the password).
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('ostock-login-name') ?? ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const demo = api.mode === 'demo';
  // 20 · Fingerprint / Face ID: shown when the server has it switched on and this browser can do it.
  const [pk, setPk] = useState(false);
  useEffect(() => { if (window.PublicKeyCredential && api.device) api.device.ready().then((r) => setPk(r.passkey)).catch(() => undefined); }, []);
  const passkey = async () => {
    setBusy(true); setErr('');
    try { await api.device!.passkeyLogin(); onIn(); }
    catch (x) { const m = (x as Error).message; if (!/abort|cancel|not allowed|timed out/i.test(m)) setErr(m); }
    finally { setBusy(false); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.signIn(email.trim(), password); try { localStorage.setItem('ostock-login-name', email.trim()); } catch { /* ignore */ } onIn(); }
    catch (x) { setErr((x as Error).message === 'Invalid login credentials' ? 'Name or password is wrong.' : (x as Error).message); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim().includes('@')) { setErr('Ask the admin to set a new password for you. (If you signed up with an email, type it above, then tap “Forgot password?”.)'); return; }
    setBusy(true); setErr('');
    try { await api.sendPasswordReset(email.trim()); setSent(true); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="phone login">
      <header className="top" style={{ padding: '40px 20px 28px' }}>
        <div className="kicker"><span>SITE STOCK MANAGEMENT SYSTEM</span>{demo && <span className="badge">DEMO</span>}</div>
        <div style={{ margin: '10px 0 4px' }}><Wordmark size={56} /></div>
        <div className="sub">Live stock balances for the site store</div>
      </header>
      <main className="body">
        {demo ? (
          <div className="stack enter">
            <div className="note">This is the <b>demo</b>: example data that stays on this phone. Connect Supabase to use real data (see the README).</div>
            <button className="btn accent" onClick={async () => { await api.signIn('', ''); onIn(); }}>Open the demo</button>
          </div>
        ) : (
          <form className="card pad stack enter" onSubmit={submit}>
            <label className="field"><span>Your name</span>
              <input className="input" type="text" name="username" id="username" autoComplete="username" autoCapitalize="words" placeholder="First and last name" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
              <small className="muted">Or the email you signed up with.</small>
            </label>
            <label className="field"><span>Password</span>
              <input className="input" type="password" name="password" id="password" autoComplete="current-password" autoFocus={!!email} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            {pk && <button type="button" className="btn ghost pkBtn" disabled={busy} onClick={passkey}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 11v3M8.5 8a5 5 0 0 1 8 4v1M7 12a5 5 0 0 0 1 3M12 18c-1.5 0-2.5-1-3-2M16 16c-.5 1.5-1.5 2.5-2.5 3" /></svg>Use fingerprint or Face ID</button>}
            <button type="button" className="btn link" style={{ alignSelf: 'center' }} disabled={busy} onClick={forgot}>Forgot password?</button>
            {sent && <div className="note ok" role="status">Check your email for a link to set a new password. It can take a minute; check spam too.</div>}
          </form>
        )}
        {notice && <div className="note ok enter" role="status">{notice}</div>}
        {!demo && (
          <div className="card pad stack center enter" style={{ textAlign: 'center' }}>
            <b>New to the store team?</b>
            <button className="btn ghost" onClick={onCreate}>Create an account</button>
          </div>
        )}
      </main>
    </div>
  );
}
