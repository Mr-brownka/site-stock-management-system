import { canEdit } from '../lib/access';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/fx';
import { ItemSheet } from '../components/ItemSheet';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { AlertButton } from '../components/StockAlert';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import { useSignal } from '../lib/signals';
import { BackPill } from '../components/BackPill';
import { type Balance } from '../lib/types';

type Tab = 'cons' | 'bal';
type Filter = 'all' | 'low' | 'today';
type LowPart = 'both' | 'out' | 'run';
type SortK = 'name' | 'low' | 'qty';
const PER_PAGE = 50;

type Jump = { tab?: Tab; filter?: 'all' | 'low' | 'today'; item?: number; focus?: boolean; sort?: 'days' };
let pendingJump: Jump | null = null;
/** Open the Items page (the full item list), optionally filtered or on one item. */
export function openItems(go: (s: 'dashboard') => void, d: Jump = {}) { pendingJump = d; go('dashboard'); }

/** All items: the whole page scrolls, 50 items to a page. Arriving from the low stock card, the page becomes the order list. */
export function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const { day, balances, refresh, isLow, docsToday, recent, site, company, user } = useData();
  const [filter, setFilter] = useState<Filter>(() => { try { const j = sessionStorage.getItem('ssms-dash') || ''; sessionStorage.removeItem('ssms-dash'); return j === 'low' ? 'low' : j === 'bal' ? 'today' : 'all'; } catch { return 'all'; } });
  const [lowPart, setLowPart] = useState<LowPart>('both');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortK>('name');
  const [pageNo, setPageNo] = useState(1);
  const [sel, setSel] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!embedded) refresh(); }, [refresh, embedded]);

  const jump = (d: Jump) => {
    if (d.filter) { setFilter(d.filter); setLowPart('both'); }
    if (d.focus) { setQ(''); setTimeout(() => { searchRef.current?.focus({ preventScroll: true }); setPulse(true); setTimeout(() => setPulse(false), 5200); }, 450); }
    if (d.item != null) { setFilter('all'); setQ(''); setSel(d.item); }
    window.scrollTo({ top: 0 });
  };
  useSignal<Jump>('dash', jump);
  useEffect(() => { if (pendingJump) { const d = pendingJump; pendingJump = null; jump(d); } }); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (e.key === '/' && !/input|textarea|select/i.test(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);

  const movedToday = useMemo(() => new Set(docsToday.flatMap((d) => d.lines.map((l) => l.item_id))), [docsToday]);
  const lastMoved = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of [...recent, ...docsToday]) for (const l of d.lines) if ((m.get(l.item_id) ?? '') < d.doc_date) m.set(l.item_id, d.doc_date);
    return m;
  }, [recent, docsToday]);
  const out = (b: Balance) => b.balance <= 0;
  const low = useMemo(() => balances.filter((b) => out(b) || isLow(b)), [balances, isLow]);
  const nOut = low.filter(out).length, nRun = low.length - nOut;
  const status = (b: Balance) => (out(b) ? 'Finished' : isLow(b) ? 'Running low' : 'Healthy');
  const byName = (a: Balance, b: Balance) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
  const s = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = filter === 'low' ? low.filter((b) => lowPart === 'both' || (lowPart === 'out' ? out(b) : !out(b)))
      : filter === 'today' ? balances.filter((b) => movedToday.has(b.item_id)) : balances;
    const k: SortK = filter === 'low' && sort === 'name' ? 'low' : sort;
    return base.filter((b) => !s || b.name.toLowerCase().includes(s)).sort((a, b) =>
      k === 'low' ? (Number(out(b)) - Number(out(a))) || (a.balance / (a.reorder_level || 1)) - (b.balance / (b.reorder_level || 1)) || byName(a, b)
        : k === 'qty' ? a.balance - b.balance || byName(a, b) : byName(a, b));
  }, [balances, low, filter, lowPart, movedToday, s, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  useEffect(() => { setPageNo(1); }, [filter, lowPart, s, sort]);
  const pg = Math.min(pageNo, pages);
  const rows = shown.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);
  const toPage = (n: number) => { setPageNo(n); topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const selected = balances.find((b) => b.item_id === sel) ?? null;
  const close = useCallback(() => setSel(null), []);
  const saveReorder = async (v: number | null) => { if (!selected) return; await api.setReorder(selected.item_id, v); await refresh(); };

  const download = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([[`${company || 'Comex Builders'} · ${site}`], [filter === 'low' ? 'Items to order' : 'All items'], [niceDate(day)], [],
      ['Item', 'Unit', 'In store', 'Reorder at', 'Status'], ...shown.map((b) => [b.name, b.unit, b.balance, b.reorder_level ?? '', status(b)])]);
    ws['!cols'] = [38, 8, 10, 11, 12].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Items');
    XLSX.writeFile(wb, `${site || 'Site'} - ${filter === 'low' ? 'Items to order' : 'All items'} - ${day}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
    toast('Excel file downloaded');
  };
  const hl = (name: string) => {
    if (!s) return name;
    const i = name.toLowerCase().indexOf(s);
    return i < 0 ? name : <>{name.slice(0, i)}<mark>{name.slice(i, i + s.length)}</mark>{name.slice(i + s.length)}</>;
  };
  const initials = (n: string) => n.replace(/["']/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const pageList = (): (number | '…')[] => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set([1, pages, pg - 1, pg, pg + 1].filter((n) => n >= 1 && n <= pages));
    const arr = [...set].sort((a, b) => a - b); const outA: (number | '…')[] = [];
    arr.forEach((n, i) => { if (i && n - arr[i - 1] > 1) outA.push('…'); outA.push(n); });
    return outA;
  };
  const isLowView = filter === 'low';
  const nameOf = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

  return (
    <div className={`page itPage ${isLowView ? 'lowView' : ''} ${embedded ? 'embedded' : ''}`} id="dash">
      {!embedded && <BackPill />}
      {isLowView ? (
        <header className="itHead low enter">
          <div className="itHT"><span className="itKick">All items › Low stock</span><h1>{low.length ? `${nameOf(low.length)} to order` : 'Nothing to order'}</h1>
            <span className="itLead">{nOut && nRun ? 'Finished first, then the ones running low.' : nOut ? 'All of these are finished.' : 'These are running low.'}</span></div>
          <div className="itActs"><span className="itAlert"><AlertButton /></span>
            <button className="btn ghost sm" onClick={download} disabled={!shown.length}><Icon name="download" size={16} />Excel</button>
            <button className="btn dark sm" onClick={() => setFilter('all')}>Show all {balances.length} items</button></div>
        </header>
      ) : (
        <header className="itHead enter">
          <div className="itHT"><span className="itKick">Records</span><h1>All items</h1><span className="itLead">Every item on this site, {PER_PAGE} to a page.</span></div>
          <div className="itActs"><button className="btn ghost sm" onClick={download} disabled={!shown.length}><Icon name="download" size={16} />Excel</button></div>
        </header>
      )}

      <div className="itBar" ref={topRef}>
        <label className={`itSearch ${pulse ? 'pulse' : ''}`}><Icon name="search" size={18} />
          <input ref={searchRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={isLowView ? `Search the ${low.length} low items` : `Search ${balances.length} items`} aria-label="Search items" />
          <kbd>/</kbd></label>
        {isLowView ? (
          <span className="seg itSeg" role="group" aria-label="Show">
            <button aria-pressed={lowPart === 'both'} onClick={() => setLowPart('both')}>Both {low.length}</button>
            {nOut > 0 && <button className="out" aria-pressed={lowPart === 'out'} onClick={() => setLowPart('out')}>Finished {nOut}</button>}
            {nRun > 0 && <button className="run" aria-pressed={lowPart === 'run'} onClick={() => setLowPart('run')}>Running low {nRun}</button>}
          </span>
        ) : (
          <span className="itChips" role="group" aria-label="Show">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All <span className="mono">{balances.length}</span></button>
            <button className="low" aria-pressed={false} onClick={() => setFilter('low')}>Low stock <span className="mono">{low.length}</span></button>
            <button aria-pressed={filter === 'today'} onClick={() => setFilter('today')}>Changed today <span className="mono">{movedToday.size}</span></button>
          </span>
        )}
        <label className="itSort"><span className="sr">Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortK)}>
            <option value="name">{isLowView ? 'Sort: finished first' : 'Sort: name A–Z'}</option>
            {!isLowView && <option value="low">Sort: lowest first</option>}
            <option value="qty">Sort: least in store</option>
          </select></label>
      </div>

      <section className="itTable" aria-label="Items">
        <div className="itRow th"><span /><span>Item</span><span>Level</span><span className="r">In store</span><span className="r">Last moved</span><span>Status</span><span /></div>
        {!rows.length && <div className="pad muted">{s ? `No items match “${q}”.` : isLowView ? 'Nothing is low. All good.' : filter === 'today' ? 'No stock moved today.' : 'No items yet. Do the first stock take.'}</div>}
        {rows.map((b, i) => {
          const st = status(b); const k = st === 'Healthy' ? 'ok' : st === 'Finished' ? 'out' : 'low';
          const fill = b.reorder_level ? Math.min(100, (b.balance / (b.reorder_level * 2)) * 100) : b.balance > 0 ? 60 : 0;
          const lm = lastMoved.get(b.item_id);
          return (
            <button key={b.item_id} className={`itRow ${k}`} style={{ animationDelay: `${Math.min(i, 16) * 14}ms` }} onClick={() => setSel(b.item_id)}>
              <span className="itAv" aria-hidden="true">{initials(b.name)}</span>
              <span className="itName"><b>{hl(b.name)}</b><small><span className="itSt">{st} · </span>{b.unit}{b.reorder_level != null ? ` · reorder at ${fmt(b.reorder_level)}` : ''}</small></span>
              <span className={`balBar ${k}`}><i style={{ width: `${Math.max(b.balance > 0 ? 3 : 0, fill)}%` }} />{b.reorder_level ? <em style={{ left: '50%' }} /> : null}</span>
              <b className="mono itQty">{fmt(b.balance)} <small>{b.unit}</small></b>
              <span className="r itLast">{lm ? (lm === day ? 'Today' : niceDate(lm).split(' ').slice(0, 3).join(' ')) : '—'}</span>
              <span className={`stPill ${k}`}>{st}</span>
              <span className="balGo" aria-hidden="true"><Icon name="arrow" size={14} /></span>
            </button>
          );
        })}
        {shown.length > 0 && (
          <nav className="itPager" aria-label="Pages">
            <span className="itShown">Showing <b>{(pg - 1) * PER_PAGE + 1}–{Math.min(pg * PER_PAGE, shown.length)}</b> of {shown.length}</span>
            {pages > 1 && <>
              <button className="pgBtn" disabled={pg <= 1} onClick={() => toPage(pg - 1)}>‹ Previous</button>
              {pageList().map((n, i) => n === '…' ? <span key={`e${i}`} className="pgGap">…</span>
                : <button key={n} className={`pgBtn num ${n === pg ? 'on' : ''}`} aria-current={n === pg ? 'page' : undefined} onClick={() => toPage(n)}>{n}</button>)}
              <button className="pgBtn next" disabled={pg >= pages} onClick={() => toPage(pg + 1)}>Next {Math.min(PER_PAGE, shown.length - pg * PER_PAGE) || PER_PAGE} ›</button>
            </>}
          </nav>
        )}
      </section>
      {selected && <ItemSheet b={selected} mode="bal" rangeLabel="" onClose={close} onSaveReorder={canEdit(user) ? saveReorder : undefined} />}
    </div>
  );
}
