import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { toast } from './feedback';

/** Anyone can change their own password at any time (the admin sets the first one). */
export function ChangePassword({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const save = async () => {
    if (pw.length < 6) { setErr('Use at least 6 characters.'); return; }
    if (pw !== again) { setErr('The two passwords are not the same.'); return; }
    setBusy(true); setErr('');
    try { await api.setPassword(pw); toast('Password changed'); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dayAsk cpSheet" role="dialog" aria-modal="true" aria-labelledby="cpT">
        <h2 id="cpT">Change your password</h2>
        <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        <label className="field"><span>Type it again</span><input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></label>
        {err && <div className="note err" role="alert">{err}</div>}
        <div className="row" style={{ gap: 10 }}><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save password'}</button></div>
      </section>
    </div>, document.body);
}
