// Training mode: practise on a copy of the real site's data. Nothing reaches the real store.
import { buildTrainingStore } from './demoBackend';
import { addDays, today } from './dates';
import type { Backend, User } from './types';

const FLAG = 'ssms-training';
export const TRAINING_KEY = 'ssms-training-store';

export function isTraining(): boolean {
  try { return sessionStorage.getItem(FLAG) === '1' && !!localStorage.getItem(TRAINING_KEY); } catch { return false; }
}

/** Copy the real site's items, stock and last 4 weeks of entries, then reload into training. */
export async function startTraining(live: Backend, user: User) {
  const day = today();
  const [items, balances, docs, names] = await Promise.all([live.items(), live.balances(), live.documents(addDays(day, -28), day), live.siteName()]);
  const store = buildTrainingStore({ items, balances, docs, company: names.company, site: names.site, user: { email: user.email, name: user.name, role: user.role }, today: day });
  localStorage.setItem(TRAINING_KEY, JSON.stringify(store));
  localStorage.setItem(`${TRAINING_KEY}-backup`, JSON.stringify(store));
  sessionStorage.setItem(FLAG, '1');
  history.replaceState(null, '', '/#/home');
  location.reload();
}

/** Undo everything practised so far and start again from the copy. */
export function resetTraining() {
  const b = localStorage.getItem(`${TRAINING_KEY}-backup`);
  if (b) localStorage.setItem(TRAINING_KEY, b);
  history.replaceState(null, '', '/#/home');
  location.reload();
}

export function exitTraining() {
  sessionStorage.removeItem(FLAG);
  history.replaceState(null, '', '/#/home');
  location.reload();
}
