import { useEffect, useMemo, useRef, useState } from 'react';
import { SiteLogo } from '../components/Brand';
import { ask, toast } from '../components/feedback';
import { Icon } from '../components/fx';
import { fmt, TimeBoxes } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import type { Item, StockTake as Take } from '../lib/types';
import { Upload } from './Opening';

type Tab = 'sheet' | 'import' | 'history';
type Step = 'print' | 'enter' | 'confirm';
const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** One plain list: numbers first (0–9), then A–Z, like the original item list. */
function sorted(items: Item[]) {
  return [...items].sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'en', { sensitivity: 'base', numeric: true }));
}

/** The orange paper sheet the storekeeper prints and writes on. */
export function StockSheet({ items, values, head, title = 'Stock take sheet' }: { items: Item[]; values?: Record<number, string | number>; head?: { date?: string; start?: string | null; end?: string | null; by?: string | null; checked?: string | null }; title?: string }) {
  const { company, site } = useData();
  const list = sorted(items);
  return (
    <div className="stSheet">
      <header className="stHead">
        <div className="stBrand">{site && <SiteLogo name={site} height={54} />}<div><b>{(company || 'Comex Builders').toUpperCase()}</b><span>{site} · Site store</span></div></div>
        <div className="stTitle"><h2>{title}</h2><span>{items.length} items · count what is physically in the store</span></div>
      </header>
      <div className="stFields">
        <div><span>Date</span><b>{head?.date ? nice(head.date) : ''}</b></div>
        <div><span>Start time</span><b>{head?.start ?? ''}</b></div>
        <div><span>End time</span><b>{head?.end ?? ''}</b></div>
        <div><span>Counted by</span><b>{head?.by ?? ''}</b></div>
        <div><span>Signature</span><b /></div>
      </div>
      <table className="stTable">
        <thead><tr><th>No.</th><th>Item</th><th>Unit</th><th>Quantity counted</th><th>Remarks</th></tr></thead>
        <tbody>
          {list.map((it, i) => { const v = values?.[it.id]; return <tr key={it.id}><td>{i + 1}</td><td>{it.name}</td><td>{it.unit}</td><td className="stQty">{v === undefined || v === '' ? '' : fmt(Number(v))}</td><td /></tr>; })}
        </tbody>
      </table>
      <footer className="stFoot">Write clearly. One number per box. Cross out mistakes and write the right number next to it. · Site Stock · {company || 'Comex Builders'}</footer>
    </div>
  );
}

