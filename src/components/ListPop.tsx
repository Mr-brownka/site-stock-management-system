import { useEffect } from 'react';
import { Icon } from './fx';

/** Keys while an item's pop-up is open: Esc closes, ← → step through the list. */
export function usePopKeys(open: boolean, close: () => void, step: (d: 1 | -1) => void) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && e.key !== 'Escape') return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open, close, step]);
}

/** ‹ › and close, top right of the pop-up. */
export function PopNav({ idx, total, step, close }: { idx: number; total: number; step: (d: 1 | -1) => void; close: () => void }) {
  return (
    <div className="lpNav">
      {total > 1 && <span className="lpPos mono">{idx + 1} / {total}</span>}
      {total > 1 && <button className="lpBtn" onClick={() => step(-1)} disabled={idx <= 0} aria-label="Previous item"><Icon name="chevL" size={16} /></button>}
      {total > 1 && <button className="lpBtn next" onClick={() => step(1)} disabled={idx >= total - 1} aria-label="Next item"><Icon name="chevL" size={16} /></button>}
      <button className="lpBtn x" onClick={close} aria-label="Close"><Icon name="close" size={18} /></button>
    </div>
  );
}
