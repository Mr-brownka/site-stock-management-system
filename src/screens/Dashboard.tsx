import { useEffect, useMemo, useState } from 'react';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate, periodRange, weekday, type Period } from '../lib/dates';
import { useData } from '../lib/store';
import { SUBPHASES, type Balance, type Doc, type Line } from '../lib/types';

type Tab = 'cons' | 'bal';
const NO_SUB = 'No subphase';

interface Use { issued: number; returned: number; used: number; bySub: Map<string, number> }

function usage(lines: Line[]): Map<number, Use> {
  const m = new Map<number, Use>();
  const get = (id: number) => m.get(id) ?? (m.set(id, { issued: 0, returned: 0, used: 0, bySub: new Map() }), m.get(id)!);
  const issueSub = new Map(lines.filter((l) => l.kind === 'issue').map((l) => [l.id, l.subphase]));
  for (const l of lines) {
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
  const { day, balances, refresh, go, site } = useData();
  const [tab, setTab] = useState<Tab>('cons');
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(day);
  const [group, setGroup] = useState<'none' | 'sub'>('none');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [recent, setRecent] = useState<Doc[]>([]);
  const [reorderDraft, setReorderDraft] = useState('');

  const range = periodRange(period, date || day);
  useEffect(() => { refresh(); api.documents(addDays(day, -27), day).then(setRecent); }, [refresh, day]);
  useEffect(() => { setLines(null); api.linesBetween(range.from, range.to).then(setLines); }, [range.from, range.to]);

  const use = useMemo(() => usage(lines ?? []), [lines]);
  // Average daily use over the last 14 days, not counting Sundays.
  const avg = useMemo(() => {
    const from = addDays(day, -13);
    const u = usage(recent.filter((d) => d.doc_date >= from).flatMap((d) => d.lines));
    let workdays = 0;
    for (let i = 0; i < 14; i++) if (weekday(addDays(day, -i)) !== 'Sun') workdays++;
    return new Map([...u].map(([id, x]) => [id, x.used / workdays]));
  }, [recent, day]);

  const isLow = (b: Balance) => {
    if (b.reorder_level != null && b.balance <= b.reorder_level) return true;
    const a = avg.get(b.item_id) ?? 0;
    return a > 0 && b.balance / a <= 5;
  };
  const usedOf = (id: number) => use.get(id)?.used ?? 0;
  const byName = (a: Balance, b: Balance) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  const search = q.trim().toLowerCase();
  const shown = balances.filter((b) => !search || b.name.toLowerCase().includes(search)).sort(byName);

  const top = useMemo(() => {
    if (tab === 'bal') return balances.filter((b) => b.deliveries > 0).sort((a, b) => b.deliveries - a.deliveries || byName(a, b)).slice(0, 5);
    const units = [...new Set(balances.map((b) => b.unit))].sort();
    return units.map((u) => balances.filter((b) => b.unit === u && usedOf(b.item_id) > 0).sort((a, b) => usedOf(b.item_id) - usedOf(a.item_id))[0]).filter(Boolean) as Balance[];
  }, [tab, balances, use]);

  const selected = balances.find((b) => b.item_id === sel) ?? null;
  useEffect(() => { setReorderDraft(selected?.reorder_level == null ? '' : String(selected.reorder_level)); }, [sel, selected?.reorder_level]);

  const saveReorder = async () => {
    if (!selected) return;
    const v = reorderDraft.trim() === '' ? null : Number(reorderDraft);
    if (v != null && !(v >= 0)) return;
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

  const moves = (id: number) => recent.flatMap((d) => d.lines.filter((l) => l.item_id === id).map((l) => ({ d, l })))
    .sort((a, b) => b.d.doc_date.localeCompare(a.d.doc_date) || b.l.id - a.l.id).slice(0, 8)
    .map(({ d, l }) => {
      const label = { opening: 'Opening count', delivery: `Delivered · ${d.party ?? ''}`, issue: `Issued · card ${d.ref_no}`, return: `Returned · card ${d.ref_no}`,
        transfer_in: `Received · ${d.party}`, transfer_out: `Sent · ${d.party}`, correction: 'Correction' }[d.kind];
      const sign = d.kind === 'issue' || d.kind === 'transfer_out' ? '−' : '+';
      return { key: l.id, a: `${niceDate(d.doc_date)} · ${label}`, b: `${sign}${fmt(l.qty)}` };
    });

  const row = (b: Balance, value: number | null, unitText?: string) => {
    const low = tab === 'bal' && isLow(b);
    return (
      <button key={b.item_id} className="listRow" aria-pressed={sel === b.item_id} onClick={() => setSel(b.item_id)}>
        <span className="nm">{b.name}</span>
        {low && <span className="lowTag">Low</span>}
        <span className={`q ${low ? 'low' : ''}`} style={value ? undefined : { color: '#A9B1AD' }}>{value ? fmt(value) : '–'}</span>
        <span className="u">{unitText ?? b.unit}</span>
      </button>
    );
  };

  return (
    <div className="dash">
      <div className="dashTop">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div>
            <button className="back" onClick={() => go('home')}>← Back to check-in</button>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '.08em', color: '#B9C0BC' }}>SITE STORE · {site.toUpperCase()}{api.mode === 'demo' ? ' · DEMO' : ''}</div>
            <h1>Store dashboard</h1>
          </div>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'cons'} onClick={() => setTab('cons')}>Consumption</button>
          <button role="tab" aria-selected={tab === 'bal'} onClick={() => setTab('bal')}>Balances</button>
        </div>
      </div>

      <div className="dashBody">
        <main className="dashMain">
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
            {tab === 'cons' && lines === null ? <div className="muted">Loading…</div> : top.length ? (
              <div className="topGrid">
                {top.map((b, i) => {
                  const low = tab === 'bal' && isLow(b);
                  return (
                    <button key={b.item_id} className="topCard enter" style={{ animationDelay: `${i * 0.04}s` }} aria-pressed={sel === b.item_id} onClick={() => setSel(b.item_id)}>
                      <span className="nm">{b.name}</span>
                      <span className={`big ${low ? 'low' : ''}`}>{fmt(tab === 'cons' ? usedOf(b.item_id) : b.balance)}</span>
                      <span className="small muted">{b.unit} {tab === 'cons' ? 'used' : `in store${low ? ' · low' : ''}`}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="card pad muted">{tab === 'cons' ? `Nothing was issued in this period (${range.label}).` : 'No deliveries recorded yet.'}</div>
            )}
          </section>

          <section className="stack">
            <div className="between" style={{ alignItems: 'center' }}>
              <h2>All items</h2>
              {tab === 'cons' && (
                <span className="row small" style={{ fontWeight: 600 }}>Group by
                  <span className="seg">
                    <button aria-pressed={group === 'none'} onClick={() => setGroup('none')}>None</button>
                    <button aria-pressed={group === 'sub'} onClick={() => setGroup('sub')}>Subphase</button>
                  </span>
                </span>
              )}
            </div>
            <input className="search" type="search" placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
            <div className="list">
              {tab === 'bal' && shown.map((b) => row(b, b.balance))}
              {tab === 'cons' && group === 'none' && shown.map((b) => row(b, usedOf(b.item_id)))}
              {tab === 'cons' && group === 'sub' && groups.map((g) => (
                <div key={g.name}>
                  <div className="groupHead"><span>{g.name}</span><span className="small muted">{g.rows.length} item{g.rows.length === 1 ? '' : 's'}</span></div>
                  {g.rows.map(({ b, v }) => row(b, v))}
                </div>
              ))}
              {tab === 'cons' && group === 'sub' && !groups.length && <div className="pad muted">Nothing was issued in this period.</div>}
              {!shown.length && <div className="pad muted">{search ? `No items match “${q}”.` : 'No items yet. Enter the opening count first.'}</div>}
            </div>
            <div className="small muted">Only items that have been in this store are listed. A new item appears the first time it arrives.</div>
          </section>
        </main>

        <aside className={`detail ${selected ? '' : 'closed'}`} aria-label="Item details">
          {selected ? (
            <>
              <div className="between">
                <div className="small muted">{tab === 'cons' ? `Consumption · ${range.label}` : 'Balance now'}</div>
                <button className="btn link closeBtn" onClick={() => setSel(null)}>Close</button>
              </div>
              <h3>{selected.name}</h3>
              {tab === 'cons' ? (() => {
                const u = use.get(selected.item_id);
                const subs = u ? [...u.bySub].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) : [];
                return (
                  <>
                    <div>
                      <div className="stat"><span>Issued</span><span className="v">{fmt(u?.issued ?? 0)} {selected.unit}</span></div>
                      <div className="stat"><span>Returned</span><span className="v">{fmt(u?.returned ?? 0)} {selected.unit}</span></div>
                      <div className="stat"><span>Used</span><span className="v big low">{fmt(u?.used ?? 0)} {selected.unit}</span></div>
                    </div>
                    <div className="stack" style={{ gap: 2 }}>
                      <b>By subphase</b>
                      {subs.length ? subs.map(([s, v]) => <div className="mv" key={s}><span>{s}</span><span className="mono">{fmt(v)} {selected.unit}</span></div>) : <div className="muted small">Not used in this period.</div>}
                    </div>
                  </>
                );
              })() : (() => {
                const a = avg.get(selected.item_id) ?? 0;
                const days = a > 0 ? Math.round(selected.balance / a) : null;
                const low = isLow(selected);
                return (
                  <>
                    <div>
                      <div className="stat"><span>In store</span><span className={`v big ${low ? 'low' : ''}`}>{fmt(selected.balance)} {selected.unit}</span></div>
                      <div className="stat"><span>Lasts about</span><span className="v">{days == null ? '–' : days > 30 ? '30+ days' : `${days} days`}</span></div>
                      <div className="stat" style={{ alignItems: 'center' }}><span>Reorder level</span>
                        <span className="row" style={{ gap: 6 }}>
                          <input className="input num" style={{ width: 90, minHeight: 40 }} inputMode="decimal" value={reorderDraft} placeholder="Not set" aria-label="Reorder level" onChange={(e) => setReorderDraft(e.target.value.replace(/[^0-9.]/g, ''))} />
                          <button className="btn link" onClick={saveReorder} disabled={reorderDraft === (selected.reorder_level == null ? '' : String(selected.reorder_level))}>Save</button>
                        </span>
                      </div>
                      <div className="small muted" style={{ marginTop: 4 }}>Agree reorder levels with the site manager.</div>
                    </div>
                    <div className="stack" style={{ gap: 2 }}>
                      <b>Recent movements</b>
                      {moves(selected.item_id).map((m) => <div className="mv" key={m.key}><span className="muted">{m.a}</span><span className="mono">{m.b}</span></div>)}
                      {!moves(selected.item_id).length && <div className="muted small">No movements in the last 4 weeks.</div>}
                    </div>
                    {low && <div className="note">Low stock. Tell the site manager so it can be ordered.</div>}
                  </>
                );
              })()}
            </>
          ) : (
            <div className="muted">Tap an item to see its details.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
