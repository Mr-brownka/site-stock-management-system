import type { Screen } from './store';

/** The pages visited, so "back" returns to the page the person came from (not the browser's idea of it). */
const stack: Screen[] = [];
let backing = false;
const ENTRY: Screen[] = ['deliveries', 'issued', 'returns', 'transfers'];
/** Where "back" goes when there is no earlier page (opened from the menu or a link). */
const PARENT: Partial<Record<Screen, Screen>> = {
  deliveries: 'rec-deliveries', issued: 'rec-issued', returns: 'rec-returns', transfers: 'rec-transfers',
};
export const SCREEN_LABEL: Record<Screen, string> = {
  home: 'Dashboard', dashboard: 'Dashboard', welcome: 'Dashboard', submitted: 'Today’s summary', stocktake: 'Stock take', corrections: 'Fix an error', reports: 'Reports',
  deliveries: 'New delivery', issued: 'Issuance register', returns: 'New return', transfers: 'New transfer',
  'rec-deliveries': 'Deliveries', 'rec-issued': 'Issued items', 'rec-returns': 'Returned items', 'rec-transfers': 'Project transfers', consumption: 'Consumption', balances: 'Balances', records: 'Records', incoming: 'Coming in', me: 'Me',
};

export function recordScreen(s: Screen) {
  if (backing) {
    backing = false;
    while (stack.length && stack[stack.length - 1] !== s) stack.pop();
    if (!stack.length) stack.push(s);
    return;
  }
  if (stack[stack.length - 1] !== s) stack.push(s);
  if (stack.length > 40) stack.shift();
}
export function backTarget(cur: Screen): Screen {
  // Pages opened from the dashboard tiles always go back to the dashboard.
  if (cur === 'balances' || cur === 'consumption' || cur === 'incoming') return 'home';
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s !== cur && !ENTRY.includes(s) && s !== 'welcome') return s === 'dashboard' ? 'home' : s;
  }
  return PARENT[cur] ?? 'home';
}
export function goBack(go: (s: Screen) => void, cur: Screen) { const t = backTarget(cur); backing = true; go(t); }
export const currentScreen = (): Screen => (location.hash.replace('#/', '') || 'home') as Screen;
