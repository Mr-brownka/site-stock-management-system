/**
 * 16 · Works with no signal. Entries made while the phone has no network are kept on the phone (the "outbox")
 * and sent, in the order they were made, as soon as the network is back. Until then they show with a
 * "Waiting to send" badge, and balances already include them.
 * Pages also keep showing the last data they loaded instead of an error.
 */
import type { Backend, Balance, Doc, DocInput, LineInput, Submission, User } from './types';
import { delta } from './types';

type Method = 'saveDocument' | 'saveRegister' | 'setRegister' | 'saveDraft' | 'submitDay' | 'saveStockTake';
export interface OutItem { id: string; method: Method; args: unknown[]; at: string; label: string; error?: string }

const KEY = 'ostock-outbox';
const LAST = 'ostock-last:';
const read = (): OutItem[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (q: OutItem[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* full */ } window.dispatchEvent(new Event('ostock-outbox')); };
export const outbox = read;

export function isNetError(e: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = (e as { message?: string })?.message ?? String(e);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|err_network|timed? ?out/i.test(m);
}

const KIND_WORD: Record<string, string> = { delivery: 'Delivery', issue: 'Issue', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', opening: 'Opening', correction: 'Correction' };
function labelOf(method: Method, args: unknown[]) {
  if (method === 'saveDocument') { const d = args[0] as DocInput; const n = (args[1] as LineInput[]).length; return `${KIND_WORD[d.kind] ?? 'Entry'}${d.party ? ` · ${d.party}` : ''} · ${n} item${n === 1 ? '' : 's'}`; }
  if (method === 'saveRegister' || method === 'setRegister') { const n = (args[2] as unknown[]).length; return `Issuance register · ${n} item${n === 1 ? '' : 's'}`; }
  if (method === 'submitDay') return `Submit ${args[0] as string}`;
  if (method === 'saveDraft') return 'Draft';
  return 'Stock take';
}

/** Keeps the last good answer of a read, so a page shows it (instead of an error) when there is no signal. */
function remember<T>(name: string, run: () => Promise<T>, fallback?: () => T | undefined): Promise<T> {
  return run().then((v) => { try { localStorage.setItem(LAST + name, JSON.stringify(v)); } catch { /* full */ } return v; }, (e) => {
    if (!isNetError(e)) throw e;
    try { const s = localStorage.getItem(LAST + name); if (s) return JSON.parse(s) as T; } catch { /* ignore */ }
    const f = fallback?.(); if (f !== undefined) return f;
    throw new Error('No signal. Showing what was saved on this phone; new data loads when the network is back.');
  });
}

export function withOffline(b: Backend): Backend {
  let flushing = false;
  const enqueue = (method: Method, args: unknown[]) => {
    const q = read();
    q.push({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, method, args, at: new Date().toISOString(), label: labelOf(method, args) });
    write(q);
  };
  const flush = async () => {
    if (flushing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    flushing = true;
    let sent = 0;
    try {
      for (;;) {
        const q = read();
        const next = q.find((x) => !x.error);
        if (!next) break;
        try {
          await (b[next.method] as (...a: unknown[]) => Promise<unknown>)(...next.args);
          write(read().filter((x) => x.id !== next.id)); sent++;
        } catch (e) {
          if (isNetError(e)) break; // still no signal: try again later
          // The database refused it (e.g. the day was submitted meanwhile): keep it, with the reason, for the person to see.
          write(read().map((x) => (x.id === next.id ? { ...x, error: (e as Error).message || 'Refused' } : x)));
        }
      }
    } finally { flushing = false; }
    if (sent) window.dispatchEvent(new CustomEvent('ostock-sent', { detail: sent }));
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { flush(); });
    setInterval(() => { if (read().some((x) => !x.error)) flush(); }, 20_000);
    setTimeout(flush, 1500);
    (window as unknown as { __ostockFlush?: () => Promise<void> }).__ostockFlush = flush;
  }
  /** A write: sent straight away when there is signal and nothing waiting; otherwise kept in the outbox. */
  const send = <R>(method: Method, args: unknown[], offlineResult: R) => async (): Promise<R> => {
    const waiting = read().some((x) => !x.error);
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || waiting) { enqueue(method, args); flush(); return offlineResult; }
    try { return await (b[method] as (...a: unknown[]) => Promise<R>)(...args); } catch (e) {
      if (!isNetError(e)) throw e;
      enqueue(method, args); return offlineResult;
    }
  };

  // Entries still in the outbox, shown with the rest (marked) so the person sees what they entered.
  const pendingDocs = (from: string, to: string, real: Doc[]): Doc[] => {
    const out: Doc[] = [];
    let n = -1;
    for (const x of read()) {
      if (x.method === 'saveDocument') {
        const [d, ls] = x.args as [DocInput, LineInput[]];
        if (d.doc_date < from || d.doc_date > to) continue;
        out.push({ ...d, id: `out-${x.id}`, created_at: x.at, outbox: x.error ? 'refused' : 'waiting',
          lines: ls.map((l) => ({ id: n--, document_id: `out-${x.id}`, kind: d.kind, move_date: d.doc_date, item_id: l.item_id, qty: l.qty, subphase: l.subphase ?? null, return_of: l.return_of ?? null })) } as Doc);
      } else if (x.method === 'saveRegister' || x.method === 'setRegister') {
        const [day, store, ls] = x.args as [string, string | null, { item_id: number; qty: number }[]];
        if (day < from || day > to) continue;
        out.push({ kind: 'issue', doc_date: day, authorised_by: store, id: `out-${x.id}`, created_at: x.at, outbox: x.error ? 'refused' : 'waiting',
          lines: ls.map((l) => ({ id: n--, document_id: `out-${x.id}`, kind: 'issue', move_date: day, item_id: l.item_id, qty: l.qty, subphase: null, return_of: null })) } as Doc);
        void real;
      }
    }
    return out;
  };
  const pendingDelta = (): Map<number, number> => {
    const m = new Map<number, number>();
    const add = (id: number, v: number) => m.set(id, (m.get(id) ?? 0) + v);
    for (const x of read()) {
      if (x.error) continue;
      if (x.method === 'saveDocument') { const [d, ls] = x.args as [DocInput, LineInput[]]; ls.forEach((l) => add(l.item_id, delta(d.kind, l.qty))); }
      else if (x.method === 'saveRegister') (x.args[2] as { item_id: number; qty: number }[]).forEach((l) => add(l.item_id, -l.qty));
    }
    return m;
  };

  return new Proxy(b, {
    get(target, prop, recv) {
      switch (prop) {
        case 'saveDocument': return (doc: DocInput, lines: LineInput[]) => send<void>('saveDocument', [doc, lines], undefined)();
        case 'saveRegister': return (day: string, store: string | null, lines: unknown[]) => send<'new' | 'added'>('saveRegister', [day, store, lines], 'added')();
        case 'setRegister': return (day: string, store: string | null, lines: unknown[]) => send<'new' | 'saved' | 'emptied'>('setRegister', [day, store, lines], 'saved')();
        case 'saveDraft': return (d: unknown) => send<void>('saveDraft', [d], undefined)();
        case 'submitDay': return (...a: unknown[]) => send<void>('submitDay', a, undefined)();
        case 'saveStockTake': return (i: unknown) => send<void>('saveStockTake', [i], undefined)();
        case 'removeDocument': return (id: string) => (id.startsWith('out-') ? Promise.resolve(dropOut(id.slice(4))) : target.removeDocument(id));
        case 'currentUser': return () => remember<User | null>('user', () => target.currentUser());
        case 'items': return () => remember('items', () => target.items());
        case 'siteName': return () => remember('site', () => target.siteName());
        case 'balances': return async () => {
          const bs = await remember<Balance[]>('balances', () => target.balances());
          const p = pendingDelta();
          return p.size ? bs.map((x) => (p.has(x.item_id) ? { ...x, balance: x.balance + p.get(x.item_id)! } : x)) : bs;
        };
        case 'submission': return async (day: string) => {
          const s = await remember<Submission | null>(`sub:${day}`, () => target.submission(day), () => null);
          if (s) return s;
          const q = read().find((x) => x.method === 'submitDay' && x.args[0] === day && !x.error);
          return q ? { day, submitted_at: q.at, steps: (q.args[1] ?? {}) as Submission['steps'] } : null;
        };
        case 'documents': return async (from: string, to: string) => {
          const real = await remember<Doc[]>(`docs:${from}:${to}`, () => target.documents(from, to), () => {
            // Any wider list loaded before still covers this range.
            for (const k of Object.keys(localStorage).filter((k) => k.startsWith(LAST + 'docs:'))) {
              const [, f, t] = k.slice(LAST.length).split(':');
              if (f <= from && t >= to) { try { return (JSON.parse(localStorage.getItem(k)!) as Doc[]).filter((d) => d.doc_date >= from && d.doc_date <= to); } catch { /* ignore */ } }
            }
            return undefined;
          });
          const extra = pendingDocs(from, to, real);
          return extra.length ? [...real, ...extra] : real;
        };
        default: { const v = Reflect.get(target, prop, recv); return typeof v === 'function' ? v.bind(target) : v; }
      }
    },
  });
}

/** Sends what is waiting now (the "Send now" button). */
export const flushNow = () => (window as unknown as { __ostockFlush?: () => Promise<void> }).__ostockFlush?.();
export function dropOut(id: string) { write(read().filter((x) => x.id !== id)); }
