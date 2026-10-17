// Every store report, built from the same entries the check-in saves.
import { addDays, eachDay, weekday } from './dates';
import { delta, SUBPHASES, type Balance, type CorrectionRequest, type Doc, type Item, type Line, type Submission } from './types';

export interface Col { key: string; label: string; num?: boolean; total?: boolean }
export type Row = Record<string, string | number | null>;
export interface Tile { label: string; value: string | number; tone?: 'red' | 'ok' | 'gold' }
export interface Report { cols: Col[]; rows: Row[]; tiles?: Tile[]; note?: string; group?: string }

export interface Ctx {
  from: string; to: string; today: string;
  /** Every entry from `from` up to today (needed to work out past balances). */
  docs: Doc[];
  balances: Balance[];
  itemById: Map<number, Item>;
  avgUse: Map<number, number>;
  isLow: (b: Balance) => boolean;
  subs: Map<string, Submission | null>;
  corrections: CorrectionRequest[];
  itemId: number | null;
  idleDays: number;
}

export type Need = 'range' | 'asOf' | 'item' | 'subs' | 'corr' | 'idle';
export interface Def { key: string; title: string; desc: string; icon: string; group: string; needs: Need[]; build: (c: Ctx) => Report }

const r2 = (n: number) => Math.round(n * 100) / 100;
const inRange = (c: Ctx, d: string) => d >= c.from && d <= c.to;
const nm = (c: Ctx, id: number) => c.itemById.get(id)?.name ?? `Item ${id}`;
const un = (c: Ctx, id: number) => c.itemById.get(id)?.unit ?? '';
const KIND: Record<string, string> = { opening: 'Opening count', delivery: 'Delivery', issue: 'Withdrawal card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction' };
const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

/** Balance of each item at the end of a date: today's balance minus everything after it. */
export function balanceAt(c: Ctx, date: string): Map<number, number> {
  const m = new Map(c.balances.map((b) => [b.item_id, b.balance]));
  for (const d of c.docs) if (d.doc_date > date) for (const l of d.lines) m.set(l.item_id, (m.get(l.item_id) ?? 0) - delta(l.kind, l.qty));
  return m;
}

