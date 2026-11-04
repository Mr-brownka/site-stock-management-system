/** 22 · Ostock follows the phone's own text size.
 *  Android already enlarges text by itself. iPhone (Settings → Display → Text Size) needs telling: we read the size the
 *  phone wants for body text (17 px is normal) and enlarge the app by the same amount, up to 35% bigger. */
export function followTextSize() {
  if (typeof window === 'undefined' || !/iPhone|iPod/.test(navigator.userAgent)) return;
  const apply = () => {
    const probe = document.createElement('span');
    probe.style.cssText = 'font: -apple-system-body; position: absolute; visibility: hidden';
    probe.textContent = 'x';
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize) || 17;
    probe.remove();
    const r = Math.min(1.35, Math.max(1, px / 17));
    (document.documentElement.style as unknown as { zoom: string }).zoom = r > 1.02 ? String(r) : '';
  };
  apply();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') apply(); });
}
