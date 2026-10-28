import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { bootDone, bootGreet, bootShow, bootStep, isBootDone, rememberVisitor } from './boot';
import { api } from './api';
import { projectWeekNo } from './projectWeek';
import { addDays, today, weekday } from './dates';
import { holidayName } from './holidays';
import type { Balance, Doc, Draft, Item, StepKey, StepState, Structure, Submission, User, WeekInfo } from './types';
import { subphasesFor } from './structure';

export const STEPS: { key: StepKey; n: number; label: string; desc: string; kinds: Doc['kind'][]; screen: Screen }[] = [
  { key: 'deliveries', n: 1, label: 'Deliveries', desc: 'Supplier, delivery note, items received', kinds: ['delivery'], screen: 'deliveries' },
  { key: 'issued', n: 2, label: 'Issued to production', desc: 'Everything issued today, on one register', kinds: ['issue'], screen: 'issued' },
  { key: 'returns', n: 3, label: 'Returned to store', desc: 'Match leftovers to today’s cards', kinds: ['return'], screen: 'returns' },
  { key: 'transfers', n: 4, label: 'Project transfers', desc: 'Stock sent to or received from other projects', kinds: ['transfer_in', 'transfer_out'], screen: 'transfers' },
];

export type Screen = 'home' | 'deliveries' | 'issued' | 'returns' | 'transfers' | 'submitted' | 'dashboard' | 'stocktake' | 'corrections' | 'reports' | 'welcome' | 'rec-deliveries' | 'rec-issued' | 'rec-returns' | 'rec-transfers' | 'consumption' | 'balances' | 'records' | 'incoming';

interface Data {
  user: User;
  /** True while last visit's data is shown and fresh data is still loading. */
  syncing: boolean;
  site: string;
  company: string;
  /** "COMEX BUILDERS · REVEAL" */
  siteLabel: string;
  day: string;
  items: Item[];
  itemById: Map<number, Item>;
  balances: Balance[];
  balanceOf: (itemId: number) => number;
  docsToday: Doc[];
  submission: Submission | null;
  stepState: (k: StepKey) => StepState;
  markStep: (k: StepKey, s: StepState) => void;
  refresh: () => Promise<void>;
  addItem: (name: string, unit: string) => Promise<Item>;
  go: (s: Screen) => void;
  signOut: () => void;
  openAdmin: () => void;
  /** Entries from the last 4 weeks (for trends and average use). */
  recent: Doc[];
  /** Average daily use over the last 14 days, not counting Sundays. */
  avgUse: Map<number, number>;
  isLow: (b: Balance) => boolean;
  /** About how many days the stock lasts at the current rate (null = no recent use). */
  daysLeft: (b: Balance) => number | null;
  lowItems: Balance[];
  /** This week's project week number (null until someone sets it). */
  projectWeek: number | null;
  weekInfo: WeekInfo;
  refreshWeek: () => Promise<void>;
  /** The real calendar day (Nairobi). `day` differs from it while catching up a missed day. */
  realToday: string;
  catchUp: boolean;
  /** Working days since the last submitted day that still need doing, oldest first (max 7 days back). */
  pendingDays: { day: string; holiday: string | null }[];
  startCatchUp: (day: string) => void;
  endCatchUp: () => void;
  closeDay: (day: string, reason: string) => Promise<void>;
  refreshPending: () => Promise<{ day: string; holiday: string | null }[]>;
  /** Floors of this project (from its structure), for sub-phase / gemba lists. */
  subphases: string[];
  /** Entries with details still to confirm, and drafts not yet finished. */
  unconfirmed: Doc[];
  drafts: Draft[];
  refreshUnfinished: () => Promise<void>;
  /** A draft the user chose to finish; the matching form picks it up once. */
  draftToOpen: Draft | null;
  openDraft: (d: Draft | null) => void;
}

const Ctx = createContext<Data | null>(null);

export function useData(): Data {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData outside provider');
  return d;
}

const markKey = (day: string) => `ssms-steps-${day}`;
function readMarks(day: string): Partial<Record<StepKey, StepState>> {
  try { return JSON.parse(localStorage.getItem(markKey(day)) || '{}'); } catch { return {}; }
}

interface Cache { site: string; company: string; items: Item[]; balances: Balance[]; recent: Doc[]; submission: Submission | null; day: string }

