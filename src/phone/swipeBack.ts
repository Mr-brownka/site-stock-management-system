import { useEffect } from 'react';
import { goBack } from '../lib/nav';
import type { Screen } from '../lib/store';

/** Phone: drag from the left edge to go back. The page follows the finger; let go past a third (or flick) and it slides away. */
export function useSwipeBack(screen: Screen, go: (s: Screen) => void) {
  useEffect(() => {
    if (!matchMedia('(max-width: 767px)').matches) return;
    let x0 = 0, y0 = 0, t0 = 0, dx = 0, on = false, locked = false;
    const page = () => document.querySelector<HTMLElement>('.shellMain > .screen');
    const popupOpen = () => !!document.querySelector('.sheetBack, .consDetail.open, .evPage, .mSheetBack, .cmdBack, .incBack, .ppBack, .dayAskBack, [aria-modal="true"]');
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      on = t.clientX < 24 && screen !== 'home' && !popupOpen(); locked = false;
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); dx = 0;
    };
    const move = (e: TouchEvent) => {
      if (!on) return;
      const t = e.touches[0]; dx = Math.max(0, t.clientX - x0);
      if (!locked) { if (Math.abs(t.clientY - y0) > 12 && Math.abs(t.clientY - y0) > dx) { on = false; return; } if (dx > 8) locked = true; else return; }
      const el = page(); if (!el) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${dx}px)`;
      el.style.boxShadow = '-16px 0 32px rgba(0,0,0,.12)';
    };
    const end = () => {
      if (!on || !locked) { on = false; return; }
      on = false;
      const el = page(); if (!el) return;
      const w = window.innerWidth, fast = dx / Math.max(1, Date.now() - t0) > 0.6;
      if (dx > w / 3 || (fast && dx > 40)) {
        el.style.transition = 'transform .22s cubic-bezier(.3,.8,.2,1)';
        el.style.transform = `translateX(${w}px)`;
        setTimeout(() => {
          el.style.transition = ''; el.style.transform = ''; el.style.boxShadow = '';
          if ((history.state as { sub?: string } | null)?.sub) history.back(); else goBack(go, screen);
        }, 200);
      } else {
        el.style.transition = 'transform .25s cubic-bezier(.3,1.3,.4,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; el.style.boxShadow = ''; }, 260);
      }
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => { document.removeEventListener('touchstart', start); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end); };
  }, [screen, go]);
}
