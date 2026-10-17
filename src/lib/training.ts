// Training mode: practise on a copy of the real site's data. Nothing reaches the real store.
import { today } from './dates';
import { buildAstanaTraining } from './trainingData';
import type { Backend, User } from './types';

const FLAG = 'ssms-training';
export const TRAINING_KEY = 'ssms-training-store';

export function isTraining(): boolean {
  try { return sessionStorage.getItem(FLAG) === '1' && !!localStorage.getItem(TRAINING_KEY); } catch { return false; }
}

/** Build the Astana practice store (realistic 60 days) and reload into training. */
export async function startTraining(source: Backend, user: User) {
  const items = await source.items();
  const store = buildAstanaTraining(items, { email: user.email, name: user.name }, today());
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
