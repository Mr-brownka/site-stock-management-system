import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Num, PulseDot } from '../components/fx';
import { ItemSheet, type Use } from '../components/ItemSheet';
import { PeriodPicker } from '../components/PeriodPicker';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { periodRange, type Period } from '../lib/dates';
import { useData } from '../lib/store';
import { useSignal } from '../lib/signals';
import { SUBPHASES, type Balance, type Line } from '../lib/types';

type Tab = 'cons' | 'bal';
type Filter = 'all' | 'low' | 'today';
const NO_SUB = 'No subphase';


function usage(lines: Line[]): Map<number, Use> {
  const m = new Map<number, Use>();
  const get = (id: number) => m.get(id) ?? (m.set(id, { issued: 0, returned: 0, used: 0, bySub: new Map() }), m.get(id)!);
  const issueSub = new Map(lines.filter((l) => l.kind === 'issue').map((l) => [l.id, l.subphase]));
  for (const l of lines) {
    // An approved fix to a card or return changes how much was used (stock up = used less).
    if (l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return')) {
      const u = get(l.item_id);
      u.used -= l.qty;
      const sub = l.subphase ?? NO_SUB;
      u.bySub.set(sub, (u.bySub.get(sub) ?? 0) - l.qty);
      if (l.corrects_kind === 'issue') u.issued -= l.qty; else u.returned += l.qty;
      continue;
    }
    if (l.kind !== 'issue' && l.kind !== 'return') continue;
    const u = get(l.item_id);
    const sign = l.kind === 'issue' ? 1 : -1;
    if (l.kind === 'issue') u.issued += l.qty; else u.returned += l.qty;
    u.used += sign * l.qty;
    const sub = l.subphase ?? (l.return_of ? issueSub.get(l.return_of) : null) ?? NO_SUB;
    u.bySub.set(sub, (u.bySub.get(sub) ?? 0) + sign * l.qty);
  }
  return m;
}

