import type { Line } from './types';

export const NO_FLOOR = 'No floor given';

export interface ItemUse { issued: number; returned: number; used: number; byFloor: Map<string, number>; byDay: Map<string, number> }

/** What the site used: issued minus what came back (approved fixes included). Per item, per floor, per day. */
export function consumption(lines: Line[], floor?: string | null): Map<number, ItemUse> {
  const m = new Map<number, ItemUse>();
  const get = (id: number) => m.get(id) ?? (m.set(id, { issued: 0, returned: 0, used: 0, byFloor: new Map(), byDay: new Map() }), m.get(id)!);
  const issueSub = new Map(lines.filter((l) => l.kind === 'issue').map((l) => [l.id, l.subphase]));
  for (const l of lines) {
    let sign = 0;
    let sub: string | null = l.subphase;
    if (l.kind === 'issue') sign = 1;
    else if (l.kind === 'return') { sign = -1; sub = l.subphase ?? (l.return_of ? issueSub.get(l.return_of) ?? null : null); }
    else if (l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return')) sign = -1;
    else continue;
    const f = sub || NO_FLOOR;
    if (floor && f !== floor) continue;
    const u = get(l.item_id);
    const v = sign * l.qty;
    if (l.kind === 'issue') u.issued += l.qty;
    else if (l.kind === 'return') u.returned += l.qty;
    else if (l.corrects_kind === 'issue') u.issued -= l.qty; else u.returned += l.qty;
    u.used += v;
    u.byFloor.set(f, (u.byFloor.get(f) ?? 0) + v);
    u.byDay.set(l.move_date, (u.byDay.get(l.move_date) ?? 0) + v);
  }
  return m;
}
