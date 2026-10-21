// Kenyan public holidays with fixed or known dates, to label missed days.
// Dates that move with the moon (Eid) are left out; the store just answers "open or closed".
const FIXED: Record<string, string> = {
  '01-01': 'New Year’s Day', '05-01': 'Labour Day', '06-01': 'Madaraka Day', '10-10': 'Mazingira Day',
  '10-20': 'Mashujaa Day', '12-12': 'Jamhuri Day', '12-25': 'Christmas Day', '12-26': 'Boxing Day',
};
const EASTER: Record<string, string> = {
  '2026-04-03': 'Good Friday', '2026-04-06': 'Easter Monday',
  '2027-03-26': 'Good Friday', '2027-03-29': 'Easter Monday',
  '2028-04-14': 'Good Friday', '2028-04-17': 'Easter Monday',
};
export function holidayName(day: string): string | null {
  return EASTER[day] ?? FIXED[day.slice(5)] ?? null;
}
