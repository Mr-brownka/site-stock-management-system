import { lastOk } from '../components/feedback';

/** 8 · Save buttons: while one says "Saving…" it shrinks to a spinner; once the save went through it shows a tick, then goes back.
 *  Works on every button by watching its words, so no form needs changing. */
const BUSY = /^(Saving|Submitting|Sending|Removing|Deleting|Checking)…/;
export function installBusyButtons() {
  if (typeof window === 'undefined' || (window as unknown as { __busyBtn?: boolean }).__busyBtn) return;
  (window as unknown as { __busyBtn?: boolean }).__busyBtn = true;
  const mark = (b: HTMLButtonElement) => {
    const busy = BUSY.test((b.textContent ?? '').trim());
    if (busy && !b.classList.contains('isBusy')) { b.style.setProperty('--bw', `${b.offsetWidth}px`); b.classList.add('isBusy'); return; }
    if (!busy && b.classList.contains('isBusy')) {
      b.classList.remove('isBusy');
      setTimeout(() => { if (Date.now() - lastOk < 1500 && b.isConnected) { b.classList.add('isDone'); setTimeout(() => b.classList.remove('isDone'), 900); } }, 120);
    }
  };
  new MutationObserver((list) => {
    for (const m of list) {
      const el = (m.target.nodeType === 3 ? m.target.parentElement : m.target) as HTMLElement | null;
      const b = el?.closest?.('button') as HTMLButtonElement | null;
      if (b && (b.classList.contains('btn') || b.classList.contains('pBtn') || b.classList.contains('evGo') || b.classList.contains('ppSubmit'))) mark(b);
    }
  }).observe(document.body, { subtree: true, characterData: true, childList: true });
}
