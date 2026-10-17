// App-wide feedback: styled confirm sheets, toasts, offline banner, haptic taps.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './fx';

interface Ask { title: string; body?: ReactNode; yes: string; no?: string; tone?: 'danger' | 'go'; resolve: (v: boolean) => void }
interface Toast { id: number; text: string; tone?: 'ok' | 'warn' }

let pushAsk: ((a: Ask) => void) | null = null;
let pushToast: ((t: Toast) => void) | null = null;
let nextId = 1;

/** A styled replacement for window.confirm(). Resolves true when the person agrees. */
export function ask(o: Omit<Ask, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushAsk) { resolve(window.confirm(o.title)); return; }
    pushAsk({ ...o, resolve });
  });
}

/** A short message at the bottom of the screen. */
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  pushToast?.({ id: nextId++, text, tone });
}

/** Light tap on phones that support it. */
export function buzz(ms = 8) {
  try { if (matchMedia('(pointer: coarse)').matches) navigator.vibrate?.(ms); } catch { /* ignore */ }
}

export function FeedbackHost() {
  const [a, setA] = useState<Ask | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    pushAsk = setA;
    pushToast = (t) => {
      setToasts((x) => [...x.slice(-2), t]);
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 2600);
    };
    const off = () => setOnline(false);
    const on = () => { setOnline(true); toast('Back online'); };
    const tap = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('button, a.btn')) buzz(); };
    window.addEventListener('offline', off); window.addEventListener('online', on);
    document.addEventListener('click', tap, true);
    return () => { pushAsk = null; pushToast = null; window.removeEventListener('offline', off); window.removeEventListener('online', on); document.removeEventListener('click', tap, true); };
  }, []);

  useEffect(() => {
    if (!a) return;
    yesRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [a]);

  const answer = (v: boolean) => { a?.resolve(v); setA(null); };

  return (
    <>
      {!online && <div className="offline" role="status"><span className="pulseDot gold" />You’re offline. Entries can’t be saved until the connection is back.</div>}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`}><Icon name={t.tone === 'warn' ? 'clock' : 'checkin'} size={18} />{t.text}</div>)}
      </div>
      {a && (
        <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
          <section className={`sheet askSheet ${a.tone ?? ''}`} role="alertdialog" aria-modal="true" aria-labelledby="askTitle">
            <div className="sheetHandle" aria-hidden />
            <h3 id="askTitle">{a.title}</h3>
            {a.body && <div className="askBody">{a.body}</div>}
            <div className="askBtns">
              <button className="btn ghost" onClick={() => answer(false)}>{a.no ?? 'Cancel'}</button>
              <button ref={yesRef} className={`btn ${a.tone === 'danger' ? 'danger' : 'accent'}`} onClick={() => answer(true)}>{a.yes}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