export function DataProvider({ user, go, signOut, openAdmin, children }: { user: User; go: (s: Screen) => void; signOut: () => void; openAdmin: () => void; children: ReactNode }) {
  const realToday = today();
  const [day, setWorkDay] = useState(realToday);
  const catchUp = day !== realToday;
  const [site, setSite] = useState('');
  const [company, setCompany] = useState('');
  const [structure, setStructure] = useState<Structure | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [docsToday, setDocs] = useState<Doc[]>([]);
  const [recent, setRecent] = useState<Doc[]>([]);
  const [weekInfo, setWeekInfo] = useState<WeekInfo>({ anchorNo: null, anchorDate: null });
  const [entryDays, setEntryDays] = useState<string[]>([]);
  const refreshWeek = useCallback(async () => {
    const w = await api.projectWeek().catch(() => ({ anchorNo: null, anchorDate: null }));
    setWeekInfo(w);
    if (w.anchorDate) setEntryDays(await api.entryDays(w.anchorDate, day).catch(() => []));
  }, [day]);
  useEffect(() => { refreshWeek(); }, [refreshWeek]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [marks, setMarks] = useState(() => readMarks(day));
  useEffect(() => { setMarks(readMarks(day)); }, [day]);
  const [error, setError] = useState('');

  const hadStock = useRef(false);
  const refresh = useCallback(async () => {
    const [b, r, s] = await Promise.all([api.balances(), api.documents(addDays(realToday, -27), realToday), api.submission(day)]);
    // A store that had stock a moment ago can't suddenly have none: that is a hiccup in loading, not an empty store.
    // Keep what is shown (the next refresh corrects it) rather than sending the person to "Set up your store".
    if (!b.length && hadStock.current) return;
    hadStock.current = b.length > 0;
    setBalances(b); setRecent(r); setDocs(r.filter((x) => x.doc_date === day)); setSubmission(s);
  }, [day, realToday]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const firstLoad = useRef(true);
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; return; }
    setDocs([]); setSubmission(null);
    refresh().catch((e) => setError(e.message || String(e)));
  }, [refresh]);

  // Last visit's data shows at once (live mode only) while fresh data loads behind it.
  const cacheKey = `ssms-cache:${api.mode}:${user.email}`;
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    let cached: Cache | null = null;
    if (api.mode === 'live') { try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { cached = null; } }
    if (cached?.items?.length) {
      setSite(cached.site); setCompany(cached.company); setItems(cached.items); setBalances(cached.balances); hadStock.current = cached.balances.length > 0;
      if (cached.day === day) { setRecent(cached.recent); setDocs(cached.recent.filter((x) => x.doc_date === day)); setSubmission(cached.submission); }
      setSyncing(true);
      bootDone({ quick: true });
    } else if (isBootDone()) { bootGreet(user.name); bootShow('Opening your store…'); }
    else { bootGreet(user.name); bootStep('Opening your store…', 55, 70); }

    let n = 0;
    const tick = (msg: string) => { n++; if (!cached) bootStep(msg, 55 + n * 12, 70 + n * 10); };
    Promise.all([
      api.siteName().then((s) => { tick(`Loading the ${s.site || 'store'} item list…`); return s; }),
      api.items().then((it) => { tick('Counting balances…'); return it; }),
      refreshRef.current().then(() => tick('Checking today’s entries…')),
    ])
      .then(([s, it]) => { setSite(s.site); setCompany(s.company); setStructure(s.structure ?? null); setItems(it); rememberVisitor(user.name, s.site); setSyncing(false); bootDone(); })
      .catch((e) => { setSyncing(false); if (cached) return; setError(e.message || String(e)); bootDone({ quick: true }); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Keep the cache up to date after every change.
  useEffect(() => {
    if (api.mode !== 'live' || syncing || !items || catchUp) return;
    const t = setTimeout(() => { try { localStorage.setItem(cacheKey, JSON.stringify({ site, company, items, balances, recent, submission, day } satisfies Cache)); } catch { /* full or blocked */ } }, 400);
    return () => clearTimeout(t);
  }, [cacheKey, syncing, site, company, items, balances, recent, submission, day]);

  const avgUse = useMemo(() => {
    const from = addDays(realToday, -13);
    const used = new Map<number, number>();
    // Days the item was actually used (issued). Days with no work don't pull the average down.
    const useDays = new Map<number, Set<string>>();
    for (const d of recent) {
      if (d.doc_date < from) continue;
      for (const l of d.lines) {
        if (l.kind === 'issue' && l.qty > 0) { const s = useDays.get(l.item_id) ?? new Set<string>(); s.add(d.doc_date); useDays.set(l.item_id, s); }
        let v = 0;
        if (l.kind === 'issue') v = l.qty;
        else if (l.kind === 'return') v = -l.qty;
        else if (l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return')) v = -l.qty;
        if (v) used.set(l.item_id, (used.get(l.item_id) ?? 0) + v);
      }
    }
    return new Map([...used].map(([id, v]) => [id, Math.max(0, v) / (useDays.get(id)?.size || 1)]));
  }, [recent, realToday]);
  const isLow = useCallback((b: Balance) => {
    // Finished, or at/below the reorder level set for it. Above the level (or no level set) it is healthy.
    if (b.balance <= 0) return true;
    return b.reorder_level != null && b.balance <= b.reorder_level;
  }, []);
  const daysLeft = useCallback((b: Balance) => {
    const a = avgUse.get(b.item_id) ?? 0;
    if (!(a > 0)) return null;
    const x = Math.max(0, b.balance / a);
    return x < 10 ? Math.round(x * 10) / 10 : Math.round(x); // 96 bags at 38.8 a day → 2.5 days
  }, [avgUse]);
  const lowItems = useMemo(() => balances.filter(isLow), [balances, isLow]);

  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const balMap = useMemo(() => new Map(balances.map((b) => [b.item_id, b.balance])), [balances]);

  const markStep = useCallback((k: StepKey, s: StepState) => {
    setMarks((m) => {
      const n = { ...m, [k]: s };
      try { localStorage.setItem(markKey(day), JSON.stringify(n)); } catch { /* ignore */ }
      return n;
    });
  }, [day]);

  const stepState = useCallback((k: StepKey): StepState => {
    if (submission) return submission.steps[k] ?? 'done';
    const step = STEPS.find((s) => s.key === k)!;
    if (docsToday.some((d) => step.kinds.includes(d.kind))) return 'done';
    return marks[k] ?? 'todo';
  }, [submission, docsToday, marks]);

  const [pendingDays, setPending] = useState<{ day: string; holiday: string | null }[]>([]);
  const refreshPending = useCallback(async () => {
    if (api.mode === 'training') { setPending([]); return []; }
    const last = await api.lastSubmittedDay(realToday).catch(() => null);
    const list: { day: string; holiday: string | null }[] = [];
    if (last) {
      const floor = addDays(realToday, -7);
      for (let d = addDays(last, 1); d < realToday; d = addDays(d, 1)) {
        if (d < floor || weekday(d) === 'Sun') continue;
        list.push({ day: d, holiday: holidayName(d) });
      }
    }
    setPending(list);
    return list;
  }, [realToday]);
  useEffect(() => { refreshPending(); }, [refreshPending]);
  const [unconfirmed, setUnconfirmed] = useState<Doc[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftToOpen, openDraft] = useState<Draft | null>(null);
  const refreshUnfinished = useCallback(async () => {
    if (api.mode === 'training') return;
    const [u, d] = await Promise.all([api.unconfirmed().catch(() => []), api.drafts().catch(() => [])]);
    setUnconfirmed(u); setDrafts(d);
  }, []);
  useEffect(() => { refreshUnfinished(); }, [refreshUnfinished]);
  const subphases = useMemo(() => subphasesFor(structure), [structure]);

  const startCatchUp = useCallback((d: string) => setWorkDay(d), []);
  const endCatchUp = useCallback(() => setWorkDay(realToday), [realToday]);
  const closeDay = useCallback(async (d: string, reason: string) => {
    await api.submitDay(d, { deliveries: 'none', issued: 'none', returns: 'none', transfers: 'none' }, reason);
  }, []);

  const addItem = useCallback(async (name: string, unit: string) => {
    const it = await api.addItem(name, unit);
    setItems((x) => [...(x ?? []), it].sort((a, b) => a.name.localeCompare(b.name)));
    return it;
  }, []);

  if (error) return <div className="phone"><div className="body"><div className="note err">Could not load: {error}</div><button className="btn" onClick={() => location.reload()}>Try again</button></div></div>;
  if (!items) return null;

  const value: Data = {
    user, site, company, siteLabel: [company, site].filter(Boolean).join(' · ').toUpperCase(), day, items, itemById, balances, balanceOf: (id) => balMap.get(id) ?? 0, docsToday, submission,
    stepState, markStep, refresh, addItem, go, signOut, openAdmin, recent, avgUse, isLow, daysLeft, lowItems,
    projectWeek: projectWeekNo(day, weekInfo, entryDays), weekInfo, refreshWeek, syncing,
    realToday, catchUp, pendingDays, startCatchUp, endCatchUp, closeDay, refreshPending,
    subphases, unconfirmed, drafts, refreshUnfinished, draftToOpen, openDraft,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
