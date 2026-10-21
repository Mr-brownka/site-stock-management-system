// Demo mode: runs in the browser with example data, so the app can be tried
// before Supabase is connected. Nothing leaves the phone.
import ITEMS from '../data/items.json';
import { addDays, today, weekday } from './dates';
import { delta, type Backend, type Balance, type CorrectionRequest, type Doc, type DocInput, type Draft, type Field, type Item, type Line, type LineInput, type Profile, type SiteDoc, type SiteInfo, type StockTake, type Submission } from './types';

const KEY = 'ssms-demo-v4';
const SITE = 'site-reveal';
const ME = 'demo-admin';

export interface Store {
  /** Training mode: the real site's item list, company, site and person. */
  items?: Item[];
  meta?: { company: string; site: string; user: { email: string; name: string; role: 'store' | 'assistant' | 'admin' } };
  docs: Doc[];
  nextLine: number;
  submissions: Record<string, Submission>;
  reorder: Record<number, number | null>;
  extraItems: Item[];
  signedIn: boolean;
  sites: SiteInfo[];
  profiles: Profile[];
  corrections: CorrectionRequest[];
  /** Stock take list per site (item ids). */
  checklist?: Record<string, number[]>;
  stockTakes?: StockTake[];
  trainingDays?: string[];
  drafts?: Draft[];
}

