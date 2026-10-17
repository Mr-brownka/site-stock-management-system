import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Num, PulseDot } from '../components/fx';
import { ItemSheet, type Use } from '../components/ItemSheet';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { periodRange, type Period } from '../lib/dates';
import { useData } from '../lib/store';
import { SUBPHASES, type Balance, type Line } from '../lib/types';

type Tab = 'cons' | 'bal';
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

export function Dashboard() {
  const { day, balances, refresh, go, siteLabel, isLow, lowItems } = useData();
  const [tab, setTab] = useState<Tab>(() => { try { return sessionStorage.getItem('ssms-dash') === 'low' ? 'bal' : 'cons'; } catch { return 'cons'; } });
  const [filter, setFilter] = useState<'all' | 'low'>(() => { try { const v = sessionStorage.getItem('ssms-dash'); sessionStorage.removeItem('ssms-dash'); return v === 'low' ? 'low' : 'all'; } catch { return 'all'; } });
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(day);
  const [group, setGroup] = useState<'none' | 'sub'>('none');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const range = periodRange(period, date || day);
  useEffect(() => { refresh(); }, [refresh]);
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
    .filter((b) => tab !== 'bal' || filter === 'all' || isLow(b))
    .sort(byName);

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

  const row = (b: Balance, value: number | null, i: number) => {
    const low = tab === 'bal' && isLow(b);
    const out = tab === 'bal' && b.balance <= 0;
    return (
      <button key={b.item_id} className={`listRow ${low ? 'isLow' : ''}`} style={i < 24 ? { animationDelay: `${i * 0.015}s` } : undefined} aria-pressed={sel === b.item_id} onClick={() => setSel(b.item_id)}>
        {low ? <PulseDot label="Low stock" /> : <span className="dotSpace" />}
        <span className="nm">{b.name}</span>
        {out ? <span className="tag out">Out</span> : low && <span className="tag low">Low</span>}
        <span className={`q ${low ? 'low' : ''}`} style={value ? undefined : { color: '#A9B1AD' }}>{value ? fmt(value) : '–'}</span>
        <span className="u">{b.unit}</span>
        <span className="chev"><Icon name="arrow" size={16} /></span>
      </button>
    );
  };
  const skeleton = Array.from({ length: 6 }, (_, i) => <div key={i} className="skelRow"><i className="skel" style={{ width: `${40 + ((i * 17) % 40)}%` }} /><i className="skel" style={{ width: 60 }} /></div>);

  return (
    <div className="dash">
      <div className="dashTop">
        <div>
          <button className="back" onClick={() => go('home')}>← Back to check-in</button>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '.08em', color: '#B9C0BC' }}>{siteLabel}{api.mode === 'demo' ? ' · DEMO' : ''}</div>
          <h1>Store dashboard</h1>
        </div>
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
              {tab === 'cons' && (
                <>
                  <div className="seg" role="group" aria-label="Period">
                    {([['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']] as [Period, string][]).map(([p, l]) => (
                      <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{l}</button>
                    ))}
                  </div>
                  <label className="row small" style={{ fontWeight: 600 }}>{period === 'day' ? 'Day' : period === 'week' ? 'Any day in the week' : 'Any day in the month'}
                    <input className="dateBox" type="date" value={date} max={day} onChange={(e) => setDate(e.target.value || day)} />
                  </label>
                  {date !== day && <button className="btn link" onClick={() => setDate(day)}>Back to today</button>}
                </>
              )}
            </div>
            <div className="small muted">{tab === 'cons' ? `The most used item in each unit · ${range.label}` : 'The items delivered most often since the project started'}</div>
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
                  <button aria-pressed={filter === 'low'} onClick={() => setFilter('low')}>{lowItems.length > 0 && <PulseDot />}Low only ({lowItems.length})</button>
                </span>
              )}
            </div>
            <div className="searchWrap">
              <Icon name="search" size={18} />
              <input ref={searchRef} className="search" type="search" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
              <kbd>/</kbd>
            </div>
            <div className="list">
              {tab === 'cons' && lines === null ? skeleton : (
                <>
                  {tab === 'bal' && shown.map((b, i) => row(b, b.balance, i))}
                  {tab === 'cons' && group === 'none' && shown.map((b, i) => row(b, usedOf(b.item_id), i))}
                  {tab === 'cons' && group === 'sub' && groups.map((g) => (
                    <div key={g.name}>
                      <div className="groupHead"><span>{g.name}</span><span className="small muted">{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span></div>
                      {g.rows.map(({ b, v }, i) => row(b, v, i))}
                    </div>
                  ))}
                  {tab === 'cons' && group === 'sub' && !groups.length && <div className="pad muted">Nothing was issued in this period.</div>}
                  {!shown.length && <div className="pad muted">{search ? `No items match “${q}”.` : filter === 'low' && tab === 'bal' ? 'Nothing is low. All good.' : 'No items yet. Enter the opening count first.'}</div>}
                </>
              )}
            </div>
            <div className="small muted">Only items that have been in this store are listed. A new item appears the first time it arrives. Tap an item for details.</div>
          </section>
        </main>
      </div>
      {selected && <ItemSheet b={selected} mode={tab} use={use.get(selected.item_id)} rangeLabel={range.label} onClose={close} onSaveReorder={saveReorder} />}
    </div>
  );
}
