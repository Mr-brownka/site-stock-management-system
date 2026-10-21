// All dates are site dates in Nairobi time, written as YYYY-MM-DD.
const TZ = 'Africa/Nairobi';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function nowTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function parse(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}

/** "Thu 15 Oct" */
export function niceDate(d: string): string {
  const x = parse(d);
  return `${WD[x.getUTCDay()]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
}

/** "Thu 15 Oct 2026" */
export function longDate(d: string): string {
  return `${niceDate(d)} ${d.slice(0, 4)}`;
}

export function weekday(d: string): string {
  return WD[parse(d).getUTCDay()];
}

export type Period = 'day' | 'week' | 'month';

/** The date range a period covers around a chosen date (weeks start on Monday). */
export function periodRange(period: Period, d: string): { from: string; to: string; label: string } {
  if (period === 'day') return { from: d, to: d, label: niceDate(d) };
  if (period === 'week') {
    const x = parse(d);
    const back = (x.getUTCDay() + 6) % 7;
    const from = addDays(d, -back);
    return { from, to: addDays(from, 6), label: `week of ${niceDate(from)}` };
  }
  const x = parse(d);
  const from = `${d.slice(0, 8)}01`;
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0));
  return { from, to: iso(last), label: `${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` };
}

/** Each date from..to inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Monday" */
export function weekdayName(d: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parse(d).getUTCDay()];
}
