import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader } from '../components/Brand';
import { api } from './api';
import { projectWeekNo } from './projectWeek';
import { addDays, today, weekday } from './dates';
import type { Balance, Doc, Item, StepKey, StepState, Submission, User, WeekInfo } from './types';

export const STEPS: { key: StepKey; n: number; label: string; desc: string; kinds: Doc['kind'][]; screen: Screen }[] = [
  { key: 'deliveries', n: 1, label: 'Deliveries', desc: 'Supplier, delivery note, items received', kinds: ['delivery'], screen: 'deliveries' },
  { key: 'issued', n: 2, label: 'Issued to production', desc: 'Copy each Material Withdrawal Card', kinds: ['issue'], screen: 'issued' },
  { key: 'returns', n: 3, label: 'Returned to store', desc: 'Match leftovers to today’s cards', kinds: ['return'], screen: 'returns' },
  { key: 'transfers', n: 4, label: 'Site transfers', desc: 'Stock sent to or received from other sites', kinds: ['transfer_in', 'transfer_out'], screen: 'transfers' },
];

export type Screen = 'home' | 'deliveries' | 'issued' | 'returns' | 'transfers' | 'submitted' | 'dashboard' | 'stocktake' | 'corrections' | 'reports';

interface Data {
  user: User;
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

export function DataProvider({ user, go, signOut, openAdmin, children }: { user: User; go: (s: Screen) => void; signOut: () => void; openAdmin: () => void; children: ReactNode }) {
  const day = today();
  const [site, setSite] = useState('');
  const [company, setCompany] = useState('');
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
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [b, r, s] = await Promise.all([api.balances(), api.documents(addDays(day, -27), day), api.submission(day)]);
    setBalances(b); setRecent(r); setDocs(r.filter((x) => x.doc_date === day)); setSubmission(s);
  }, [day]);

  useEffect(() => {
    Promise.all([api.siteName(), api.items(), refresh()])
      .then(([s, it]) => { setSite(s.site); setCompany(s.company); setItems(it); })
      .catch((e) => setError(e.message || String(e)));
  }, [refresh]);

  const avgUse = useMemo(() => {
    const from = addDays(day, -13);
    const used = new Map<number, number>();
    for (const d of recent) {
      if (d.doc_date < from) continue;
      for (const l of d.lines) {
        let v = 0;
        if (l.kind === 'issue') v = l.qty;
        else if (l.kind === 'return') v = -l.qty;
        else if (l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return')) v = -l.qty;
        if (v) used.set(l.item_id, (used.get(l.item_id) ?? 0) + v);
      }
    }
    let workdays = 0;
    for (let i = 0; i < 14; i++) if (weekday(addDays(day, -i)) !== 'Sun') workdays++;
    return new Map([...used].map(([id, v]) => [id, Math.max(0, v) / workdays]));
  }, [recent, day]);
  const isLow = useCallback((b: Balance) => {
    if (b.balance <= 0) return true;
    if (b.reorder_level != null && b.balance <= b.reorder_level) return true;
    const a = avgUse.get(b.item_id) ?? 0;
    return a > 0 && b.balance / a <= 5;
  }, [avgUse]);
  const daysLeft = useCallback((b: Balance) => {
    const a = avgUse.get(b.item_id) ?? 0;
    return a > 0 ? Math.max(0, Math.round(b.balance / a)) : null;
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

  const addItem = useCallback(async (name: string, unit: string) => {
    const it = await api.addItem(name, unit);
    setItems((x) => [...(x ?? []), it].sort((a, b) => a.name.localeCompare(b.name)));
    return it;
  }, []);

  if (error) return <div className="phone"><div className="body"><div className="note err">Could not load: {error}</div><button className="btn" onClick={() => location.reload()}>Try again</button></div></div>;
  if (!items) return <Loader intro={false} message="Loading the store…" />;

  const value: Data = {
    user, site, company, siteLabel: [company, site].filter(Boolean).join(' · ').toUpperCase(), day, items, itemById, balances, balanceOf: (id) => balMap.get(id) ?? 0, docsToday, submission,
    stepState, markStep, refresh, addItem, go, signOut, openAdmin, recent, avgUse, isLow, daysLeft, lowItems,
    projectWeek: projectWeekNo(day, weekInfo, entryDays), weekInfo, refreshWeek,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
