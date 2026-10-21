import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SiteLogo } from '../components/Brand';
import { toast } from '../components/feedback';
import { Icon } from '../components/fx';
import { fmt, TimeBoxes } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import type { Item, StockTake as Take } from '../lib/types';
import { Upload } from './Opening';
import { BackPill } from '../components/BackPill';

type View = 'home' | 'enter' | 'upload';
const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** One plain list: numbers first (0–9), then A–Z, like the original item list. */
function sorted(items: Item[]) {
  return [...items].sort((a, b) => a.name.trim().localeCompare(b.name.trim(), 'en', { sensitivity: 'base', numeric: true }));
}

/** The orange paper sheet the store prints and writes on. */
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
  const { day, user, balances, go, site, refresh, weekInfo, refreshWeek, itemById, balanceOf } = useData();
  const first = !balances.length;
  const [view, setView] = useState<View>('home');
  const [list, setList] = useState<Item[] | null>(null);
  const [imported, setImported] = useState<Item[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [head, setHead] = useState({ date: day, start: '', end: '', by: user.name, checked: '' });
  const [week, setWeek] = useState('');
  const [busy, setBusy] = useState(false);
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyBlank, setOnlyBlank] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [openTake, setOpenTake] = useState<Take | null>(null);
  const [printing, setPrinting] = useState<{ items: Item[]; values?: Record<number, number>; take?: Take } | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  // A long count can be put down and picked up later on this device.
  const draftKey = `ssms-stdraft:${site}:${user.email}`;
  const [hasDraft, setHasDraft] = useState(() => { try { return !!localStorage.getItem(draftKey); } catch { return false; } });

  useEffect(() => { api.checklist().then(setList).catch(() => setList([])); }, []);
  const loadTakes = () => api.stockTakes().then((t) => setTakes([...t].sort((a, b) => a.created_at.localeCompare(b.created_at)))).catch(() => setTakes([]));
  useEffect(() => { loadTakes(); }, []);
  useEffect(() => { try { setHasDraft(!!localStorage.getItem(draftKey)); } catch { /* ignore */ } }, [draftKey]);

  const items = imported ?? list ?? [];
  const ordered = useMemo(() => sorted(items), [items]);
  const entered = ordered.filter((it) => (qty[it.id] ?? '') !== '').length;
  const blanks = ordered.filter((it) => (qty[it.id] ?? '') === '');
  const differ = ordered.filter((it) => (qty[it.id] ?? '') !== '' && Number(qty[it.id]) !== balanceOf(it.id)).length;
  const needWeek = first && weekInfo.anchorNo == null;
  const last = takes?.length ? takes[takes.length - 1] : null;
  const ago = last ? Math.round((Date.parse(day) - Date.parse(last.count_date)) / 864e5) : 0;
  const refOf = (t: Take) => `ST-${String((takes?.indexOf(t) ?? 0) + 1).padStart(4, '0')}`;

  const nextRow = (el: HTMLElement) => {
    const all = [...(rowsRef.current?.querySelectorAll<HTMLInputElement>('input.stIn') ?? [])];
    const i = all.indexOf(el as HTMLInputElement);
    all[i + 1]?.focus(); all[i + 1]?.select();
  };
  const print = (p: { items: Item[]; values?: Record<number, number>; take?: Take }) => { setPrinting(p); setTimeout(printSheet, 60); };

  const startTyping = () => {
    setChoosing(false); setImported(null);
    let resumed = false;
    try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d) { setQty(d.qty ?? {}); setHead({ ...head, ...d.head }); resumed = true; } } catch { /* ignore */ }
    if (!resumed) { setQty({}); setHead({ date: day, start: '', end: '', by: user.name, checked: '' }); }
    else toast('Picked up the count where you left off');
    setOnlyBlank(false); setQ(''); setView('enter'); window.scrollTo(0, 0);
  };
  const keepForLater = () => {
    try { localStorage.setItem(draftKey, JSON.stringify({ qty, head })); setHasDraft(true); } catch { /* ignore */ }
    toast(`Saved on this device · ${entered} of ${ordered.length} entered`); setView('home');
  };
  const dropDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } setHasDraft(false); };

  const save = async () => {
    if (needWeek && !(Number(week) >= 1)) { toast('Enter the project week first', 'warn'); return; }
    setBusy(true);
    try {
      await api.saveStockTake({ count_date: head.date, start_time: head.start || null, end_time: head.end || null, counted_by: head.by || null, checked_by: head.checked || null,
        lines: ordered.filter((it) => (qty[it.id] ?? '') !== '').map((it) => ({ item_id: it.id, qty: Number(qty[it.id]) })) });
      if (needWeek) await api.setProjectWeek(Number(week));
      if (!imported) dropDraft();
      await Promise.all([refresh(), refreshWeek(), loadTakes()]);
      toast(first ? 'First stock take saved · balances are ready' : 'Stock take saved');
      setReviewing(false); setImported(null); setQty({}); setView('home');
      if (first) go('home');
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(false); }
  };

  const shown = ordered.filter((it) => (!onlyBlank || (qty[it.id] ?? '') === '') && (!q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase())));
  const dShort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const printLayer = printing && createPortal(<div className="stPreview stPrintOnly" aria-hidden="true"><StockSheet items={printing.items} values={printing.values}
    head={printing.take ? { date: printing.take.count_date, start: printing.take.start_time, end: printing.take.end_time, by: printing.take.counted_by } : undefined}
    title={printing.take?.is_first ? 'First stock take' : 'Stock take sheet'} /></div>, document.body);

  if (view === 'upload') return (
    <div className="entryPage">
      <header className="entryHead enter">
        <BackPill label="Stock take" onClick={() => setView('home')} />
        <div className="entryTitle"><div><h1>New stock take · from a file</h1><p>Upload the count. Bohari matches each line to {site || 'the store'}’s item list, then you check it before saving.</p></div></div>
      </header>
      <Upload first={first} onPairs={async (pairs) => {
        setImported(pairs.map(([it]) => it)); setQty(Object.fromEntries(pairs.map(([it, n]) => [it.id, String(n)])));
        setHead({ date: day, start: '', end: '', by: user.name, checked: '' }); setOnlyBlank(false); setQ(''); setView('enter');
      }} />
    </div>
  );

  if (view === 'enter') return (
    <div className="entryPage stEnterPage">
      <header className="entryHead enter">
        <BackPill label="Stock take" onClick={() => setView('home')} />
        <div className="entryTitle"><div><h1>{first ? 'First stock take' : 'New stock take'}</h1><p>{imported ? 'Numbers from your file are filled in. Check them, then save.' : 'Type each count as you go, or copy it from the sheet. Enter moves to the next item.'}</p></div></div>
      </header>
      <section className="panel stHeadBar">
        <label className="field"><span>Date of the count</span><input className="input" type="date" value={head.date} max={day} onChange={(e) => setHead({ ...head, date: e.target.value || day })} /></label>
        <TimeBoxes label="Start" value={head.start} onChange={(v) => setHead({ ...head, start: v })} glow={!head.start} />
        <TimeBoxes label="End" value={head.end} onChange={(v) => setHead({ ...head, end: v })} onDone={() => (rowsRef.current?.querySelector('input.stIn') as HTMLInputElement | null)?.focus()} />
        <label className="field stBy"><span>Counted by</span><input className="input" value={head.by} onChange={(e) => setHead({ ...head, by: e.target.value })} /></label>
        <div className="stProg"><span><b className="mono">{entered}</b> of {ordered.length} entered</span><span className="gauge"><i style={{ width: `${(entered / Math.max(1, ordered.length)) * 100}%` }} /></span></div>
      </section>
      <section className="panel stListPanel">
        <div className="stListBar">
          <label className="recSearch stFind"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to an item" aria-label="Jump to an item" /></label>
          <span className="seg" role="group" aria-label="Show">
            <button aria-pressed={!onlyBlank} onClick={() => setOnlyBlank(false)}>All {ordered.length}</button>
            <button aria-pressed={onlyBlank} onClick={() => setOnlyBlank(true)}>Not entered {blanks.length}</button>
          </span>
        </div>
        <div className="stGrid" ref={rowsRef}>
          {shown.map((it) => {
            const v = qty[it.id] ?? '';
            return (
              <label key={it.id} className={`stCell ${v !== '' ? 'filled' : ''}`}>
                <span className="stTick" aria-hidden="true">{v !== '' && <Icon name="check" size={11} />}</span>
                <span className="stName" title={it.name}>{it.name}</span>
                <span className="stUnit">{it.unit}</span>
                <input className="input num stIn" inputMode="decimal" value={v} placeholder="—" aria-label={`${it.name} quantity`}
                  onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(/[^0-9.]/g, '') })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextRow(e.currentTarget); } }} />
              </label>
            );
          })}
          {!shown.length && <div className="pad muted">{onlyBlank ? 'Everything has a number.' : 'No item matches.'}</div>}
        </div>
      </section>
      <div className="actionBar">
        <button className="btn ghost sm" onClick={() => { setView('home'); if (imported) setImported(null); }}>Cancel</button>
        {!imported && <button className="btn link" onClick={keepForLater}>Save and finish later</button>}
        <span className="abGrow" />
        <span className="small muted abHint">Blank = not counted</span>
        <button className="btn accent sm" disabled={!entered} onClick={() => setReviewing(true)}>Review & save<Icon name="arrow" size={16} /></button>
      </div>
      {reviewing && createPortal(
        <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setReviewing(false); }}>
          <section className="dayAsk stReview" role="dialog" aria-modal="true" aria-labelledby="stRevTitle">
            <span className="daKicker">Save stock take</span>
            <h2 id="stRevTitle">{nice(head.date)}{head.start || head.end ? ` · ${head.start || '–'} – ${head.end || '–'}` : ''}</h2>
            <div className="stRevNums">
              <div className="ok"><span>Counted</span><b className="mono">{entered}</b></div>
              <div className={blanks.length ? 'warn' : ''}><span>Left blank</span><b className="mono">{blanks.length}</b></div>
              {!first && <div><span>Differ from system</span><b className="mono">{differ}</b></div>}
            </div>
            {blanks.length > 0 && <p className="askDraft"><b>{blanks.length} left blank:</b> {blanks.slice(0, 4).map((b) => b.name).join(', ')}{blanks.length > 4 ? ` and ${blanks.length - 4} more` : ''}. {first ? 'They start at zero.' : 'They’re recorded as not counted.'}</p>}
            {needWeek && (
              <label className="field" style={{ maxWidth: 220 }}><span>Which week of the project is this?</span><input className="input num" inputMode="numeric" value={week} placeholder="e.g. 46" onChange={(e) => setWeek(e.target.value.replace(/\D/g, ''))} /></label>
            )}
            <span className="small muted">{first ? 'Every balance starts from this count. From tonight, each delivery, card, return and transfer moves them.' : 'Saving keeps the record. Balances don’t change until the differences are agreed.'}</span>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn ghost sm" disabled={busy} onClick={() => setReviewing(false)}>Go back</button>
              <span className="abGrow" />
              <button className="btn sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : first ? 'Save · start the balances' : 'Save stock take'}</button>
            </div>
          </section>
        </div>, document.body)}
    </div>
  );

  return (
    <div className="page stHomePage">
      <BackPill />
      <header className="pageHead enter">
        <div className="phText"><h1>{first ? 'First stock take' : 'Stock take'}</h1><span className="phLead">{first ? 'Count the store once. Every balance starts from this count.' : 'Every count of the store, newest first.'}</span></div>
      </header>
      {list && !list.length ? (
        <div className="note stack">
          <b>This store’s item list is not ready yet.</b>
          <span>The admin lists the items in each store first (without quantities). Then you can count here.</span>
          {user.role === 'admin' && <span>Admin: open <b>Admin page → Sites → Stock take list</b>.</span>}
        </div>
      ) : (
        <section className="panel stNext">
          <span className="stNextIc" aria-hidden="true"><Icon name="calendar" size={22} /></span>
          <div className="stNextText">
            <b>{last ? `Last count: ${dShort(last.count_date)} · ${ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}` : 'No count yet'}</b>
            <span>{list ? `${list.length} items on ${site || 'the store'}’s list. ` : ''}Count straight into Bohari, or on the printed sheet.</span>
          </div>
          <button className="btn ghost sm" disabled={!list?.length} onClick={() => list && print({ items: list })}><Icon name="print" size={16} />Print blank sheet</button>
          <button className="btn accent sm" disabled={!list?.length} onClick={() => (hasDraft ? startTyping() : setChoosing(true))}><Icon name="plus" size={16} />{hasDraft ? 'Continue the count' : 'New stock take'}</button>
        </section>
      )}
      {hasDraft && <div className="stDraftNote">An unfinished count is saved on this device. <button className="btn link inline" onClick={startTyping}>Continue it</button> · <button className="btn link inline" onClick={dropDraft}>Discard it</button></div>}

      <section className="panel stTakes" aria-label="Stock takes">
        <div className="stTakeRow th"><span>Ref</span><span>Date</span><span>Time</span><span>Counted by</span><span>Items</span><span>Status</span><span className="r">Share</span></div>
        {takes === null && <div className="pad muted">Loading…</div>}
        {takes && !takes.length && <div className="pad muted">No stock takes yet. Press “New stock take” to count the store.</div>}
        {takes && [...takes].reverse().map((t) => (
          <div key={t.id} className="stTakeRow" role="button" tabIndex={0} onClick={() => setOpenTake(t)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenTake(t); }}>
            <b className="mono stRef">{refOf(t)}</b>
            <span>{dShort(t.count_date)}</span>
            <span className="mono muted">{t.start_time ?? '–'} – {t.end_time ?? '–'}</span>
            <span className="ellip">{t.counted_by ?? '–'}</span>
            <span className="mono">{t.lines.length}</span>
            <span><span className={`stPill ${t.is_first || t.status === 'confirmed' ? 'ok' : 'idle'}`}>{t.is_first ? 'Opening balances' : t.status === 'confirmed' ? 'Confirmed' : 'Recorded'}</span></span>
            <span className="r"><button className="stShare" title="Share by email (Zoho Mail)" aria-label={`Share ${refOf(t)} by email`} onClick={(e) => { e.stopPropagation(); toast('Email sharing through Zoho Mail is being set up next'); }}><Icon name="mail" size={17} /></button></span>
          </div>
        ))}
      </section>

      {choosing && createPortal(
        <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) setChoosing(false); }}>
          <section className="dirPick" role="dialog" aria-modal="true" aria-labelledby="stChooseTitle">
            <header><span className="daKicker">New stock take</span><h2 id="stChooseTitle">How will you enter the count?</h2>
              <button className="iconBtn" onClick={() => setChoosing(false)} aria-label="Close"><Icon name="close" /></button></header>
            <div className="dirOpts">
              <button className="dirOpt type" onClick={startTyping} autoFocus>
                <span className="dirIc" aria-hidden="true"><Icon name="list" size={22} /></span>
                <b>Type it into Bohari</b><small>Straight in while counting, or from the paper sheet</small>
              </button>
              <button className="dirOpt in" onClick={() => { setChoosing(false); setView('upload'); }}>
                <span className="dirIc" aria-hidden="true"><Icon name="upload" size={22} /></span>
                <b>Upload a file</b><small>Excel or CSV, then check</small>
              </button>
            </div>
          </section>
        </div>, document.body)}

      {openTake && createPortal(
        <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenTake(null); }}>
          <section className="stTakeView" role="dialog" aria-modal="true" aria-labelledby="stViewTitle">
            <header><div><span className="daKicker">{refOf(openTake)}</span><h2 id="stViewTitle">{nice(openTake.count_date)}</h2></div>
              <button className="btn ghost sm" onClick={() => print({ items: openTake.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[], values: Object.fromEntries(openTake.lines.map((l) => [l.item_id, l.qty])), take: openTake })}><Icon name="print" size={16} />Print</button>
              <button className="iconBtn" onClick={() => setOpenTake(null)} aria-label="Close"><Icon name="close" /></button></header>
            <div className="stViewSheet"><StockSheet items={openTake.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]} values={Object.fromEntries(openTake.lines.map((l) => [l.item_id, l.qty]))} head={{ date: openTake.count_date, start: openTake.start_time, end: openTake.end_time, by: openTake.counted_by, checked: openTake.checked_by }} title={openTake.is_first ? 'First stock take' : 'Stock take'} /></div>
          </section>
        </div>, document.body)}
      {printLayer}
    </div>
  );
}
