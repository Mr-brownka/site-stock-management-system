import { Wordmark } from '../components/Brand';
import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export function Login({ onIn, onCreate, notice }: { onIn: () => void; onCreate: () => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const demo = api.mode === 'demo';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.signIn(email.trim(), password); onIn(); }
    catch (x) { setErr((x as Error).message === 'Invalid login credentials' ? 'Email or password is wrong.' : (x as Error).message); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) { setErr('Type your email first, then tap “Forgot password?”.'); return; }
    setBusy(true); setErr('');
    try { await api.sendPasswordReset(email.trim()); setSent(true); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="phone">
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
            <label className="field"><span>Email</span>
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="field"><span>Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {err && <div className="note err" role="alert">{err}</div>}
            <button className="btn accent" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
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