export function Dashboard({ embedded = false }: { embedded?: boolean }) {
  const { day, balances, refresh, go, siteLabel, isLow, lowItems, docsToday, recent, daysLeft } = useData();
  // Remember the last view; a link from another screen (low stock, balances after today) wins.
  const [prefs] = useState(() => {
    let p: { tab?: Tab; period?: Period; group?: 'none' | 'sub' } = {};
    let jump = '';
    try { p = JSON.parse(localStorage.getItem('ssms-dash-prefs') || '{}'); jump = sessionStorage.getItem('ssms-dash') || ''; sessionStorage.removeItem('ssms-dash'); } catch { /* ignore */ }
    return { tab: (jump ? 'bal' : p.tab ?? 'cons') as Tab, filter: (jump === 'low' ? 'low' : jump === 'bal' ? 'today' : 'all') as Filter, period: p.period ?? 'day', group: p.group ?? 'none' };
  });
  const [tab, setTab] = useState<Tab>(prefs.tab);
  const [filter, setFilter] = useState<Filter>(prefs.filter);
  const [period, setPeriod] = useState<Period>(prefs.period);
  const [date, setDate] = useState(day);
  const [group, setGroup] = useState<'none' | 'sub'>(prefs.group);
  useEffect(() => { try { localStorage.setItem('ssms-dash-prefs', JSON.stringify({ tab, period, group })); } catch { /* ignore */ } }, [tab, period, group]);
  const movedToday = useMemo(() => new Set(docsToday.flatMap((d) => d.lines.map((l) => l.item_id))), [docsToday]);
  const activeDays = useMemo(() => new Set(recent.filter((d) => d.kind === 'issue').map((d) => d.doc_date)), [recent]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [sort, setSort] = useState<{ k: 'name' | 'val' | 'days'; dir: 1 | -1 }>({ k: 'name', dir: 1 });
  const [lines, setLines] = useState<Line[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const range = periodRange(period, date || day);
  useEffect(() => { if (!embedded) refresh(); }, [refresh, embedded]);
  // The check-in page's tiles can switch the dashboard (e.g. "Low stock" → Balances, low only).
  useSignal<{ tab?: Tab; filter?: Filter; item?: number }>('dash', (d) => {
    if (d.tab) setTab(d.tab);
    if (d.filter) setFilter(d.filter);
    if (d.item != null) { setTab('bal'); setFilter('all'); setQ(''); setSel(d.item); }
    document.getElementById('dash')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  useEffect(() => { setLines(null); api.linesBetween(range.from, range.to).then(setLines); }, [range.from, range.to]);
  // Press "/" to jump to the search box.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  const use = useMemo(() => usage(lines ?? []), [lines]);
  const usedOf = (id: number) => use.get(id)?.used ?? 0;
  const byName = (a: Balance, b: Balance) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  const search = q.trim().toLowerCase();
  const outCount = balances.filter((b) => b.balance <= 0).length;
  const shown = balances
    .filter((b) => !search || b.name.toLowerCase().includes(search))
    .filter((b) => tab !== 'bal' || filter === 'all' || (filter === 'low' ? isLow(b) : movedToday.has(b.item_id)))
    .sort((a, b) => {
      const v = (x: Balance) => sort.k === 'val' ? (tab === 'bal' ? x.balance : usedOf(x.item_id)) : sort.k === 'days' ? (daysLeft(x) ?? 1e9) : 0;
      return sort.k === 'name' ? sort.dir * byName(a, b) : sort.dir * (v(a) - v(b)) || byName(a, b);
    });

  const top = useMemo(() => {
    if (tab === 'bal') return balances.filter((b) => b.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries || byName(a, b)).slice(0, 5);
    const units = [...new Set(balances.map((b) => b.unit))].sort();
    return units.map((u) => balances.filter((b) => b.unit === u && usedOf(b.item_id) > 0).sort((a, b) => usedOf(b.item_id) - usedOf(a.item_id))[0]).filter(Boolean) as Balance[];
  }, [tab, balances, use]);

  const selected = balances.find((b) => b.item_id === sel) ?? null;
  const close = useCallback(() => setSel(null), []);
  const saveReorder = async (v: number | null) => {
    if (!selected) return;
    await api.setReorder(selected.item_id, v);
    await refresh();
  };

  const groups = useMemo(() => {
    if (group !== 'sub') return [];
    const names = [...SUBPHASES, NO_SUB];
    return names.map((name) => ({
      name,
      rows: shown.map((b) => ({ b, v: use.get(b.item_id)?.bySub.get(name) ?? 0 })).filter((r) => r.v > 0),
    })).filter((g) => g.rows.length);
  }, [group, shown, use]);

  const hl = (name: string) => {
    if (!search) return name;
    const i = name.toLowerCase().indexOf(search);
    return i < 0 ? name : <>{name.slice(0, i)}<mark>{name.slice(i, i + search.length)}</mark>{name.slice(i + search.length)}</>;
  };
  const sortBy = (k: 'name' | 'val' | 'days') => setSort((o) => ({ k, dir: o.k === k ? (o.dir === 1 ? -1 : 1) : k === 'name' ? 1 : -1 }));
  const trow = (b: Balance, v?: number, key?: string) => {
    const low = tab === 'bal' && isLow(b);
    const out = tab === 'bal' && b.balance <= 0;
    const u = use.get(b.item_id);
    const dl = daysLeft(b);
    return (
      <tr key={(key ?? '') + b.item_id} className={`${low ? 'isLow' : ''} ${sel === b.item_id ? 'on' : ''}`} onClick={() => setSel(b.item_id)}>
        <td><button className="cellLink" onClick={(e) => { e.stopPropagation(); setSel(b.item_id); }}>{low && <PulseDot label="Low stock" />}{hl(b.name)}</button></td>
        <td className="muted">{b.unit}</td>
        {tab === 'bal' ? <>
          <td className={`num strong ${low ? 'low' : ''}`}>{fmt(b.balance)}</td>
          <td className="num hideS muted">{b.reorder_level != null ? fmt(b.reorder_level) : '–'}</td>
          <td className="num hideS">{dl == null ? <span className="muted">–</span> : dl < 1 ? '< 1' : fmt(Math.round(dl))}</td>
          <td><span className={`stPill ${out ? 'out' : low ? 'low' : 'ok'}`}>{out ? 'Out of stock' : low ? 'Running low' : 'Healthy'}</span></td>
        </> : <>
          <td className="num hideS">{u?.issued ? fmt(u.issued) : '–'}</td>
          <td className="num hideS">{u?.returned ? fmt(u.returned) : '–'}</td>
          <td className="num strong">{(v ?? u?.used) ? fmt(v ?? u!.used) : '–'}</td>
        </>}
      </tr>
    );
  };
  const exportCsv = () => {
    const esc = (x: string | number) => /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x);
    const head = tab === 'bal' ? ['Item', 'Unit', 'Balance', 'Reorder at', 'Days left', 'Status'] : ['Item', 'Unit', 'Issued', 'Returned', 'Used'];
    const rows = shown.map((b) => {
      if (tab === 'bal') { const dl = daysLeft(b); return [b.name, b.unit, b.balance, b.reorder_level ?? '', dl == null ? '' : Math.round(dl), b.balance <= 0 ? 'Out of stock' : isLow(b) ? 'Running low' : 'Healthy']; }
      const u = use.get(b.item_id); return [b.name, b.unit, u?.issued ?? 0, u?.returned ?? 0, u?.used ?? 0];
    });
    const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${tab === 'bal' ? 'balances' : 'consumption'}-${tab === 'bal' ? day : range.from + '_' + range.to}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const skeleton = Array.from({ length: 6 }, (_, i) => <div key={i} className="skelRow"><i className="skel" style={{ width: `${40 + ((i * 17) % 40)}%` }} /><i className="skel" style={{ width: 60 }} /></div>);

  return (
    <div className={`dash ${embedded ? 'embedded' : ''}`} id="dash">
      <div className="dashTop">
        {embedded ? <div className="dashEmbHead"><h2>Store dashboard</h2><span className="small">Balances and consumption, live</span></div> : <div>
          <button className="back" onClick={() => go('home')}>← Back to check-in</button>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '.08em', color: '#B9C0BC' }}>{siteLabel}{api.mode === 'demo' ? ' · DEMO' : ''}</div>
          <h1>Store dashboard</h1>
        </div>}
        <div className="tabs" role="tablist" data-tab={tab}>
          <span className="tabInk" aria-hidden />
          <button role="tab" aria-selected={tab === 'cons'} onClick={() => setTab('cons')}>Consumption</button>
          <button role="tab" aria-selected={tab === 'bal'} onClick={() => setTab('bal')}>Balances{lowItems.length > 0 && <span className="tabLow"><PulseDot />{lowItems.length}</span>}</button>
        </div>
      </div>

      <div className="dashBody">
        <main className="dashMain" key={tab}>
          {tab === 'bal' && (
            <div className="healthStrip enter">
              <div><span className="label">Items</span><Num value={balances.length} className="hsNum" /></div>
              <div className={lowItems.length ? 'hsAlert' : ''}><span className="label">{lowItems.length > 0 && <PulseDot />} Low</span><Num value={lowItems.length} className="hsNum" /></div>
              <div><span className="label">Out</span><Num value={outCount} className="hsNum" /></div>
              <div className="hsHint small muted">Low = at or below the reorder level, or about 5 days left at the current rate.</div>
            </div>
          )}
          <section className="stack">
            <div className="controls">
              <h2>{tab === 'cons' ? 'Most issued' : 'Most ordered'}</h2>
            </div>
            {tab === 'cons' && <PeriodPicker period={period} date={date} today={day} onPeriod={(p) => { setPeriod(p); setDate(day); }} onDate={setDate} activeDays={activeDays} />}
            <div className="small muted">{tab === 'cons' ? 'The most used item in each unit (bags, pieces, tonnes…). Tap one for details.' : 'The items delivered most often since the project started'}</div>
            {tab === 'cons' && lines === null ? <div className="topGrid">{[0, 1, 2].map((i) => <div key={i} className="topCard"><i className="skel" style={{ width: '70%' }} /><i className="skel big" /></div>)}</div> : top.length ? (
              <div className="topGrid">
                {top.map((b, i) => {
                  const low = tab === 'bal' && isLow(b);
                  return (
                    <button key={b.item_id} className={`topCard enter ${low ? 'isLow' : ''}`} style={{ animationDelay: `${i * 0.05}s` }} aria-pressed={sel === b.item_id} onClick={() => setSel(b.item_id)}>
                      <span className="nm">{low && <PulseDot />}{b.name}</span>
                      <Num value={tab === 'cons' ? usedOf(b.item_id) : b.balance} className={`big ${low ? 'low' : ''}`} />
                      <span className="small muted">{b.unit} {tab === 'cons' ? 'used' : `in store${low ? ' · low' : ''}`}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="card pad muted empty"><Icon name="chart" size={28} />{tab === 'cons' ? `Nothing was issued in this period (${range.label}).` : 'No deliveries recorded yet.'}</div>
            )}
          </section>

          <section className="stack">
            <div className="between" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <h2>All items</h2>
              {tab === 'cons' ? (
                <span className="row small" style={{ fontWeight: 600 }}>Group by
                  <span className="seg">
                    <button aria-pressed={group === 'none'} onClick={() => setGroup('none')}>None</button>
                    <button aria-pressed={group === 'sub'} onClick={() => setGroup('sub')}>Subphase</button>
                  </span>
                </span>
              ) : (
                <span className="seg" role="group" aria-label="Show">
                  <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
                  <button aria-pressed={filter === 'today'} onClick={() => setFilter('today')}>Changed today ({movedToday.size})</button>
                  <button aria-pressed={filter === 'low'} onClick={() => setFilter('low')}>{lowItems.length > 0 && <PulseDot />}Low only ({lowItems.length})</button>
                </span>
              )}
            </div>
            <div className="tblBar">
              <div className="searchWrap">
                <Icon name="search" size={18} />
                <input ref={searchRef} className="search" type="search" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
                <kbd>/</kbd>
              </div>
              <span className="small muted">{shown.length} of {balances.length} items</span>
              <button className="btn ghost sm" onClick={exportCsv}><Icon name="download" size={16} />Export CSV</button>
            </div>
            <div className="tblWrap">
              {tab === 'cons' && lines === null ? <div className="list">{skeleton}</div> : (
                <table className="dataTbl">
                  <thead>
                    <tr>
                      <th aria-sort={sort.k === 'name' ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}><button onClick={() => sortBy('name')}>Item<Icon name="sort" size={12} /></button></th>
                      <th>Unit</th>
                      {tab === 'bal' ? <>
                        <th className="num" aria-sort={sort.k === 'val' ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}><button onClick={() => sortBy('val')}>Balance<Icon name="sort" size={12} /></button></th>
                        <th className="num hideS">Reorder at</th>
                        <th className="num hideS" aria-sort={sort.k === 'days' ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}><button onClick={() => sortBy('days')}>Days left<Icon name="sort" size={12} /></button></th>
                        <th>Status</th>
                      </> : <>
                        <th className="num hideS">Issued</th>
                        <th className="num hideS">Returned</th>
                        <th className="num" aria-sort={sort.k === 'val' ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}><button onClick={() => sortBy('val')}>Used<Icon name="sort" size={12} /></button></th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {tab === 'bal' && shown.map((b) => trow(b))}
                    {tab === 'cons' && group === 'none' && shown.map((b) => trow(b))}
                    {tab === 'cons' && group === 'sub' && groups.map((g) => [
                      <tr key={g.name} className="grpRow"><td colSpan={5}>{g.name}<span className="muted"> · {g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span></td></tr>,
                      ...g.rows.map(({ b, v }) => trow(b, v, g.name)),
                    ])}
                  </tbody>
                </table>
              )}
              {tab === 'cons' && group === 'sub' && lines !== null && !groups.length && <div className="pad muted">Nothing was issued in this period.</div>}
              {!shown.length && <div className="pad muted">{search ? `No items match “${q}”.` : filter === 'low' && tab === 'bal' ? 'Nothing is low. All good.' : filter === 'today' && tab === 'bal' ? 'No stock moved today.' : 'No items yet. Do the first stock take.'}</div>}
            </div>
            <div className="small muted">Only items that have been in this store are listed. A new item appears the first time it arrives. Click an item for its history and details.</div>
          </section>
        </main>
      </div>
      {selected && <ItemSheet b={selected} mode={tab} use={use.get(selected.item_id)} rangeLabel={range.label} onClose={close} onSaveReorder={saveReorder} />}
    </div>
  );
}
