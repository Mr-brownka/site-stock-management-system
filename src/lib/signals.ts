/**
 * Tiny cross-screen signals: "open this item", "show today's entries".
 * The signal is kept until a screen picks it up, so it also works when the
 * target screen is not mounted yet (e.g. from the search on another page).
 */
import { useEffect } from 'react';

const pending = new Map<string, unknown>();

export function signal(name: string, detail: unknown = true) {
  pending.set(name, detail);
  window.dispatchEvent(new CustomEvent(`ssms:${name}`, { detail }));
}

export function useSignal<T = unknown>(name: string, fn: (detail: T) => void) {
  useEffect(() => {
    if (pending.has(name)) { const d = pending.get(name) as T; pending.delete(name); setTimeout(() => fn(d), 0); }
    const on = (e: Event) => { pending.delete(name); fn((e as CustomEvent<T>).detail); };
    window.addEventListener(`ssms:${name}`, on);
    return () => window.removeEventListener(`ssms:${name}`, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
