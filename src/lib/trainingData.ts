// A realistic practice store for "Comex Builders · Astana": about 60 working days of a
// high-rise build, enough to practise every screen and to present to management.
// Deterministic: the same date always gives the same story.
import { addDays, weekday } from './dates';
import type { Store } from './demoBackend';
import type { CorrectionRequest, Doc, DocInput, Item, Line, Profile, Submission } from './types';

const SITE = 'site-reveal'; // the demo backend's internal site id (never shown)
const ME = 'demo-admin';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

type Act = { name: string; floors: string[]; sup: string[]; mats: [string, number, number][] };

export function buildAstanaTraining(allItems: Item[], user: { email: string; name: string; role?: Profile['role'] }, today: string): Store {
  const R = rng(20261017);
  const between = (a: number, b: number) => a + Math.floor(R() * (b - a + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(R() * xs.length)];
  const byName = new Map(allItems.map((i) => [i.name.toLowerCase(), i]));
  const it = (n: string) => byName.get(n.toLowerCase());

  const docs: Doc[] = [];
  let nextLine = 1, seq = 1;
  const bal = new Map<number, number>();
  const id = () => `t${(seq++).toString(36)}${Math.floor(R() * 1e6).toString(36)}`;
  const add = (d: DocInput & Partial<Pick<Doc, 'source' | 'zoho_grn' | 'zoho_po'>>, lines: [string, number, string?][], at: string, returnOf?: Map<number, number>): Doc | null => {
    const ls: Line[] = [];
    const docId = id();
    for (const [n, q0, sub] of lines) {
      const item = it(n); if (!item || q0 <= 0) continue;
      let q = q0;
      const out = d.kind === 'issue' || d.kind === 'transfer_out';
      if (out) { const have = bal.get(item.id) ?? 0; if (have <= 0) continue; q = Math.min(q, have); }
      ls.push({ id: nextLine++, document_id: docId, kind: d.kind, move_date: d.doc_date, item_id: item.id, qty: q, subphase: sub ?? null, return_of: returnOf?.get(item.id) ?? null });
      bal.set(item.id, (bal.get(item.id) ?? 0) + (out ? -q : q));
    }
    if (!ls.length) return null;
    const doc = { ...d, id: docId, created_at: at, lines: ls, created_by: weekday(d.doc_date) === 'Sat' ? 'demo-kevin' : 'demo-mary' } as Doc;
    docs.push(doc);
    return doc;
  };
  const iso = (day: string, hm: string) => new Date(`${day}T${hm}:00+03:00`).toISOString();

  // ── Opening count, 60 days ago ──
  const start = addDays(today, -60);
  const opening: [string, number][] = [
    ['Cement', 420], ['Ballast', 46], ['River Sand', 38], ['Rock Sand', 24], ['200mm thick Machine Cut Stones', 3200], ['Hoop Iron', 18], ['Binding Wire 16g X 25Kgs', 22],
    ['BRC Mesh A142', 14], ['T8 Bars', 260], ['T10 Bars', 320], ['T12 Bars', 540], ['T16 Bars', 280], ['T20 Bars', 120], ['T25 Bars', 64],
    ['Concrete Steel Nails 4"', 70], ['Concrete Steel Nails 3"', 14], ['Wire Nails 4"', 60], ['Wire Nails 3"', 12], ['Timber 4" x 2"', 620], ['Timber 3" x 2"', 380], ['Marine board', 64],
    ['Tie Rods', 420], ['Anchor Nut for Tie Rods', 900], ['Shutter Screws', 30], ['DPM', 12], ['Hardcore Filling', 40], ['Black Polythene Sheet', 9],
    ['Tile Adhesive', 120], ['Porcelain tile adhesive-25kg', 60], ['Ceramic Tile MT 6012 - 60cm x 60cm', 380], ['Gyprock Gypsum Filler 25kg', 90],
    ['PPR pipe 25mm', 140], ['PPR pipe 32mm', 80], ['PPR Elbow 25mm', 320], ['PPR Tee 25mm', 180], ['PPR Socket 25mm', 260], ['Gate Valve 1/2"', 40], ['PVC Pipe 110mm', 36], ['PVC Tee 4"', 24], ['PVC Bend 2" x 90deg', 60], ['Tangit Glue 1 Ltr', 40],
    ['Conduit 25mm', 600], ['Coupler 25mm', 700], ['Flex cable 2.5mm 3 core', 18], ['Single Socket 13 A', 120], ['Twin Socket 13 A', 160], ['Insulating Tape', 80],
    ['Metal Primer Grey', 60], ['Thinner', 40], ['Turpentine', 30], ['Paint Brush 4"', 40], ['Paint Roller', 24], ['Sand Paper P80', 30],
    ['Cutting Disc 9"', 90], ['Grinding Disc 9"', 40], ['Welding Rods', 36], ['Hack Saw Blade', 30], ['Chalk line powder', 12], ['Caution Tape', 20],
    ['Helmet', 90], ['Reflective Jacket', 80], ['Safety Boots', 40], ['Leather Gloves', 120], ['Dust Mask', 300], ['Green Net', 10], ['First Aid Kit', 4], ['Sanitizer', 12],
    ['Wheelbarrow', 14], ['Spade', 22], ['Mattock', 10], ['Buckets', 40], ['Measuring Tape', 6], ['Plastic tank 3000 Ltrs', 2], ['Dr Fixit Waterproof cement', 30],
  ];
  const openDoc = add({ kind: 'opening', doc_date: start, reason: 'First stock take', party: 'Mary Achieng' }, opening.map(([n, q]) => [n, q]), iso(start, '16:30'));

  // ── Who and what ──
  const upper = ['7th floor', '8th floor', '9th floor'];
  const mid = ['4th floor', '5th floor', '6th floor'];
  const low = ['Ground floor', '1st floor', '2nd floor', '3rd floor'];
  const acts: Act[] = [
    { name: 'Slab casting', floors: upper, sup: ['Otieno Okello'], mats: [['Cement', 18, 34], ['Ballast', 3, 6], ['River Sand', 2, 4], ['Binding Wire 16g X 25Kgs', 1, 1], ['Concrete Steel Nails 4"', 1, 2]] },
    { name: 'Steel fixing', floors: upper, sup: ['Otieno Okello'], mats: [['T12 Bars', 14, 30], ['T16 Bars', 6, 14], ['T10 Bars', 10, 22], ['Binding Wire 16g X 25Kgs', 1, 2]] },
    { name: 'Formwork', floors: upper, sup: ['Juma Hassan'], mats: [['Timber 4" x 2"', 16, 34], ['Marine board', 1, 4], ['Wire Nails 4"', 1, 1], ['Tie Rods', 4, 10], ['Anchor Nut for Tie Rods', 20, 40]] },
    { name: 'Walling', floors: mid, sup: ['Juma Hassan'], mats: [['Cement', 5, 9], ['200mm thick Machine Cut Stones', 110, 220], ['Hoop Iron', 1, 2], ['Rock Sand', 1, 2]] },
    { name: 'Plaster', floors: [...mid, ...low], sup: ['Grace Wanjiru'], mats: [['Cement', 8, 14], ['River Sand', 2, 3]] },
    { name: 'Plumbing first fix', floors: [...mid, ...low], sup: ['Grace Wanjiru'], mats: [['PPR pipe 25mm', 3, 8], ['PPR Elbow 25mm', 6, 14], ['PPR Tee 25mm', 2, 6], ['PPR Socket 25mm', 4, 10], ['Tangit Glue 1 Ltr', 1, 1]] },
    { name: 'Electrical first fix', floors: [...mid, ...low], sup: ['Grace Wanjiru'], mats: [['Conduit 25mm', 10, 26], ['Coupler 25mm', 12, 30], ['Insulating Tape', 1, 3]] },
    { name: 'Tiling', floors: low, sup: ['Grace Wanjiru'], mats: [['Tile Adhesive', 4, 9], ['Ceramic Tile MT 6012 - 60cm x 60cm', 8, 18]] },
    { name: 'Gypsum works', floors: low, sup: ['Grace Wanjiru'], mats: [['Gyprock Gypsum Filler 25kg', 2, 5], ['Sand Paper P80', 1, 2]] },
    { name: 'Metal works', floors: ['Roof', ...upper], sup: ['Juma Hassan'], mats: [['Metal Primer Grey', 2, 4], ['Thinner', 1, 2], ['Cutting Disc 9"', 2, 4], ['Welding Rods', 1, 2]] },
  ];
  const supplier: [RegExp, string, string][] = [
    [/^cement|waterproof/i, 'Bamburi Cement Depot', 'BCD'], [/ballast|sand|stones|hardcore/i, 'Savannah Quarries', 'SQ'], [/bars|binding|brc|hoop/i, 'Devki Steel Mills', 'DSM'],
    [/timber|marine|tie rod|anchor|shutter/i, 'Timsales Ltd', 'TS'], [/ppr|pvc|tangit|gate valve/i, 'Ndovu Hardware', 'NH'], [/conduit|coupler|cable|socket|insulating/i, 'Nyali Electricals', 'NE'],
    [/tile|gyprock/i, 'Tile & Carpet Centre', 'TCC'], [/primer|thinner|turpentine|paint|sand paper/i, 'Crown Paints Depot', 'CP'], [/./, 'Ndovu Hardware', 'NH'],
  ];
  const supplierOf = (n: string) => supplier.find(([re]) => re.test(n))!;
  const reorder: Record<string, number> = {
    'Cement': 120, 'Ballast': 12, 'River Sand': 10, '200mm thick Machine Cut Stones': 800, 'T12 Bars': 150, 'T16 Bars': 80, 'T10 Bars': 100, 'Binding Wire 16g X 25Kgs': 6,
    'Timber 4" x 2"': 150, 'Tile Adhesive': 30, 'PPR Elbow 25mm': 60, 'Conduit 25mm': 120, 'Coupler 25mm': 150, 'Gyprock Gypsum Filler 25kg': 20, 'Marine board': 12, 'Rock Sand': 6, 'Hoop Iron': 4,
  };
  // Items left to run low at the end, so the red pulse and reorder list have something to show.
  const runDown = new Set(['Tile Adhesive', 'Binding Wire 16g X 25Kgs', 'Marine board', 'Gyprock Gypsum Filler 25kg', 'Hoop Iron', 'Coupler 25mm']);
  const deliverySize: Record<string, number> = { 'Cement': 300, 'Ballast': 30, 'River Sand': 28, 'Rock Sand': 16, '200mm thick Machine Cut Stones': 2400, 'T12 Bars': 400, 'T16 Bars': 200, 'T10 Bars': 260, 'Binding Wire 16g X 25Kgs': 14, 'Timber 4" x 2"': 400, 'Tile Adhesive': 80, 'PPR Elbow 25mm': 200, 'Conduit 25mm': 400, 'Coupler 25mm': 500, 'Gyprock Gypsum Filler 25kg': 60, 'Marine board': 40, 'Hoop Iron': 12 };

  const subs: Record<string, Submission> = {};
  let balAt30 = new Map<number, number>();
  let dn = 1, tn = 31;
  const missed = new Set([addDays(today, -23), addDays(today, -9)]);
  const afterSix = new Set([addDays(today, -31), addDays(today, -15), addDays(today, -4)]);
  const lateDays = new Set([addDays(today, -12), addDays(today, -3)]);
  const pendingFix: { line: Line; doc: Doc }[] = [];
  const picked = new Set<string>();
  let lateFix: { line: Line; doc: Doc } | null = null;

  for (let k = 59; k >= 0; k--) {
    const day = addDays(today, -k);
    const wd = weekday(day);
    if (wd === 'Sun') continue;
    const isToday = k === 0;
    if (k <= 29 && !balAt30.size) balAt30 = new Map([...bal].filter(([, q]) => q > 0));
    const sat = wd === 'Sat';

    // Deliveries in the morning: restock anything at or under its reorder level.
    const due = Object.entries(reorder).filter(([n, r]) => { const i = it(n); return i && (bal.get(i.id) ?? 0) <= r * 1.3 && !(runDown.has(n) && k < 26); });
    const groups = new Map<string, [string, number][]>();
    for (const [n] of due) { const [, s] = supplierOf(n); groups.set(s, [...(groups.get(s) ?? []), [n, deliverySize[n] ?? 50]]); }
    if (!isToday) for (const [s, ls] of groups) {
      const code = supplierOf(ls[0][0])[2];
      // Like the real stores: deliveries are received in Zoho and come into Bohari by themselves.
      const grn = `GRN-${String(103000 + dn).padStart(6, '0')}`;
      add({ kind: 'delivery', doc_date: day, source: 'zoho', zoho_grn: grn, zoho_po: `PO-${String(8800 + dn).padStart(5, '0')}`, ref_no: `${code}-${String(2200 + dn++).padStart(5, '0')}`, party: s, vehicle: `KC${String.fromCharCode(65 + between(0, 25))} ${between(100, 999)}${String.fromCharCode(65 + between(0, 25))}` }, ls.map(([n, q]) => [n, q]), iso(day, `0${between(7, 9)}:${between(10, 55)}`));
    }

    // What went out through the day, written on the day's Material Issuance Register (one sheet, item and quantity).
    const nJobs = isToday ? 2 : sat ? between(2, 3) : between(4, 7);
    const issued = new Map<string, number>();
    for (let c = 0; c < nJobs; c++) {
      const a = pick(acts);
      for (const [n, lo, hi] of a.mats) if (R() > 0.15) issued.set(n, (issued.get(n) ?? 0) + between(lo, hi));
    }
    const reg = add({ kind: 'issue', doc_date: day, doc_time: isToday ? '11:30' : '16:40', authorised_by: user.name }, [...issued].map(([n, q]) => [n, q] as [string, number]), iso(day, isToday ? '11:30' : '16:40'));
    const dayCards: Doc[] = reg ? [reg] : [];
    if (isToday) continue;

    // Leftovers come back in the evening, against the day's register.
    if (reg) for (const l of reg.lines) {
      if (R() > 0.3) continue;
      const back = Math.max(1, Math.round(l.qty * (0.05 + R() * 0.12)));
      if (back >= l.qty) continue;
      const name = allItems.find((i) => i.id === l.item_id)!.name;
      add({ kind: 'return', doc_date: day }, [[name, back]], iso(day, '17:05'), new Map([[l.item_id, l.id]]));
    }

    // Project transfers now and then.
    if (k % 11 === 4) add({ kind: 'transfer_out', doc_date: day, ref_no: `TN-${tn++}`, party: pick(['Balozi Suites', 'Nyayo View 2']), authorised_by: 'Eng. Kariuki (Projects Manager)', vehicle: 'KCK 412T' }, [[pick(['T12 Bars', 'Timber 4" x 2"', 'Cement']), between(10, 30)]], iso(day, '14:20'));
    if (k % 13 === 6) add({ kind: 'transfer_in', doc_date: day, ref_no: `TN-${tn++}`, party: pick(['Balozi Suites', 'Nyayo View 2']), authorised_by: 'Eng. Kariuki (Projects Manager)', vehicle: 'KCK 412T' }, [[pick(['Marine board', 'Tie Rods', 'Wheelbarrow']), between(4, 12)]], iso(day, '11:40'));

    // The evening submission.
    if (!missed.has(day)) {
      const t = afterSix.has(day) ? `18:${String(between(5, 40)).padStart(2, '0')}` : `17:${String(between(15, 58)).padStart(2, '0')}`;
      subs[day] = { day, submitted_at: iso(day, t), steps: { deliveries: groups.size ? 'done' : 'none', issued: 'done', returns: 'done', transfers: docs.some((d) => d.doc_date === day && d.kind.startsWith('transfer')) ? 'done' : 'none' } };
      if (lateDays.has(day)) {
        const late = add({ kind: 'issue', doc_date: day, doc_time: '18:20', authorised_by: user.name }, [['Cement', between(4, 8)]], iso(day, '19:05'));
        if (late && k === 3) lateFix = { line: late.lines[0], doc: late };
      }
    }
    if (k <= 20 && !picked.has('a') && dayCards[0]) { picked.add('a'); pendingFix.push({ line: dayCards[0].lines[0], doc: dayCards[0] }); }
    if (k <= 6 && !picked.has('b') && dayCards[0]?.lines[1]) { picked.add('b'); pendingFix.push({ line: dayCards[0].lines[1], doc: dayCards[0] }); }
  }

  // ── Corrections: approved, rejected and two waiting for the admin ──
  const corrections: CorrectionRequest[] = [];
  const cement = it('Cement')!;
  const mk = (o: Partial<CorrectionRequest> & Pick<CorrectionRequest, 'kind' | 'item_id' | 'from_qty' | 'to_qty' | 'reason' | 'status'>, day: string) => {
    const c: CorrectionRequest = { id: id(), site_id: SITE, movement_id: null, note: null, decision_note: null, created_by: 'demo-mary', created_at: iso(day, '17:40'), decided_at: o.status === 'pending' ? null : iso(addDays(day, 1), '09:15'), ...o };
    corrections.push(c);
    if (o.status === 'approved') {
      const did = id();
      const change = c.kind === 'fix' ? c.from_qty - c.to_qty : c.to_qty - c.from_qty;
      docs.push({ kind: 'correction', doc_date: day, reason: c.reason, id: did, created_at: c.decided_at!, lines: [{ id: nextLine++, document_id: did, kind: 'correction', move_date: day, item_id: c.item_id, qty: change, subphase: null, return_of: null, corrects_kind: c.kind === 'fix' ? 'issue' : 'recount' }] });
      bal.set(c.item_id, (bal.get(c.item_id) ?? 0) + change);
    }
  };
  if (pendingFix[0]) { const { line } = pendingFix[0]; mk({ kind: 'fix', movement_id: line.id, item_id: line.item_id, from_qty: line.qty, to_qty: Math.max(0, line.qty - 2), reason: 'Typing mistake', note: 'Register says 2 less', status: 'approved', decision_note: 'Checked against the register' }, line.move_date); }
  mk({ kind: 'recount', item_id: cement.id, from_qty: bal.get(cement.id)!, to_qty: bal.get(cement.id)! - 3, reason: 'Damaged / spoilt', note: '3 bags hardened after rain', status: 'approved', decision_note: 'OK, cover the cement' }, addDays(today, -10));
  if (pendingFix[1]) { const { line } = pendingFix[1]; mk({ kind: 'fix', movement_id: line.id, item_id: line.item_id, from_qty: line.qty, to_qty: line.qty + 5, reason: 'Wrong item or quantity', status: 'rejected', decision_note: 'The register matches the entry' }, line.move_date); }
  const t12 = it('T12 Bars')!;
  mk({ kind: 'recount', item_id: t12.id, from_qty: bal.get(t12.id)!, to_qty: bal.get(t12.id)! - 6, reason: 'Count difference', note: 'Weekly physical count', status: 'pending' }, addDays(today, -1));
  if (lateFix) pendingFix.push(lateFix);
  if (pendingFix[2]) { const { line } = pendingFix[2]; mk({ kind: 'fix', movement_id: line.id, item_id: line.item_id, from_qty: line.qty, to_qty: Math.max(1, line.qty - 1), reason: 'Typing mistake', status: 'pending' }, line.move_date); }

  const reorderById: Record<number, number | null> = {};
  for (const [n, r] of Object.entries(reorder)) { const i = it(n); if (i) reorderById[i.id] = r; }
  const P = (pid: string, full_name: string, role: Profile['role'], status: Profile['status'], daysAgo: number, email: string, phone: string | null): Profile =>
    ({ id: pid, full_name, email, phone, role, status, site_id: SITE, created_at: iso(addDays(today, -daysAgo), '10:00'), decided_at: status === 'pending' ? null : iso(addDays(today, -daysAgo + 1), '09:00') });

  return {
    items: allItems,
    meta: { company: 'Comex Builders', site: 'Astana', user: { email: user.email, name: user.name, role: user.role ?? 'admin' } },
    docs, nextLine, submissions: subs, reorder: reorderById, extraItems: [], signedIn: true,
    checklist: { [SITE]: openDoc ? openDoc.lines.map((l) => l.item_id) : [] },
    stockTakes: [
      ...(openDoc ? [{ id: id(), count_date: start, start_time: '07:40', end_time: '12:15', counted_by: 'Mary Achieng', checked_by: 'Eng. Kariuki', is_first: true, status: 'confirmed' as const, created_at: iso(start, '16:30'), lines: openDoc.lines.map((l) => ({ item_id: l.item_id, qty: l.qty })) }] : []),
      { id: id(), count_date: addDays(today, -29), start_time: '07:30', end_time: '11:05', counted_by: 'Mary Achieng', checked_by: 'Kevin Mutiso', is_first: false, status: 'recorded' as const, created_at: iso(addDays(today, -29), '11:20'),
        lines: [...balAt30].map(([item_id, qty]) => ({ item_id, qty: Math.max(0, qty - (R() < 0.12 ? between(1, 3) : 0)) })) },
    ],
    sites: [{ id: SITE, name: 'Astana', company: 'Comex Builders', week_anchor_no: 46, week_anchor_date: start }, { id: 'site-nyayo', name: 'Nyayo View 2', company: 'Comex Builders' }, { id: 'site-balozi', name: 'Balozi Suites', company: 'Comex Builders' }],
    profiles: [
      { id: ME, full_name: user.name, email: user.email, phone: null, role: 'admin', status: 'approved', site_id: SITE, created_at: iso(addDays(today, -62), '08:00'), decided_at: iso(addDays(today, -62), '08:00') },
      P('demo-mary', 'Mary Achieng', 'store', 'approved', 58, 'mary.achieng@example.com', '0712 448 210'),
      P('demo-kevin', 'Kevin Mutiso', 'assistant', 'approved', 40, 'kevin.mutiso@example.com', '0723 119 870'),
      P('demo-faith', 'Faith Njeri', 'store', 'pending', 1, 'faith.njeri@example.com', '0701 552 334'),
      P('demo-ali', 'Ali Hussein', 'assistant', 'pending', 0, 'ali.hussein@example.com', '0745 300 912'),
    ],
    corrections,
  };
}
