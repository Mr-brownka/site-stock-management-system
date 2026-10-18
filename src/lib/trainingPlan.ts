// Storekeeper onboarding: 5 working days of practice (Mon–Sat), then the live store opens.
import { addDays, today, weekday } from './dates';
import type { User } from './types';

export const TRAINING_DAYS = 5;

export const isWorkday = (d: string) => weekday(d) !== 'Sun';

/** Admins never need training; the admin can also waive it for someone. */
export function isTrained(u: User): boolean {
  return u.role === 'admin' || !!u.trainingWaived || (u.trainingDays?.length ?? 0) >= TRAINING_DAYS;
}

export interface TrainingTile { n: number; date: string; state: 'done' | 'today' | 'ahead' }

/** Five tiles: the days already done, then the next working days ahead (today first if not done yet). */
export function trainingPlan(u: User, now = today()) {
  const done = [...(u.trainingDays ?? [])].sort().slice(0, TRAINING_DAYS);
  const doneToday = done.includes(now);
  const tiles: TrainingTile[] = done.map((date, i) => ({ n: i + 1, date, state: 'done' }));
  let d = doneToday ? addDays(now, 1) : now;
  while (tiles.length < TRAINING_DAYS) {
    if (isWorkday(d)) tiles.push({ n: tiles.length + 1, date: d, state: d === now ? 'today' : 'ahead' });
    d = addDays(d, 1);
  }
  const finished = done.length >= TRAINING_DAYS || !!u.trainingWaived;
  return { tiles, done: done.length, doneToday, finished, sunday: !isWorkday(now), lastDay: tiles[tiles.length - 1].date, nextDay: tiles[done.length]?.date ?? null };
}
