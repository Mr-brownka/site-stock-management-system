import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

export function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const demo = api.mode === 'demo';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.signIn(email.trim(), password); onIn(); }
    catch (x) { setErr((x as Error).message === 'Invalid login credentials' ? 'Email or password is wrong.' : (x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="phone">
      <header className="top" style={{ padding: '40px 20px 28px' }}>
        <div className="kicker"><span>SITE STOCK MANAGEMENT SYSTEM</span>{demo && <span className="badge">DEMO</span>}</div>
        <h1 style={{ fontSize: 40 }}>Site Stock</h1>
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
            <div className="small muted">Accounts are created by the system admin. Ask them if you can’t sign in.</div>
          </form>
        )}
      </main>
    </div>
  );
}
