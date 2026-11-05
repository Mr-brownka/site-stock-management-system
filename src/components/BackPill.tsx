import { useLayoutEffect, useRef, useState } from 'react';
import { useData } from '../lib/store';
import { currentScreen, goBack, SCREEN_LABEL } from '../lib/nav';
import { Icon } from './fx';
import { useIsPhone } from './Ring';

/** The one back button.
 *  Laptop: the small "← Back" above the page title.
 *  Phone: the same bar as the Deliveries list (← and the page title, pinned at the top). The page's own title is
 *  moved into the bar, so it isn't shown twice. */
export function BackPill({ label, onClick, title }: { label?: string; onClick?: () => void; title?: string }) {
  const { go } = useData();
  const phone = useIsPhone();
  const cur = currentScreen();
  const ref = useRef<HTMLElement>(null);
  const [found, setFound] = useState('');
  useLayoutEffect(() => {
    if (!phone || title) return;
    const box = ref.current?.closest('.page, .entryPage, .stEnterPage') ?? ref.current?.parentElement?.parentElement;
    const h = box?.querySelector<HTMLElement>('h1:not(.pTitle)');
    if (h) { h.classList.add('pDupTitle'); if (h.textContent !== found) setFound(h.textContent ?? ''); }
  });
  const back = onClick ?? (() => goBack(go, cur));
  if (phone) {
    return (
      <header ref={ref} className="pTop pBackBar">
        <button className="pBack" onClick={back} aria-label={label && label !== 'Back' ? `Back to ${label}` : 'Back'}><Icon name="chevL" size={24} /></button>
        <h1 className="pTitle">{title ?? (found || SCREEN_LABEL[cur] || label || '')}</h1>
      </header>
    );
  }
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} className="backPill" onClick={back}>
      <Icon name="arrowL" size={16} />{label ?? 'Back'}
    </button>
  );
}
