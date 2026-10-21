// Project week number.
// The admin (or the first storekeeper) says which week of the project it is; the app
// counts on from there. A week with no entries at all (site closed, e.g. the December
// break) does not count, so the number pauses by itself. The admin can correct it.
import { addDays } from './dates';
import type { WeekInfo } from './types';

// Work weeks run Monday to Saturday. Sunday is not a working day: it belongs to the week that starts the next day.
export const weekStart = (d: string) => {
  const wd = new Date(d + 'T00:00:00Z').getUTCDay();
  return wd === 0 ? addDays(d, 1) : addDays(d, -(wd - 1));
};

export function projectWeekNo(day: string, info: WeekInfo, entryDays: string[]): number | null {
  if (!info.anchorNo || !info.anchorDate) return null;
  const a = weekStart(info.anchorDate), cur = weekStart(day);
  if (cur <= a) return info.anchorNo;
  const active = new Set(entryDays.map(weekStart));
  let n = info.anchorNo;
  for (let w = addDays(a, 7); w < cur; w = addDays(w, 7)) if (active.has(w)) n++;
  return n + 1; // the current week always counts
}

/** Weeks skipped (no entries) between the anchor and today, for showing the admin. */
export function pausedWeeks(day: string, info: WeekInfo, entryDays: string[]): string[] {
  if (!info.anchorDate) return [];
  const a = weekStart(info.anchorDate), cur = weekStart(day);
  const active = new Set(entryDays.map(weekStart));
  const out: string[] = [];
  for (let w = addDays(a, 7); w < cur; w = addDays(w, 7)) if (!active.has(w)) out.push(w);
  return out;
}
