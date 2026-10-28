import type { Screen } from './store';
import type { User } from './types';

/** The pages the admin can turn on or off for a person (menu sections). */
export const PAGES: { key: string; label: string; screens: Screen[] }[] = [
  { key: 'home', label: 'Dashboard', screens: ['home', 'welcome', 'submitted'] },
  { key: 'incoming', label: 'Coming in', screens: ['incoming'] },
  { key: 'items', label: 'Items · balances · consumption', screens: ['dashboard', 'balances', 'consumption'] },
  { key: 'stocktake', label: 'Stock take', screens: ['stocktake'] },
  { key: 'deliveries', label: 'Deliveries', screens: ['rec-deliveries', 'deliveries'] },
  { key: 'issued', label: 'Issued items', screens: ['rec-issued', 'issued'] },
  { key: 'returns', label: 'Returned items', screens: ['rec-returns', 'returns'] },
  { key: 'transfers', label: 'Project transfers', screens: ['rec-transfers', 'transfers'] },
  { key: 'reports', label: 'Reports', screens: ['reports', 'records'] },
  { key: 'corrections', label: 'Fix an error', screens: ['corrections'] },
];
/** Screens that change stock: never open for someone who can only read. */
const WRITE: Screen[] = ['deliveries', 'issued', 'returns', 'transfers', 'corrections', 'stocktake'];

export const canEdit = (u: User) => u.role === 'admin' || (u.role !== 'procurement' && (u.access ?? 'edit') === 'edit');

/** May this person open this screen? */
export function canSee(u: User, s: Screen): boolean {
  if (u.role === 'admin') return true;
  if (!canEdit(u) && WRITE.includes(s)) return false;
  if (!u.pages) return true;
  const page = PAGES.find((p) => p.screens.includes(s));
  return !page || u.pages.includes(page.key);
}
/** Where to land when a screen is not allowed. */
export function firstAllowed(u: User): Screen {
  for (const p of PAGES) for (const s of p.screens) if (canSee(u, s) && !WRITE.includes(s)) return s;
  return 'home';
}
/** "Admin", "Store keeper", "Procurement · view only" … */
export const roleLabel = (u: User) => `${{ admin: 'Admin', store: 'Store keeper', assistant: 'Assistant', procurement: 'Procurement' }[u.role] ?? 'Store keeper'}${u.role !== 'admin' && !canEdit(u) ? ' · view only' : ''}`;
