import type { Screen } from './store';
import type { Doc } from './types';

// "Fix an error" from a record: Fix an error opens straight on that entry.
const KEY = 'ssms-fix-doc';
export function openFixFor(go: (s: Screen) => void, doc: Doc) {
  try { sessionStorage.setItem(KEY, JSON.stringify(doc)); } catch { /* blocked */ }
  go('corrections');
}
/** The entry to open, once (it is cleared when read). */
export function takeFixDoc(): Doc | null {
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v ? (JSON.parse(v) as Doc) : null; } catch { return null; }
}
