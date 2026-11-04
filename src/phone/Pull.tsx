import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/fx';
import { useIsPhone } from '../components/Ring';
import { signal } from '../lib/signals';
import { useData } from '../lib/store';

/** 25 · Pull to refresh on every phone page: pull down from the top, let go, and the page loads fresh.
 *  Pages that load their own lists listen for the 'pull' signal. Incoming has its own (it checks Zoho). */
export function PullRefresh() {
  const phone = useIsPhone();
  const { refresh } = useData();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const cur = useRef(0);
  useEffect(() => {
    if (!phone) return;
    const blocked = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !el?.closest || !!el.closest('.pPull, [role="dialog"], .sheetBack, .actionBar, .tabbar, input, textarea, select, .mirGrid, .noPull');
    };
    const onStart = (e: TouchEvent) => { start.current = window.scrollY <= 0 && !busy && !blocked(e.target) && !document.body.classList.contains('noScroll') ? e.touches[0].clientY : null; };
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return;
      const d = e.touches[0].clientY - start.current;
      if (d <= 0 || window.scrollY > 0) { cur.current = 0; setPull(0); return; }
      cur.current = Math.min(96, d * 0.45); setPull(cur.current);
    };
    const onEnd = async () => {
      const go = cur.current >= 64;
      start.current = null; cur.current = 0; setPull(0);
      if (!go) return;
      setBusy(true);
      const t0 = Date.now();
      try { signal('pull'); await refresh(); } catch { /* the page shows its own error */ }
      setTimeout(() => setBusy(false), Math.max(0, 700 - (Date.now() - t0)));
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart); document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd); document.removeEventListener('touchcancel', onEnd);
    };
  }, [phone, busy, refresh]);
  if (!phone || (!pull && !busy)) return null;
  const y = busy ? 64 : pull;
  return (
    <div className={`pullTop ${busy ? 'busy' : ''}`} style={{ transform: `translate(-50%, ${y - 44}px)`, opacity: busy ? 1 : Math.min(1, pull / 64) }} role="status" aria-live="polite">
      <span style={{ transform: busy ? undefined : `rotate(${pull * 3.2}deg)` }}><Icon name="refresh" size={19} /></span>
      <span className="sr">{busy ? 'Loading fresh data' : pull >= 64 ? 'Let go to refresh' : 'Pull to refresh'}</span>
    </div>
  );
}
