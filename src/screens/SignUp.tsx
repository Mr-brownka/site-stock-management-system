import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import type { SiteInfo } from '../lib/types';

/** Store members create their own account; the admin approves it before it can be used. */
export function SignUp({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [site, setSite] = useState('');
  const [role, setRole] = useState<'store' | 'assistant'>('store');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.signupSites().then(setSites).catch(() => setSites([])); }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = !name.trim() ? 'Enter your full name.' : !email.trim() ? 'Enter your email.'
      : password.length < 8 ? 'Use a password of at least 8 characters.' : !site ? 'Choose your site.' : null;
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await api.signUp({ email: email.trim(), password, full_name: name.trim(), phone: '', site_id: site, role });
      onDone();
    } catch (x) {
      const m = (x as Error).message;
      setErr(/already registered/i.test(m) ? 'This email already has an account. Go back and sign in.' : /signups? not allowed/i.test(m) ? 'New accounts are switched off right now. Ask the admin.' : m);
    } finally { setBusy(false); }
  };

  const company = sites[0]?.company;
  return (
    <div className="phone">
      <header className="top">
        <button className="back" onClick={onBack}>← Back to sign in</button>
        <div className="kicker"><span>{company ? company.toUpperCase() : 'SITE STOCK'}</span></div>
        <h1>Create an account</h1>
        <div className="sub">The admin approves every new account before it can be used.</div>
      </header>
      <main className="body">
        <form className="stack enter" onSubmit={submit}>
          <label className="field"><span>Full name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus placeholder="e.g. Peter Otieno" /></label>
          <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" /></label>
          <label className="field"><span>Create a password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" /></label>
          <div className="field"><span>Your site</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }} role="group" aria-label="Your site">
              {sites.map((s) => (
                <button type="button" key={s.id} aria-pressed={site === s.id} onClick={() => setSite(s.id)}
                  style={{ minHeight: 50, borderRadius: 12, border: `2px solid ${site === s.id ? 'var(--accent)' : '#C9CFCB'}`, background: site === s.id ? 'var(--accent-soft)' : '#fff', fontWeight: 700 }}>{s.name}</button>
              ))}
              {!sites.length && <span className="small muted">Loading sites…</span>}
            </div>
          </div>
          <div className="field"><span>Your role</span>
            <div className="seg" role="group" aria-label="Your role" style={{ display: 'flex' }}>
              <button type="button" style={{ flex: 1 }} aria-pressed={role === 'store'} onClick={() => setRole('store')}>Store</button>
              <button type="button" style={{ flex: 1 }} aria-pressed={role === 'assistant'} onClick={() => setRole('assistant')}>Assistant</button>
            </div>
          </div>
          {err && <div className="note err" role="alert">{err}</div>}
          <button className="btn accent" disabled={busy}>{busy ? 'Sending…' : 'Request access'}</button>
        </form>
      </main>
    </div>
  );
}

/** Shown to anyone signed in whose account the admin hasn't approved yet. */
export function Waiting({ name, status, onCheck, onSignOut }: { name: string; status: string; onCheck: () => void; onSignOut: () => void }) {
  const declined = status === 'declined' || status === 'removed';
  return (
    <div className="phone">
      <header className="top" style={{ background: declined ? 'var(--error)' : 'var(--accent-dark)' }}>
        <div className="kicker"><span>SITE STOCK</span></div>
        <h1>{declined ? 'No access' : 'Account created'}</h1>
        <div className="sub" style={{ color: 'rgba(255,255,255,.85)' }}>{name}</div>
      </header>
      <main className="body center" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 64, animation: 'pop .4s ease-out' }} aria-hidden>{declined ? '🚫' : '⏳'}</div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 1.1 }}>{declined ? 'The admin has not given this account access' : 'Awaiting the admin’s permission'}</h2>
        <p className="muted" style={{ maxWidth: 320, margin: 0 }}>{declined ? 'Speak to the admin if you think this is a mistake.' : 'Your request has been sent. You can use the system once the admin approves it.'}</p>
        {!declined && (
          <div className="card pad stack" style={{ width: '100%', textAlign: 'left' }}>
            <div className="between"><span>Account created</span><span className="pill done">✓ Done</span></div>
            <div className="between"><span>Admin approval</span><span className="pill">Waiting</span></div>
          </div>
        )}
        {!declined && <button className="btn ghost" onClick={onCheck}>Check again</button>}
        <button className="btn link" onClick={onSignOut}>Sign out</button>
      </main>
    </div>
  );
}
