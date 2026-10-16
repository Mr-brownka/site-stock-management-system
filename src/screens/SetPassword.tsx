import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

/** Shown when the app is opened from a password-reset email. */
export function SetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    if (pw !== pw2) { setErr('The two passwords are different.'); return; }
    setBusy(true); setErr('');
    try { await api.setPassword(pw); onDone(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="phone">
      <header className="top" style={{ padding: '40px 20px 28px' }}>
        <div className="kicker"><span>SITE STOCK MANAGEMENT SYSTEM</span></div>
        <h1>Set a new password</h1>
        <div className="sub">Choose a password you will remember</div>
      </header>
      <main className="body">
        <form className="card pad stack enter" onSubmit={submit}>
          <label className="field"><span>New password</span>
            <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus />
          </label>
          <label className="field"><span>Type it again</span>
            <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </label>
          {err && <div className="note err" role="alert">{err}</div>}
          <button className="btn accent" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      </main>
    </div>
  );
}