const BASE_ITEMS: Item[] = (ITEMS as [string, string][]).map(([name, unit], i) => ({ id: i + 1, name, unit }));
const byName = (n: string) => BASE_ITEMS.find((i) => i.name === n)!.id;

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seed(): Store {
  const now = new Date().toISOString();
  const s: Store = { docs: [], nextLine: 1, submissions: {}, reorder: {}, extraItems: [], signedIn: false,
    sites: [['site-reveal', 'Reveal'], ['site-astana', 'Astana'], ['site-nyayo', 'Nyayo View 2'], ['site-balozi', 'Balozi Suites']].map(([id, name]) => ({ id, name, company: 'Comex Builders' })),
    profiles: [
      { id: ME, full_name: 'Abdirahman', email: 'admin@demo', phone: null, role: 'admin', status: 'approved', site_id: SITE, created_at: now, decided_at: now },
      { id: 'demo-peter', full_name: 'Peter Otieno', email: 'peter.o@example.com', phone: '0712 345 678', role: 'store', status: 'pending', site_id: SITE, created_at: now, decided_at: null },
      { id: 'demo-jane', full_name: 'Jane Wambui', email: 'janew@example.com', phone: '0722 111 222', role: 'assistant', status: 'pending', site_id: 'site-astana', created_at: now, decided_at: null },
    ],
    corrections: [] };
  const t = today();
  const add = (d: DocInput, lines: [string, number, string?][], ret?: (issue: Line[]) => [number, number][]) => {
    const id = uid();
    const doc: Doc = { ...d, id, created_at: `${d.doc_date}T17:00:00Z`, lines: [] };
    doc.lines = lines.map(([n, q, sp]) => ({ id: s.nextLine++, document_id: id, kind: d.kind, move_date: d.doc_date, item_id: byName(n), qty: q, subphase: sp ?? null, return_of: null }));
    s.docs.push(doc);
    if (ret) {
      const rid = uid();
      const back = ret(doc.lines);
      s.docs.push({ kind: 'return', doc_date: d.doc_date, ref_no: d.ref_no, id: rid, created_at: `${d.doc_date}T17:30:00Z`,
        lines: back.map(([idx, q]) => ({ id: s.nextLine++, document_id: rid, kind: 'return', move_date: d.doc_date, item_id: doc.lines[idx].item_id, qty: q, subphase: null, return_of: doc.lines[idx].id })) });
    }
  };
  const start = addDays(t, -8);
  add({ kind: 'opening', doc_date: start }, [
    ['Cement', 240], ['Ballast', 18], ['River Sand', 60], ['200mm thick Machine Cut Stones', 1900], ['Hoop Iron', 13], ['Binding Wire 16g X 25Kgs', 9],
    ['BRC Mesh A142', 7], ['Concrete Steel Nails 4"', 12], ['PPR pipe 25mm', 70], ['Tile Adhesive', 20], ['Hardcore Filling', 30], ['Gyprock Gypsum Filler 25kg', 40],
  ]);
  s.checklist = { [SITE]: [...new Set(s.docs[0].lines.map((l) => l.item_id).concat(['River Sand', 'Rock Sand', 'Wheelbarrow', 'Spade', 'Helmet', 'Safety Boots', 'Cutting Disc 9"'].map(byName)))] };
  s.stockTakes = [{ id: uid(), count_date: start, start_time: '07:30', end_time: '10:45', counted_by: 'Abdirahman', checked_by: 'Site manager', is_first: true, status: 'confirmed', created_at: `${start}T10:50:00Z`, lines: s.docs[0].lines.map((l) => ({ item_id: l.item_id, qty: l.qty })) }];
  s.sites[0] = { ...s.sites[0], week_anchor_no: 38, week_anchor_date: start };
  const reorder: [string, number][] = [['Cement', 60], ['Ballast', 10], ['River Sand', 8], ['Hoop Iron', 4], ['BRC Mesh A142', 6], ['Binding Wire 16g X 25Kgs', 8], ['Concrete Steel Nails 4"', 4], ['200mm thick Machine Cut Stones', 400]];
  reorder.forEach(([n, r]) => (s.reorder[byName(n)] = r));
  let card = 5120;
  for (let k = 7; k >= 1; k--) {
    const d = addDays(t, -k);
    if (weekday(d) === 'Sun') continue;
    const n = k % 3;
    add({ kind: 'issue', doc_date: d, doc_time: '08:10', ref_no: String(card++), party: 'Enock', activity: 'Plaster', gemba: '6th floor', supervisor: 'Juma' },
      [['Cement', 12 + n * 2, '6th floor'], ['River Sand', 3 + n, '6th floor'], ...(n === 1 ? [['Gyprock Gypsum Filler 25kg', 3, '6th floor'] as [string, number, string]] : [])],
      () => [[0, 2]]);
    add({ kind: 'issue', doc_date: d, doc_time: '09:30', ref_no: String(card++), party: 'Peter', activity: 'Walling', gemba: '7th floor', supervisor: 'Juma' },
      [['Cement', 6 + n, '7th floor'], ['200mm thick Machine Cut Stones', 160 + n * 20, '7th floor'], ...(n === 0 ? [['Hoop Iron', 1, '7th floor'] as [string, number, string]] : [])]);
    if (k % 2 === 0) add({ kind: 'issue', doc_date: d, doc_time: '11:00', ref_no: String(card++), party: 'Musa', activity: 'Slab', gemba: '8th floor', supervisor: 'Otieno' },
      [['Cement', 10, '8th floor'], ['Ballast', 3 + n, '8th floor'], ['Binding Wire 16g X 25Kgs', 1, '8th floor'], ['Concrete Steel Nails 4"', 2, '8th floor']]);
    if (k === 4) add({ kind: 'delivery', doc_date: d, ref_no: 'DN 0418', party: 'Savannah Quarries' }, [['Ballast', 12, '8th floor']]);
    if (k === 3) add({ kind: 'transfer_out', doc_date: d, ref_no: 'TN 112', party: 'Kilimani site', authorised_by: 'Site manager' }, [['BRC Mesh A142', 2]]);
    if (k === 1) add({ kind: 'delivery', doc_date: d, ref_no: 'DN 0421', party: 'Ndovu Hardware' }, [['Cement', 50, '6th floor'], ['Tile Adhesive', 10, '5th floor']]);
    s.submissions[d] = { day: d, submitted_at: `${d}T14:45:00Z`, steps: { deliveries: 'done', issued: 'done', returns: 'done', transfers: 'done' } };
  }
  return s;
}

function load(key: string, make: () => Store): Store {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return make();
}