function used(lines: Line[]): number {
  let u = 0;
  for (const l of lines) {
    if (l.kind === 'issue') u += l.qty;
    else if (l.kind === 'return') u -= l.qty;
    else if (l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return')) u -= l.qty;
  }
  return u;
}

const linesIn = (c: Ctx) => c.docs.filter((d) => inRange(c, d.doc_date)).flatMap((d) => d.lines.map((l) => ({ d, l })));

export const REPORTS: Def[] = [
  {
    key: 'movement', group: 'Stock', icon: 'swap', needs: ['range'],
    title: 'Stock movement summary',
    desc: 'Every item: opening, received, issued, returned, sent and closing for the period. The classic store report.',
    build(c) {
      const open = balanceAt(c, addDays(c.from, -1)), close = balanceAt(c, c.to);
      const agg = new Map<number, { rec: number; iss: number; ret: number; sent: number; adj: number }>();
      for (const { l } of linesIn(c)) {
        const a = agg.get(l.item_id) ?? { rec: 0, iss: 0, ret: 0, sent: 0, adj: 0 };
        if (l.kind === 'delivery' || l.kind === 'transfer_in' || l.kind === 'opening') a.rec += l.qty;
        else if (l.kind === 'issue') a.iss += l.qty;
        else if (l.kind === 'return') a.ret += l.qty;
        else if (l.kind === 'transfer_out') a.sent += l.qty;
        else if (l.kind === 'correction') a.adj += l.qty;
        agg.set(l.item_id, a);
      }
      const ids = [...new Set([...agg.keys(), ...c.balances.filter((b) => (open.get(b.item_id) ?? 0) !== 0).map((b) => b.item_id)])];
      const rows = ids.map((id) => {
        const a = agg.get(id) ?? { rec: 0, iss: 0, ret: 0, sent: 0, adj: 0 };
        return { item: nm(c, id), unit: un(c, id), open: r2(open.get(id) ?? 0), rec: r2(a.rec), iss: r2(a.iss), ret: r2(a.ret), sent: r2(a.sent), adj: r2(a.adj), close: r2(close.get(id) ?? 0) };
      }).sort((a, b) => a.item.localeCompare(b.item));
      const moved = rows.filter((r) => r.rec || r.iss || r.ret || r.sent || r.adj).length;
      return {
        cols: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'open', label: 'Opening', num: true }, { key: 'rec', label: 'Received', num: true }, { key: 'iss', label: 'Issued', num: true }, { key: 'ret', label: 'Returned', num: true }, { key: 'sent', label: 'Sent out', num: true }, { key: 'adj', label: 'Corrections', num: true }, { key: 'close', label: 'Closing', num: true }],
        rows, tiles: [{ label: 'Items listed', value: rows.length }, { label: 'Items that moved', value: moved }],
        note: 'Received includes deliveries, transfers in and opening counts. Closing = opening + received − issued + returned − sent out ± corrections.',
      };
    },
  },
  {
    key: 'onhand', group: 'Stock', icon: 'box', needs: ['asOf'],
    title: 'Stock on hand',
    desc: 'What was in the store at the end of a chosen day, with reorder levels and low stock flagged.',
    build(c) {
      const at = balanceAt(c, c.to);
      const rows = c.balances.map((b) => {
        const bal = r2(at.get(b.item_id) ?? 0);
        const low = bal <= 0 ? 'Out' : b.reorder_level != null && bal <= b.reorder_level ? 'Low' : '';
        return { item: b.name, unit: b.unit, bal, reorder: b.reorder_level, status: low };
      }).filter((r) => r.bal !== 0 || r.status).sort((a, b) => a.item.localeCompare(b.item));
      return {
        cols: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'bal', label: 'In store', num: true }, { key: 'reorder', label: 'Reorder level', num: true }, { key: 'status', label: 'Status' }],
        rows, tiles: [{ label: 'Items in store', value: rows.filter((r) => r.bal > 0).length }, { label: 'Low', value: rows.filter((r) => r.status === 'Low').length, tone: 'red' }, { label: 'Out', value: rows.filter((r) => r.status === 'Out').length }],
      };
    },
  },
  {
    key: 'consumption', group: 'Consumption', icon: 'chart', needs: ['range'],
    title: 'Consumption by item',
    desc: 'How much of each item was used: issued minus returned, with the average per working day.',
    build(c) {
      const by = new Map<number, Line[]>();
      for (const { l } of linesIn(c)) by.set(l.item_id, [...(by.get(l.item_id) ?? []), l]);
      const workdays = eachDay(c.from, c.to).filter((d) => weekday(d) !== 'Sun' && d <= c.today).length || 1;
      const rows = [...by].map(([id, ls]) => {
        const iss = ls.filter((l) => l.kind === 'issue').reduce((a, l) => a + l.qty, 0);
        const ret = ls.filter((l) => l.kind === 'return').reduce((a, l) => a + l.qty, 0);
        const u = used(ls);
        return { item: nm(c, id), unit: un(c, id), iss: r2(iss), ret: r2(ret), used: r2(u), avg: r2(u / workdays) };
      }).filter((r) => r.iss || r.ret || r.used).sort((a, b) => b.used - a.used || a.item.localeCompare(b.item));
      return {
        cols: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'iss', label: 'Issued', num: true }, { key: 'ret', label: 'Returned', num: true }, { key: 'used', label: 'Used', num: true }, { key: 'avg', label: 'Per working day', num: true }],
        rows, tiles: [{ label: 'Items used', value: rows.length }, { label: 'Working days', value: workdays }],
        note: 'Sorted by most used. Working days leave out Sundays.',
      };
    },
  },
  {
    key: 'subphase', group: 'Consumption', icon: 'chart', needs: ['range'],
    title: 'Consumption by floor / subphase',
    desc: 'Materials used on each floor or subphase, so you can see where stock goes.',
    build(c) {
      const issueSub = new Map<number, string | null>();
      c.docs.forEach((d) => d.lines.forEach((l) => { if (l.kind === 'issue') issueSub.set(l.id, l.subphase); }));
      const agg = new Map<string, number>();
      for (const { l } of linesIn(c)) {
        let v = 0, sub = l.subphase;
        if (l.kind === 'issue') v = l.qty;
        else if (l.kind === 'return') { v = -l.qty; sub = sub ?? (l.return_of ? issueSub.get(l.return_of) ?? null : null); }
        else continue;
        const k = `${sub ?? 'No subphase'}|${l.item_id}`;
        agg.set(k, (agg.get(k) ?? 0) + v);
      }
      const order = (s: string) => { const i = SUBPHASES.indexOf(s); return i < 0 ? 99 : i; };
      const rows = [...agg].filter(([, v]) => v > 0).map(([k, v]) => { const [sub, id] = k.split('|'); return { sub, item: nm(c, Number(id)), unit: un(c, Number(id)), used: r2(v) }; })
        .sort((a, b) => order(a.sub) - order(b.sub) || a.sub.localeCompare(b.sub) || b.used - a.used);
      return { cols: [{ key: 'sub', label: 'Floor / subphase' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'used', label: 'Used', num: true }], rows, group: 'sub', tiles: [{ label: 'Floors / subphases', value: new Set(rows.map((r) => r.sub)).size }] };
    },
  },
  {
    key: 'activity', group: 'Consumption', icon: 'card', needs: ['range'],
    title: 'Consumption by activity',
    desc: 'Materials issued for each activity (plaster, walling, slab…) from the withdrawal cards.',
    build(c) {
      const agg = new Map<string, number>();
      for (const { d, l } of linesIn(c)) {
        if (l.kind !== 'issue') continue;
        const k = `${d.activity || 'Not given'}|${l.item_id}`;
        agg.set(k, (agg.get(k) ?? 0) + l.qty);
      }
      const rows = [...agg].map(([k, v]) => { const [act, id] = k.split('|'); return { act, item: nm(c, Number(id)), unit: un(c, Number(id)), iss: r2(v) }; })
        .sort((a, b) => a.act.localeCompare(b.act) || b.iss - a.iss);
      return { cols: [{ key: 'act', label: 'Activity' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'iss', label: 'Issued', num: true }], rows, group: 'act', tiles: [{ label: 'Activities', value: new Set(rows.map((r) => r.act)).size }] };
    },
  },
  {
    key: 'people', group: 'Consumption', icon: 'card', needs: ['range'],
    title: 'Issues by person & supervisor',
    desc: 'Who collected materials and who supervised, with the number of cards and items.',
    build(c) {
      const agg = new Map<string, { cards: Set<string>; lines: number; sup: Set<string> }>();
      for (const d of c.docs) {
        if (d.kind !== 'issue' || !inRange(c, d.doc_date)) continue;
        const k = d.party || 'Not given';
        const a = agg.get(k) ?? { cards: new Set(), lines: 0, sup: new Set() };
        a.cards.add(d.id); a.lines += d.lines.length; if (d.supervisor) a.sup.add(d.supervisor);
        agg.set(k, a);
      }
      const rows = [...agg].map(([who, a]) => ({ who, cards: a.cards.size, lines: a.lines, sup: [...a.sup].join(', ') })).sort((a, b) => b.cards - a.cards);
      return { cols: [{ key: 'who', label: 'Issued to' }, { key: 'cards', label: 'Cards', num: true, total: true }, { key: 'lines', label: 'Item lines', num: true, total: true }, { key: 'sup', label: 'Supervisors' }], rows };
    },
  },
  {
    key: 'deliveries', group: 'Registers', icon: 'truck', needs: ['range'],
    title: 'Deliveries register',
    desc: 'Every delivery note: date, supplier, items and quantities received.',
    build(c) {
      const rows = linesIn(c).filter(({ l }) => l.kind === 'delivery').map(({ d, l }) => ({ date: d.doc_date, ref: d.ref_no ?? '', sup: d.party ?? '', item: nm(c, l.item_id), unit: un(c, l.item_id), qty: r2(l.qty) }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
      const notes = new Set(rows.map((r) => `${r.date}${r.ref}`)).size;
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'ref', label: 'Delivery note' }, { key: 'sup', label: 'Supplier' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Qty', num: true }], rows, tiles: [{ label: 'Delivery notes', value: notes }, { label: 'Suppliers', value: new Set(rows.map((r) => r.sup)).size }] };
    },
  },
  {
    key: 'suppliers', group: 'Registers', icon: 'truck', needs: ['range'],
    title: 'Deliveries by supplier',
    desc: 'What each supplier delivered in the period, item by item.',
    build(c) {
      const agg = new Map<string, number>(), notes = new Map<string, Set<string>>();
      for (const { d, l } of linesIn(c)) {
        if (l.kind !== 'delivery') continue;
        const s = d.party || 'Not given', k = `${s}|${l.item_id}`;
        agg.set(k, (agg.get(k) ?? 0) + l.qty);
        notes.set(s, (notes.get(s) ?? new Set()).add(d.id));
      }
      const rows = [...agg].map(([k, v]) => { const [sup, id] = k.split('|'); return { sup, notes: notes.get(sup)!.size, item: nm(c, Number(id)), unit: un(c, Number(id)), qty: r2(v) }; }).sort((a, b) => a.sup.localeCompare(b.sup) || a.item.localeCompare(b.item));
      return { cols: [{ key: 'sup', label: 'Supplier' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Delivered', num: true }], rows, group: 'sup' };
    },
  },
  {
    key: 'cards', group: 'Registers', icon: 'card', needs: ['range'],
    title: 'Withdrawal cards register',
    desc: 'Every Material Withdrawal Card: card no., time, issued to, activity, floor, supervisor and items.',
    build(c) {
      const retBy = new Map<number, number>();
      c.docs.forEach((d) => d.lines.forEach((l) => { if (l.kind === 'return' && l.return_of) retBy.set(l.return_of, (retBy.get(l.return_of) ?? 0) + l.qty); }));
      const rows = linesIn(c).filter(({ l }) => l.kind === 'issue').map(({ d, l }) => ({ date: d.doc_date, card: d.ref_no ?? '', time: d.doc_time ?? '', to: d.party ?? '', act: d.activity ?? '', gemba: l.subphase ?? d.gemba ?? '', sup: d.supervisor ?? '', item: nm(c, l.item_id), unit: un(c, l.item_id), qty: r2(l.qty), ret: r2(retBy.get(l.id) ?? 0) }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.card.localeCompare(b.card));
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'card', label: 'Card no.' }, { key: 'time', label: 'Time' }, { key: 'to', label: 'Issued to' }, { key: 'act', label: 'Activity' }, { key: 'gemba', label: 'Floor' }, { key: 'sup', label: 'Supervisor' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Issued', num: true }, { key: 'ret', label: 'Returned', num: true }], rows, tiles: [{ label: 'Cards', value: new Set(rows.map((r) => `${r.date}${r.card}`)).size }] };
    },
  },
  {
    key: 'returns', group: 'Registers', icon: 'back', needs: ['range'],
    title: 'Returns register',
    desc: 'Leftovers brought back to the store, matched to the card they came from.',
    build(c) {
      const issue = new Map<number, { d: Doc; l: Line }>();
      c.docs.forEach((d) => d.lines.forEach((l) => { if (l.kind === 'issue') issue.set(l.id, { d, l }); }));
      const rows = linesIn(c).filter(({ l }) => l.kind === 'return').map(({ d, l }) => { const src = l.return_of ? issue.get(l.return_of) : undefined; return { date: d.doc_date, card: src?.d.ref_no ?? d.ref_no ?? '', to: src?.d.party ?? '', item: nm(c, l.item_id), unit: un(c, l.item_id), issued: src ? r2(src.l.qty) : null, qty: r2(l.qty) }; })
        .sort((a, b) => a.date.localeCompare(b.date));
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'card', label: 'Card no.' }, { key: 'to', label: 'Issued to' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'issued', label: 'Issued', num: true }, { key: 'qty', label: 'Returned', num: true }], rows };
    },
  },
  {
    key: 'transfers', group: 'Registers', icon: 'swap', needs: ['range'],
    title: 'Site transfers register',
    desc: 'Stock sent to and received from other sites, with the transfer note and who authorised it.',
    build(c) {
      const rows = linesIn(c).filter(({ l }) => l.kind === 'transfer_in' || l.kind === 'transfer_out').map(({ d, l }) => ({ date: d.doc_date, dir: l.kind === 'transfer_in' ? 'Received' : 'Sent', site: d.party ?? '', ref: d.ref_no ?? '', auth: d.authorised_by ?? '', item: nm(c, l.item_id), unit: un(c, l.item_id), qty: r2(l.qty) }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'dir', label: 'In / out' }, { key: 'site', label: 'Other site' }, { key: 'ref', label: 'Note no.' }, { key: 'auth', label: 'Authorised by' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Qty', num: true }], rows,
        tiles: [{ label: 'Received', value: rows.filter((r) => r.dir === 'Received').length }, { label: 'Sent', value: rows.filter((r) => r.dir === 'Sent').length }] };
    },
  },
  {
    key: 'ledger', group: 'Stock', icon: 'checkin', needs: ['range', 'item'],
    title: 'Item ledger (bin card)',
    desc: 'One item, every movement with a running balance. The digital bin card.',
    build(c) {
      if (c.itemId == null) return { cols: [], rows: [], note: 'Choose an item above.' };
      const id = c.itemId;
      let bal = balanceAt(c, addDays(c.from, -1)).get(id) ?? 0;
      const rows: Row[] = [{ date: c.from, entry: 'Balance brought forward', ref: '', inn: null, out: null, bal: r2(bal) }];
      linesIn(c).filter(({ l }) => l.item_id === id).sort((a, b) => a.d.doc_date.localeCompare(b.d.doc_date) || a.d.created_at.localeCompare(b.d.created_at)).forEach(({ d, l }) => {
        const v = delta(l.kind, l.qty); bal += v;
        rows.push({ date: d.doc_date, entry: KIND[l.kind] + (d.party ? ` · ${d.party}` : ''), ref: d.ref_no ?? '', inn: v > 0 ? r2(v) : null, out: v < 0 ? r2(-v) : null, bal: r2(bal) });
      });
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'entry', label: 'Entry' }, { key: 'ref', label: 'Ref' }, { key: 'inn', label: 'In', num: true, total: true }, { key: 'out', label: 'Out', num: true, total: true }, { key: 'bal', label: 'Balance', num: true }], rows, tiles: [{ label: 'Unit', value: un(c, id) }, { label: 'Closing balance', value: r2(bal) }] };
    },
  },
  {
    key: 'reorder', group: 'Planning', icon: 'clock', needs: [],
    title: 'Low stock & reorder list',
    desc: 'Items at or below the reorder level or running out soon, with a suggested order for two weeks.',
    build(c) {
      const rows = c.balances.filter(c.isLow).map((b) => {
        const a = c.avgUse.get(b.item_id) ?? 0;
        const days = a > 0 ? Math.round(b.balance / a) : null;
        const need = a > 0 ? Math.ceil(a * 14 - b.balance) : b.reorder_level != null ? Math.ceil(b.reorder_level * 2 - b.balance) : null;
        return { item: b.name, unit: b.unit, bal: r2(b.balance), reorder: b.reorder_level, avg: r2(a), days, order: need != null && need > 0 ? need : null };
      }).sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
      return { cols: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'bal', label: 'In store', num: true }, { key: 'reorder', label: 'Reorder level', num: true }, { key: 'avg', label: 'Used per day', num: true }, { key: 'days', label: 'Days left', num: true }, { key: 'order', label: 'Suggested order', num: true }], rows,
        tiles: [{ label: 'Items to order', value: rows.length, tone: rows.length ? 'red' : 'ok' }], note: 'Suggested order covers about 14 working days at the last two weeks’ rate (or twice the reorder level when an item has not been used). Agree final quantities with the site manager.' };
    },
  },
  {
    key: 'idle', group: 'Planning', icon: 'box', needs: ['idle'],
    title: 'Slow-moving & idle stock',
    desc: 'Items sitting in the store that have not been issued for a while. Candidates to transfer to another site.',
    build(c) {
      const last = new Map<number, string>();
      c.docs.forEach((d) => d.lines.forEach((l) => { if (l.kind === 'issue' && (last.get(l.item_id) ?? '') < d.doc_date) last.set(l.item_id, d.doc_date); }));
      const cutoff = addDays(c.today, -c.idleDays);
      const rows = c.balances.filter((b) => b.balance > 0 && (last.get(b.item_id) ?? '') < cutoff).map((b) => ({ item: b.name, unit: b.unit, bal: r2(b.balance), last: last.get(b.item_id) ?? `Not since ${c.from}`, since: b.first_seen }))
        .sort((a, b) => String(a.last).localeCompare(String(b.last)));
      return { cols: [{ key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'bal', label: 'In store', num: true }, { key: 'last', label: 'Last issued' }, { key: 'since', label: 'In store since' }], rows, tiles: [{ label: `Idle ${c.idleDays}+ days`, value: rows.length, tone: 'gold' }] };
    },
  },
  {
    key: 'register', group: 'Discipline', icon: 'checkin', needs: ['range', 'subs'],
    title: 'Check-in register',
    desc: 'Was each day submitted, at what time, how many entries, and any late entries.',
    build(c) {
      const days = eachDay(c.from, c.to < c.today ? c.to : c.today).filter((d) => weekday(d) !== 'Sun');
      const rows = days.map((day) => {
        const s = c.subs.get(day) ?? null;
        const ds = c.docs.filter((d) => d.doc_date === day && d.kind !== 'correction' && d.kind !== 'opening');
        const late = s ? ds.filter((d) => d.created_at > s.submitted_at).length : 0;
        const t = s ? hm(s.submitted_at) : '';
        return { day: nice(day), status: s ? (t <= '18:00' ? 'On time' : 'After 6 pm') : day === c.today ? 'Not yet' : 'Missed', time: t, entries: ds.length, late };
      });
      const missed = rows.filter((r) => r.status === 'Missed').length;
      return { cols: [{ key: 'day', label: 'Day' }, { key: 'status', label: 'Submitted' }, { key: 'time', label: 'Time' }, { key: 'entries', label: 'Entries', num: true, total: true }, { key: 'late', label: 'Late entries', num: true, total: true }], rows,
        tiles: [{ label: 'Working days', value: rows.length }, { label: 'On time', value: rows.filter((r) => r.status === 'On time').length, tone: 'ok' }, { label: 'Missed', value: missed, tone: missed ? 'red' : 'ok' }], note: 'Sundays are left out. The register closes at 6:00 pm.' };
    },
  },
  {
    key: 'corrections', group: 'Discipline', icon: 'fix', needs: ['range', 'corr'],
    title: 'Corrections report',
    desc: 'Every fix and recount asked for, the reason, and whether the admin approved it.',
    build(c) {
      const rows = c.corrections.filter((x) => inRange(c, x.created_at.slice(0, 10))).map((x) => ({ date: x.created_at.slice(0, 10), kind: x.kind === 'fix' ? 'Fix an entry' : 'Recount', item: nm(c, x.item_id), unit: un(c, x.item_id), from: r2(x.from_qty), to: r2(x.to_qty), reason: x.reason + (x.note ? ` · ${x.note}` : ''), status: x.status === 'approved' ? 'Approved' : x.status === 'rejected' ? 'Rejected' : 'Waiting' }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { cols: [{ key: 'date', label: 'Date' }, { key: 'kind', label: 'Type' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'from', label: 'From', num: true }, { key: 'to', label: 'To', num: true }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }], rows,
        tiles: [{ label: 'Asked', value: rows.length }, { label: 'Approved', value: rows.filter((r) => r.status === 'Approved').length, tone: 'ok' }, { label: 'Waiting', value: rows.filter((r) => r.status === 'Waiting').length, tone: 'gold' }] };
    },
  },
  {
    key: 'opening', group: 'Stock', icon: 'box', needs: [],
    title: 'Opening count',
    desc: 'The opening count(s) that all balances start from, batch by batch.',
    build(c) {
      const rows = c.docs.filter((d) => d.kind === 'opening').flatMap((d) => d.lines.map((l) => ({ date: d.doc_date, batch: d.reason ?? 'Opening count', item: nm(c, l.item_id), unit: un(c, l.item_id), qty: r2(l.qty) })))
        .sort((a, b) => a.batch.localeCompare(b.batch) || a.item.localeCompare(b.item));
      return { cols: [{ key: 'batch', label: 'Batch' }, { key: 'date', label: 'Date' }, { key: 'item', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'qty', label: 'Qty', num: true }], rows, group: 'batch', tiles: [{ label: 'Items', value: rows.length }] };
    },
  },
];
