import type { Screen } from './store';
import type { Access, Role, User } from './types';

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

/** The roles, in the order the admin sees them, with their names. */
export const ROLES: { key: Role; label: string }[] = [
  { key: 'store', label: 'Stores' },
  { key: 'site_manager', label: 'Site manager' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'coo', label: 'COO' },
  { key: 'ceo', label: 'CEO' },
  { key: 'project_manager', label: 'Project manager' },
  { key: 'admin', label: 'Admin' },
];
export const ROLE_NAME = Object.fromEntries(ROLES.map((r) => [r.key, r.label])) as Record<Role, string>;
/** What a role may do unless the admin changes it: Stores edit everything, everyone else views. */
export const ROLE_DEFAULT: Record<Role, { access: Access; pages: string[] | null }> = {
  admin: { access: 'edit', pages: null },
  store: { access: 'edit', pages: null },
  site_manager: { access: 'read', pages: ['home', 'incoming', 'items', 'stocktake', 'deliveries', 'issued', 'returns', 'transfers'] },
  procurement: { access: 'read', pages: ['home', 'incoming', 'items', 'stocktake', 'deliveries', 'transfers'] },
  accounts: { access: 'read', pages: ['home', 'items', 'deliveries', 'issued', 'returns', 'transfers', 'reports'] },
  coo: { access: 'read', pages: null },
  ceo: { access: 'read', pages: null },
  project_manager: { access: 'read', pages: ['home', 'incoming', 'items', 'stocktake', 'deliveries', 'issued', 'returns', 'transfers', 'reports'] },
};

/** Can change things: the admin always; others when their role edits and they haven't been switched to view only. */
export const canEdit = (u: User) => u.role === 'admin' || ((u.roleAccess ?? ROLE_DEFAULT[u.role]?.access ?? 'read') === 'edit' && (u.access ?? 'edit') === 'edit');

/** May this person open this screen? */
export function canSee(u: User, s: Screen): boolean {
  if (u.role === 'admin') return true;
  // Stock take opens read only (view and download); the other write pages stay closed.
  if (!canEdit(u) && WRITE.includes(s) && s !== 'stocktake') return false;
  if (!u.pages) return true;
  // On the phone everyone may open Records; each card in it still follows the pages they are allowed.
  if (s === 'records' && typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches) return true;
  // The low stock list behind "Review all" opens for anyone who sees the dashboard.
  if (s === 'dashboard' && u.pages.includes('home')) return true;
  const page = PAGES.find((p) => p.screens.includes(s));
  return !page || u.pages.includes(page.key);
}
/** Where to land when a screen is not allowed. */
export function firstAllowed(u: User): Screen {
  for (const p of PAGES) for (const s of p.screens) if (canSee(u, s) && (!WRITE.includes(s) || s === 'stocktake')) return s;
  return 'home';
}
/** "Admin", "Store keeper", "Procurement · view only" … */
export const roleLabel = (u: User) => `${ROLE_NAME[u.role] ?? 'Stores'}${u.role !== 'admin' && !canEdit(u) ? ' · view only' : ''}`;