function printSheet() {
  document.body.classList.add('printSheet');
  const done = () => { document.body.classList.remove('printSheet'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}

export function StockTake() {
  const { day, user, balances, go, siteLabel, refresh, weekInfo, refreshWeek, itemById } = useData();
  const first = !balances.length;
  const [tab, setTab] = useState<Tab>('sheet');
  const [step, setStep] = useState<Step>('print');
  const [list, setList] = useState<Item[] | null>(null);
  const [imported, setImported] = useState<Item[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [head, setHead] = useState({ date: day, start: '', end: '', by: user.name, checked: '' });
  const [week, setWeek] = useState('');
  const [busy, setBusy] = useState(false);
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [q, setQ] = useState('');
  const rowsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.checklist().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { if (tab === 'history') api.stockTakes().then(setTakes); }, [tab]);

  const items = imported ?? list ?? [];
  const ordered = useMemo(() => sorted(items), [items]);
  const entered = ordered.filter((it) => (qty[it.id] ?? '') !== '').length;
  const blanks = ordered.filter((it) => (qty[it.id] ?? '') === '');
  const needWeek = first && weekInfo.anchorNo == null;

  const nextRow = (el: HTMLElement) => {
    const all = [...(rowsRef.current?.querySelectorAll<HTMLInputElement>('input.stIn') ?? [])];
    const i = all.indexOf(el as HTMLInputElement);
    all[i + 1]?.focus(); all[i + 1]?.select();
  };

  const confirm = async () => {
    if (needWeek && !(Number(week) >= 1)) { toast('Enter the project week first', 'warn'); return; }
    if (blanks.length && !(await ask({ title: `${blanks.length} item${blanks.length === 1 ? '' : 's'} left blank`, body: <p>Blank items are recorded as <b>not counted</b>{first ? ' and start at zero' : ''}. Go back if you wrote a number for them.</p>, yes: 'Save anyway', no: 'Go back' }))) return;
    setBusy(true);
    try {
      await api.saveStockTake({ count_date: head.date, start_time: head.start || null, end_time: head.end || null, counted_by: head.by || null, checked_by: head.checked || null,
        lines: ordered.filter((it) => (qty[it.id] ?? '') !== '').map((it) => ({ item_id: it.id, qty: Number(qty[it.id]) })) });
      if (needWeek) await api.setProjectWeek(Number(week));
      await Promise.all([refresh(), refreshWeek()]);
      toast(first ? 'First stock take saved · balances are ready' : 'Stock take saved');
      go('home');
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(false); }
  };

  const STEPS: [Step, string][] = [['print', 'Print & count'], ['enter', 'Enter quantities'], ['confirm', 'Confirm']];
  const shown = q.trim() ? ordered.filter((it) => it.name.toLowerCase().includes(q.trim().toLowerCase())) : ordered;

  return (
    <div className="phone stocktake">
      <header className="top">
        <button className="back" onClick={() => go('home')}>← Back to check-in</button>
        <div className="kicker"><span>{siteLabel}</span></div>
        <h1>{first ? 'First stock take' : 'Stock take'}</h1>
        <div className="sub">{first ? 'Count the store once. Every balance starts from this count.' : 'Count the store and keep the record. Balances change only when confirmed.'}</div>
      </header>
      <main className="body">
        <div className="seg stTabs" role="tablist">
          <button role="tab" aria-pressed={tab === 'sheet'} onClick={() => { setTab('sheet'); setImported(null); }}>Checklist</button>
          <button role="tab" aria-pressed={tab === 'import'} onClick={() => setTab('import')}>Import Excel / CSV</button>
          <button role="tab" aria-pressed={tab === 'history'} onClick={() => setTab('history')}>All stock takes</button>
        </div>

        {tab !== 'history' && (tab === 'sheet' || imported) && (
          <ol className="stSteps">
            {STEPS.map(([k, l], i) => <li key={k} className={step === k ? 'on' : STEPS.findIndex(([x]) => x === step) > i ? 'done' : ''}><span>{STEPS.findIndex(([x]) => x === step) > i ? '✓' : i + 1}</span>{l}</li>)}
          </ol>
        )}

        {tab === 'sheet' && list === null && <div className="card pad muted">Loading the store’s item list…</div>}
        {tab === 'sheet' && list && !list.length && (
          <div className="note stack">
            <b>This store’s item list is not ready yet.</b>
            <span>The admin lists the items in each store first (without quantities). Then the sheet appears here to print.</span>
            {user.role === 'admin' && <span>Admin: open <b>Admin page → Sites → Stock take list</b>.</span>}
          </div>
        )}

        {/* Step 1: print and count */}
        {tab === 'sheet' && !!list?.length && step === 'print' && (
          <>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn accent" style={{ flex: '1 1 240px' }} onClick={printSheet}><Icon name="card" />Print the sheet</button>
              <button className="btn" style={{ flex: '1 1 240px' }} onClick={() => setStep('enter')}>I’ve counted · enter the quantities<Icon name="arrow" /></button>
            </div>
            <div className="photoSoon">
              <span className="psIcon"><Icon name="search" size={24} /></span>
              <div><b>Snap a photo of the filled sheet</b><span>Coming soon: the app will read the numbers from a photo for you to check. For now, type them in (step 2).</span></div>
              <span className="pill grey">Coming soon</span>
            </div>
            <div className="stPreview"><StockSheet items={list} /></div>
          </>
        )}

        {/* Import: Excel / CSV → same confirm step */}
        {tab === 'import' && !imported && (
          <>
            <div className="note info">Have the count in an Excel or CSV file? Upload it. Lines are matched to the item list, then you confirm the date and times.</div>
            <Upload first={first} onPairs={async (pairs) => { setImported(pairs.map(([it]) => it)); setQty(Object.fromEntries(pairs.map(([it, n]) => [it.id, String(n)]))); setStep('confirm'); }} />
          </>
        )}

        {/* Step 2: enter quantities, names locked */}
        {(tab === 'sheet' || imported) && step === 'enter' && (
          <>
            <div className="card pad stHeadForm enter">
              <label className="field"><span>Date of the count</span><input className="input" type="date" value={head.date} max={day} onChange={(e) => setHead({ ...head, date: e.target.value || day })} /></label>
              <TimeBoxes label="Start time" value={head.start} onChange={(v) => setHead({ ...head, start: v })} glow={!head.start} />
              <TimeBoxes label="End time" value={head.end} onChange={(v) => setHead({ ...head, end: v })} glow={!!head.start && head.start.length === 5 && !head.end} onDone={() => (rowsRef.current?.querySelector('input.stIn') as HTMLInputElement | null)?.focus()} />
              <label className="field"><span>Counted by</span><input className="input" value={head.by} onChange={(e) => setHead({ ...head, by: e.target.value })} /></label>
            </div>
            <div className="stProgress"><div><b>{entered}</b> of {ordered.length} entered</div><span className="gauge"><i style={{ width: `${(entered / Math.max(1, ordered.length)) * 100}%` }} /></span></div>
            <div className="searchWrap"><Icon name="search" size={18} /><input className="search" type="search" placeholder="Jump to an item" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="stRows" ref={rowsRef}>
              {(() => (
                <div>
                  {shown.map((it) => {
                    const v = qty[it.id] ?? '';
                    return (
                      <label key={it.id} className={`stRow ${v !== '' ? 'filled' : ''}`}>
                        <span className="stName" title="Item names come from the admin’s list and cannot be changed here"><Icon name="checkin" size={14} />{it.name}</span>
                        <span className="stUnit">{it.unit}</span>
                        <input className="input num stIn" inputMode="decimal" value={v} placeholder="0" aria-label={`${it.name} quantity`}
                          onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(/[^0-9.]/g, '') })}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextRow(e.currentTarget); } }} />
                      </label>
                    );
                  })}
                </div>
              ))()}
            </div>
            <div className="stickyBar">
              <button className="btn ghost" onClick={() => setStep('print')}>← Back</button>
              <button className="btn accent" onClick={() => setStep('confirm')}>Review {entered} item{entered === 1 ? '' : 's'}<Icon name="arrow" /></button>
            </div>
          </>
        )}

        {/* Step 3: confirm */}
        {(tab === 'sheet' || imported) && step === 'confirm' && (
          <>
            <div className="repTiles enter">
              <div className="statTile"><span className="label">Counted</span><span className="statBig">{entered}</span></div>
              <div className={`statTile ${blanks.length ? 'alert' : ''}`}><span className="label">Left blank</span><span className="statBig">{blanks.length}</span></div>
              <div className="statTile"><span className="label">Date</span><span className="statBig" style={{ fontSize: 18 }}>{nice(head.date)}</span></div>
              <div className="statTile"><span className="label">Time</span><span className="statBig" style={{ fontSize: 18 }}>{head.start || '–'} – {head.end || '–'}</span></div>
            </div>
            {imported && (
              <div className="card pad stHeadForm">
                <label className="field"><span>Date of the count</span><input className="input" type="date" value={head.date} max={day} onChange={(e) => setHead({ ...head, date: e.target.value || day })} /></label>
                <TimeBoxes label="Start time" value={head.start} onChange={(v) => setHead({ ...head, start: v })} />
                <TimeBoxes label="End time" value={head.end} onChange={(v) => setHead({ ...head, end: v })} />
                <label className="field"><span>Counted by</span><input className="input" value={head.by} onChange={(e) => setHead({ ...head, by: e.target.value })} /></label>
              </div>
            )}
            {needWeek && (
              <div className="card pad weekAsk enter">
                <b>Which week of the project is this?</b>
                <span className="small muted">Withdrawal cards show the project week. The app counts on from here and pauses by itself for weeks the site is closed (like the December break). The admin can correct it later.</span>
                <label className="field" style={{ maxWidth: 200 }}><span>Project week</span><input className="input num" inputMode="numeric" value={week} placeholder="e.g. 46" onChange={(e) => setWeek(e.target.value.replace(/\D/g, ''))} /></label>
              </div>
            )}
            <div className="stPreview"><StockSheet items={ordered} values={qty} head={{ date: head.date, start: head.start, end: head.end, by: head.by, checked: head.checked }} title={first ? 'First stock take' : 'Stock take'} /></div>
            <div className="stickyBar">
              <button className="btn ghost" onClick={() => imported ? (setImported(null), setStep('print')) : setStep('enter')}>← Back</button>
              <button className="btn ok" disabled={busy} onClick={confirm}>{busy ? 'Saving…' : first ? 'Confirm · start the balances' : 'Confirm stock take'}</button>
            </div>
            {first && <div className="small muted">After confirming you go to the check-in. From tonight, every delivery, card, return and transfer moves these balances.</div>}
          </>
        )}

        {/* History */}
        {tab === 'history' && (
          <>
            <div className="confirmBal">
              <div><b>Confirm balances</b><span>Compare a stock take with the system balances and agree the differences. We will design this step together.</span></div>
              <button className="btn ghost" disabled>Confirm balances · coming soon</button>
            </div>
            {!takes ? <div className="card pad muted">Loading…</div> : !takes.length ? <div className="card pad muted">No stock takes yet.</div> : takes.map((t) => (
              <details key={t.id} className="stTake">
                <summary>
                  <span className="stTakeDate"><b>{nice(t.count_date)}</b><span className="small muted">{t.start_time ?? '–'} – {t.end_time ?? '–'} · counted by {t.counted_by ?? '–'}</span></span>
                  <span className="pill">{t.lines.length} items</span>
                  <span className={`pill ${t.is_first ? 'done' : t.status === 'confirmed' ? 'done' : ''}`}>{t.is_first ? 'Opening balances' : t.status === 'confirmed' ? 'Confirmed' : 'Recorded'}</span>
                </summary>
                <div className="stPreview"><StockSheet items={t.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]} values={Object.fromEntries(t.lines.map((l) => [l.item_id, l.qty]))} head={{ date: t.count_date, start: t.start_time, end: t.end_time, by: t.counted_by, checked: t.checked_by }} title={t.is_first ? 'First stock take' : 'Stock take'} /></div>
              </details>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
