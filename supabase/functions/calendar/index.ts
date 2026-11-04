// 31 · Deliveries in your calendar. Calendar apps read this private link (…/calendar?t=TOKEN) a few times a day.
// It lists every delivery Zoho expects at the person's site (from the last Zoho check), as all-day events.
// Moved dates move; delivered, removed or cancelled orders drop off by themselves.
import { admin } from '../_shared/zoho.ts';

type Line = { name: string; ordered: number; received: number; unit?: string | null };
type Order = { id: string; po: string; vendor?: string | null; expected?: string | null; late?: boolean; subphase?: string | null; lines: Line[] };

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (l: string) => { const out: string[] = []; let s = l; while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); } out.push(s); return out.join('\r\n'); };
const ymd = (d: string) => d.replaceAll('-', '');
const next = (d: string) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ''));

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  const db = admin();
  const { data: feed } = t.length >= 20 ? await db.from('calendar_feeds').select('user_id').eq('token', t).maybeSingle() : { data: null };
  if (!feed) return new Response('Not found', { status: 404 });
  const { data: prof } = await db.from('profiles').select('site_id, status').eq('id', feed.user_id).maybeSingle();
  if (!prof?.site_id || prof.status !== 'approved') return new Response('Not found', { status: 404 });
  const [{ data: site }, { data: cache }, { data: gone }] = await Promise.all([
    db.from('sites').select('name').eq('id', prof.site_id).maybeSingle(),
    db.from('zoho_incoming_cache').select('body, checked_at').eq('site_id', prof.site_id).maybeSingle(),
    db.from('incoming_dismissed').select('po_id').eq('site_id', prof.site_id),
  ]);
  const body = (cache?.body ?? {}) as { thisWeek?: Order[]; nextWeek?: Order[]; part?: Order[]; today?: string };
  const today = body.today ?? new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const skip = new Set((gone ?? []).map((g) => g.po_id));
  const seen = new Set<string>();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev: string[] = [];
  const add = (o: Order, late: boolean) => {
    if (seen.has(o.id) || skip.has(o.id)) return;
    seen.add(o.id);
    const day = late ? today : o.expected;
    if (!day) return;
    const owed = o.lines.filter((l) => l.ordered - l.received > 0);
    if (!owed.length) return;
    const first = owed[0];
    const title = `${late ? 'Late · ' : ''}${o.vendor ?? 'Delivery'}, ${n(first.ordered - first.received)} ${first.unit ?? ''}`.trim() + (owed.length > 1 ? ` +${owed.length - 1}` : '');
    const desc = [`${o.po}${o.subphase ? ` · ${o.subphase}` : ''}${late && o.expected ? ` · was due ${o.expected}` : ''}`, ...owed.map((l) => `${l.name}: ${n(l.ordered - l.received)} ${l.unit ?? ''}`.trim()), 'From Ostock (Zoho Books)'].join('\n');
    ev.push('BEGIN:VEVENT', `UID:${o.id}@ostock.co.ke`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next(day))}`,
      fold(`SUMMARY:${esc('Ostock · ' + title)}`), fold(`DESCRIPTION:${esc(desc)}`), fold(`LOCATION:${esc(`${site?.name ?? 'Site'} store`)}`), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc('Delivery tomorrow: ' + title)}`), 'TRIGGER:-PT7H', 'END:VALARM', 'END:VEVENT');
  };
  (body.part ?? []).filter((o) => o.late).forEach((o) => add(o, true));
  (body.thisWeek ?? []).forEach((o) => add(o, false));
  (body.nextWeek ?? []).forEach((o) => add(o, false));
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ostock//Deliveries//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(`Ostock · ${site?.name ?? 'Deliveries'}`)}`), 'X-WR-TIMEZONE:Africa/Nairobi', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H',
    ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="ostock-deliveries.ics"' } });
});
