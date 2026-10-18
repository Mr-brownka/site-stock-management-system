/**
 * Small app-wide touches, added once:
 * - a soft ripple from where you tap on buttons, rows and cards;
 * - a gold spotlight that follows the pointer across cards (mouse only).
 * Both are skipped when the person asks for reduced motion.
 */
const RIPPLE = '.btn, .kpi, .railLink, .procRow, .plusBtn, .attRow, .repCard, .cmdRow, .lateBtn, .siteSwitch, .yesno button, .tabbar button';
const SPOT = '.kpi, .panel, .repCard, .lineTblWrap, .tblWrap';

export function installFx() {
  if (typeof window === 'undefined') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  document.addEventListener('pointerdown', (e) => {
    const host = (e.target as HTMLElement).closest<HTMLElement>(RIPPLE);
    if (!host || (host as HTMLButtonElement).disabled) return;
    const r = host.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = dot.style.height = `${size}px`;
    dot.style.left = `${e.clientX - r.left - size / 2}px`;
    dot.style.top = `${e.clientY - r.top - size / 2}px`;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.classList.add('rippleHost');
    host.appendChild(dot);
    setTimeout(() => dot.remove(), 650);
  }, { passive: true });

  if (!window.matchMedia?.('(pointer: fine)').matches) return;
  let raf = 0; let last: PointerEvent | null = null;
  document.addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = last!; const el = (ev.target as HTMLElement).closest<HTMLElement>(SPOT);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
      el.style.setProperty('--my', `${ev.clientY - r.top}px`);
    });
  }, { passive: true });
}