export function demoBackend(opts: { key?: string; seed?: () => Store; mode?: 'demo' | 'training' } = {}): Backend {
  const key = opts.key ?? KEY;
  // eslint-disable-next-line prefer-const
  let s = load(key, opts.seed ?? seed);
  const save = () => { try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ } };
  const allItems = () => [...(s.items ?? BASE_ITEMS), ...s.extraItems];
  const lines = () => s.docs.flatMap((d) => d.lines);
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

  const this_: Backend = {
    mode: opts.mode ?? 'demo',
    async currentUser() {
      if (s.meta) return { ...s.meta.user, status: 'approved', siteId: SITE };
      return s.signedIn ? { email: 'admin@demo', name: 'Abdirahman', role: 'admin', status: 'approved', siteId: SITE, trainingDays: s.trainingDays ?? [] } : null;
    },
    async signUp() { /* demo: sign-up is shown, not stored */ },
    async signupSites() { return s.sites; },
    async requestCorrection(input) {
      s.corrections.unshift({ ...input, movement_id: input.movement_id ?? null, note: input.note ?? null, id: uid(), site_id: SITE, status: 'pending', decision_note: null, created_by: ME, created_at: new Date().toISOString(), decided_at: null });
      save();
    },
    async myCorrections() { return s.corrections; },
    admin: {
      async profiles() { return s.profiles; },
      async setProfile(id, patch) { s.profiles = s.profiles.map((p) => (p.id === id ? { ...p, ...patch, decided_at: new Date().toISOString() } : p)); save(); },
      async sites() { return s.sites; },
      async addSite(name, structure) { s.sites.push({ id: uid(), name, company: 'Comex Builders', ...(structure ?? {}) }); save(); },
      async alertContacts() { return Object.fromEntries(s.sites.map((x) => [x.id, { name: x.alert_name ?? null, phone: x.alert_phone ?? null }])); },
      async setAlertContact(siteId, c) { s.sites = s.sites.map((x) => (x.id === siteId ? { ...x, alert_name: c.name, alert_phone: c.phone } : x)); save(); },
      async zohoProjects() { return Object.fromEntries(s.sites.map((x) => [x.id, x.name])); },
      async setZohoProject() { /* demo */ },
      async zohoConnections() { return []; },
      async zohoPending() { return []; },
      async assignPending() { /* demo */ },
      async zohoItems() { return []; },
      async matchZohoItem() { /* demo */ },
      async setStructure(id, structure) { s.sites = s.sites.map((x) => (x.id === id ? { ...x, ...structure } : x)); save(); },
      async renameSite(id, name) { s.sites = s.sites.map((x) => (x.id === id ? { ...x, name } : x)); save(); },
      async corrections() { return s.corrections; },
      async decide(id, approve, note) {
        const r = s.corrections.find((c) => c.id === id);
        if (!r || r.status !== 'pending') throw new Error('Already decided');
        if (approve) {
          const line = r.movement_id ? s.docs.flatMap((d) => d.lines).find((l) => l.id === r.movement_id) : undefined;
          const change = r.kind === 'fix' && line ? (line.kind === 'issue' || line.kind === 'transfer_out' ? r.from_qty - r.to_qty : r.to_qty - r.from_qty) : r.to_qty - r.from_qty;
          const did = uid(), date = line?.move_date ?? today();
          s.docs.push({ kind: 'correction', doc_date: date, reason: r.reason, id: did, created_at: new Date().toISOString(),
            lines: [{ id: s.nextLine++, document_id: did, kind: 'correction', move_date: date, item_id: r.item_id, qty: change, subphase: line?.subphase ?? null, return_of: null, corrects_kind: line?.kind ?? 'recount' }] });
        }
        r.status = approve ? 'approved' : 'rejected'; r.decision_note = note ?? null; r.decided_at = new Date().toISOString();
        save();
      },
      async balances() { return (await this_.balances()).map((b) => ({ ...b, site_id: SITE })); },
      async submissions(day) { return s.submissions[day] ? [{ site_id: SITE, day, submitted_at: s.submissions[day].submitted_at }] : []; },
      async documents(from, to) { return s.docs.filter((d) => d.doc_date >= from && d.doc_date <= to).map((d): SiteDoc => ({ ...d, site_id: SITE, created_by: (d as Partial<SiteDoc>).created_by ?? ME })).reverse(); },
      async updateItem(id, name, unit) { s.extraItems = s.extraItems.map((i) => (i.id === id ? { ...i, name, unit } : i)); save(); },
      async mergeItems() { /* demo */ },
      async setReorder(_site, itemId, level) { s.reorder[itemId] = level; save(); },
      async checklist(siteId) { return s.checklist?.[siteId] ?? []; },
      async setChecklist(siteId, ids) { s.checklist = { ...(s.checklist ?? {}), [siteId]: ids }; save(); },
      async setProjectWeek(siteId, week) { s.sites = s.sites.map((x) => (x.id === siteId ? { ...x, week_anchor_no: week, week_anchor_date: today() } : x)); save(); },
    },
    async signIn() { s.signedIn = true; save(); },
    async signOut() { s.signedIn = false; save(); },
    async sendPasswordReset() { /* demo: nothing to send */ },
    isRecovery() { return false; },
    async setPassword() { /* demo */ },
    async alertInfo() {
      const st = s.sites.find((x) => x.id === SITE);
      return { name: st?.alert_name ?? 'Site admin', phone: st?.alert_phone ?? null, sent_at: st?.alert_sent_at ?? null, sent_by: st?.alert_sent_by ?? null };
    },
    async zohoStatus() { return null; },
    async zohoConnect() { throw new Error('Zoho connects in the live app only, not the demo.'); },
    async zohoSync() { return { connected: false }; },
    async zohoDisconnect() { /* demo */ },
    async checkDelivery(docId) { s.docs = s.docs.map((d) => (d.id === docId ? { ...d, checked_at: new Date().toISOString() } : d)); save(); },
    async markAlertSent() {
      s.sites = s.sites.map((x) => (x.id === SITE ? { ...x, alert_sent_at: new Date().toISOString(), alert_sent_by: 'Abdirahman' } : x));
      save();
    },
    async siteName() {
      const st = s.sites.find((x) => x.id === SITE);
      const structure = st?.floors ? { basements: st.basements ?? 0, has_ground: st.has_ground ?? true, floors: st.floors, roof_name: st.roof_name ?? null } : null;
      return s.meta ? { company: s.meta.company, site: s.meta.site, structure } : { company: 'Demo Builders', site: 'Demo site', structure };
    },
    async unconfirmed() { return s.docs.filter((d) => d.to_confirm?.length).sort((a, b) => b.doc_date.localeCompare(a.doc_date)); },
    async confirmDetails(docId, fields) {
      const d = s.docs.find((x) => x.id === docId);
      if (!d) throw new Error('Entry not found');
      for (const [k, v] of Object.entries(fields)) {
        if (!d.to_confirm?.includes(k)) throw new Error(`${k} was not left to confirm`);
        if (!v.trim()) continue;
        if (k === 'subphase') d.lines = d.lines.map((l) => (l.subphase ? l : { ...l, subphase: v }));
        else (d as unknown as Record<string, unknown>)[k] = v;
        d.to_confirm = d.to_confirm.filter((x) => x !== k);
      }
      save();
    },
    async drafts() { return s.drafts ?? []; },
    async saveDraft(d) { s.drafts = [...(s.drafts ?? []), { ...d, id: uid(), created_at: new Date().toISOString() }]; save(); },
    async deleteDraft(id) { s.drafts = (s.drafts ?? []).filter((x) => x.id !== id); save(); },
    async items() { return wait(allItems().slice().sort((a, b) => a.name.localeCompare(b.name))); },
    async addItem(name, unit) {
      const it = { id: 900000 + s.extraItems.length, name, unit };
      s.extraItems.push(it); save(); return it;
    },
    async remembered(field: Field) {
      const pick: Record<Field, (d: Doc) => string | null | undefined> = {
        supplier: (d) => (d.kind === 'delivery' ? d.party : null),
        issued_to: (d) => (d.kind === 'issue' ? d.party : null),
        site: (d) => (d.kind === 'transfer_in' || d.kind === 'transfer_out' ? d.party : null),
        activity: (d) => (d.kind === 'issue' ? d.activity : null),
        supervisor: (d) => (d.kind === 'issue' ? d.supervisor : null),
        authorised_by: (d) => (d.kind === 'transfer_in' || d.kind === 'transfer_out' ? d.authorised_by : null),
      };
      return [...new Set(s.docs.map(pick[field]).filter(Boolean) as string[])].sort();
    },
    async saveDocument(doc: DocInput, ls: LineInput[]) {
      const id = uid();
      s.docs.push({ ...doc, id, created_at: new Date().toISOString(),
        lines: ls.map((l) => ({ id: s.nextLine++, document_id: id, kind: doc.kind, move_date: doc.doc_date, item_id: l.item_id, qty: l.qty, subphase: l.subphase ?? null, return_of: l.return_of ?? null })) });
      save(); return wait(undefined);
    },
    async removeDocument(id) {
      const d = s.docs.find((x) => x.id === id);
      if (d && s.submissions[d.doc_date]) throw new Error('This day has already been submitted.');
      const gone = new Set(d?.lines.map((l) => l.id));
      s.docs = s.docs.filter((x) => x.id !== id).map((x) => ({ ...x, lines: x.lines.filter((l) => !(l.return_of && gone.has(l.return_of))) })).filter((x) => x.kind !== 'return' || x.lines.length);
      save();
    },
    async documents(from, to) { return wait(s.docs.filter((d) => d.doc_date >= from && d.doc_date <= to)); },
    async linesBetween(from, to) { return wait(lines().filter((l) => l.move_date >= from && l.move_date <= to)); },
    async balances() {
      const items = new Map(allItems().map((i) => [i.id, i]));
      const map = new Map<number, Balance>();
      s.docs.slice().sort((a, b) => a.doc_date.localeCompare(b.doc_date)).forEach((d) => d.lines.forEach((l) => {
        const it = items.get(l.item_id)!;
        const b = map.get(l.item_id) ?? { item_id: l.item_id, name: it.name, unit: it.unit, reorder_level: s.reorder[l.item_id] ?? null, first_seen: l.move_date, balance: 0, deliveries: 0 };
        b.balance += delta(l.kind, l.qty);
        map.set(l.item_id, b);
      }));
      s.docs.filter((d) => d.kind === 'delivery').forEach((d) => new Set(d.lines.map((l) => l.item_id)).forEach((id) => { const b = map.get(id); if (b) b.deliveries++; }));
      return wait([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    },
    async submission(day) { return s.submissions[day] ?? null; },
    async recordTrainingDay(day) {
      const list = s.trainingDays ?? [];
      if (weekday(day) !== 'Sun' && !list.includes(day)) s.trainingDays = [...list, day];
      save();
      return (s.trainingDays ?? []).length;
    },
    async submitDay(day, steps, closedReason) { s.submissions[day] = { day, steps, closed_reason: closedReason ?? null, submitted_at: new Date().toISOString() }; save(); },
    async lastSubmittedDay(before) { return Object.keys(s.submissions).filter((d) => d < before).sort().pop() ?? null; },
    async setReorder(itemId, level) { s.reorder[itemId] = level; save(); },
    async checklist() {
      const ids = s.checklist?.[SITE] ?? [];
      const m = new Map(allItems().map((i) => [i.id, i]));
      return ids.map((id) => m.get(id)).filter(Boolean) as Item[];
    },
    async stockTakes() { return wait([...(s.stockTakes ?? [])].sort((a, b) => b.count_date.localeCompare(a.count_date) || b.created_at.localeCompare(a.created_at))); },
    async saveStockTake(input) {
      const first = !s.docs.length;
      if (first) {
        const id = uid();
        s.docs.push({ kind: 'opening', doc_date: input.count_date, doc_time: input.end_time, reason: 'First stock take', party: input.counted_by, id, created_at: new Date().toISOString(),
          lines: input.lines.filter((l) => l.qty > 0).map((l) => ({ id: s.nextLine++, document_id: id, kind: 'opening' as const, move_date: input.count_date, item_id: l.item_id, qty: l.qty, subphase: null, return_of: null })) });
      }
      s.stockTakes = [{ ...input, id: uid(), is_first: first, status: first ? 'confirmed' : 'recorded', created_at: new Date().toISOString() }, ...(s.stockTakes ?? [])];
      save(); return wait(undefined);
    },
    async projectWeek() { const x = s.sites.find((y) => y.id === SITE); return { anchorNo: x?.week_anchor_no ?? null, anchorDate: x?.week_anchor_date ?? null }; },
    async setProjectWeek(week) { s.sites = s.sites.map((x) => (x.id === SITE ? { ...x, week_anchor_no: week, week_anchor_date: today() } : x)); save(); },
    async entryDays(from, to) { return [...new Set(s.docs.filter((d) => d.kind !== 'opening' && d.doc_date >= from && d.doc_date <= to).map((d) => d.doc_date))]; },
  };
  return this_;
}

/** Start the demo again with fresh example data. */
export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

