import { useEffect, useState } from 'react';
import { dropOut, flushNow, outbox, type OutItem } from '../lib/offline';
import { api } from '../lib/api';
import { Icon } from './fx';
import { toast } from './feedback';

/** 16 · "No signal" and "n waiting to send", always in view while it matters. Tap to see what is waiting. */
export function OutboxBadge() {
  const [q, setQ] = useState<OutItem[]>(outbox);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setQ(outbox());
    const net = () => setOnline(navigator.onLine !== false);
    const sent = (e: Event) => { const n = (e as CustomEvent<number>).detail; toast(`Signal back · ${n} entr${n === 1 ? 'y' : 'ies'} sent`, 'ok'); };
    window.addEventListener('ostock-outbox', on); window.addEventListener('online', net); window.addEventListener('offline', net); window.addEventListener('ostock-sent', sent);
    return () => { window.removeEventListener('ostock-outbox', on); window.removeEventListener('online', net); window.removeEventListener('offline', net); window.removeEventListener('ostock-sent', sent); };
  }, []);
  if (api.mode !== 'live' || (online && !q.length)) return null;
  const refused = q.filter((x) => x.error);
  const waiting = q.length - refused.length;
  const text = refused.length ? `${refused.length} not sent · tap` : !online ? (waiting ? `No signal · ${waiting} waiting to send` : 'No signal · entries are kept on this phone') : `Sending ${waiting}…`;
  return (
    <>
      <button type="button" className={`obBadge ${refused.length ? 'bad' : !online ? 'off' : 'send'}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-live="polite">
        <Icon name={refused.length ? 'warn' : !online ? 'clock' : 'refresh'} size={15} />{text}
      </button>
      {open && (
        <div className="obPop" role="dialog" aria-label="Waiting to send">
          <header><b>{online ? 'Waiting to send' : 'No signal'}</b><button className="iconBtn" onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button></header>
          <p>{online ? 'These go to the system in the order you made them.' : 'Keep working. What you enter stays on this phone and goes to the system by itself when the network is back.'}</p>
          {!q.length && <p className="muted">Nothing waiting.</p>}
          <ul>
            {q.map((x) => (
              <li key={x.id} className={x.error ? 'bad' : ''}>
                <span><b>{x.label}</b><small>{new Date(x.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}{x.error ? ` · Not accepted: ${x.error}` : ' · waiting'}</small></span>
                {x.error && <button className="btn ghost sm" onClick={() => dropOut(x.id)}>Remove</button>}
              </li>
            ))}
          </ul>
          {online && waiting > 0 && <button className="btn accent" disabled={busy} onClick={async () => { setBusy(true); try { await flushNow(); } finally { setBusy(false); } }}>{busy ? 'Sending…' : 'Send now'}</button>}
        </div>
      )}
    </>
  );
}
