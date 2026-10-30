import { useEffect, useMemo, useRef, useState } from 'react';
import { DateRange } from '../components/DateRange';
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
import { canEdit } from '../lib/access';
import { useIsPhone } from '../components/Ring';
import { Chips, Pill, PSearch, PTop, Skel, useSub } from '../phone/PhoneUI';

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
  const { day, realToday, user, balances, go, site, refresh, weekInfo, refreshWeek, itemById, balanceOf } = useData();
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
  const [sharing, setSharing] = useState<Take | null>(null);
  const [sharingLive, setSharingLive] = useState(false);
  const [saving, setSaving] = useState<Take | null>(null);
  const [savingLive, setSavingLive] = useState(false);
  const editable = canEdit(user);
  const phone = useIsPhone();
  const [sub, setSub] = useSub();
  const [phHead, setPhHead] = useState(false);
  const [printing, setPrinting] = useState<{ items: Item[]; values?: Record<number, number>; take?: Take } | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  // A long count can be put down and picked up later on this device.
  const draftKey = `ssms-stdraft:${site}:${user.email}`;
  const [hasDraft, setHasDraft] = useState(() => { try { return !!localStorage.getItem(draftKey); } catch { return false; } });

  // The count sheet: the admin's list, plus anything that came into the store since (e.g. a new item from a delivery).
  useEffect(() => { api.checklist().then(setList).catch(() => setList([])); }, []);
  const sheet = useMemo(() => {
    if (!list) return null;
    const on = new Set(list.map((i) => i.id));
    return [...list, ...balances.filter((b) => !on.has(b.item_id)).map((b) => ({ id: b.item_id, name: b.name, unit: b.unit } as Item))];
  }, [list, balances]);
  const loadTakes = () => api.stockTakes().then((t) => setTakes([...t].sort((a, b) => a.created_at.localeCompare(b.created_at)))).catch(() => setTakes([]));
  useEffect(() => { loadTakes(); }, []);
  useEffect(() => { try { setHasDraft(!!localStorage.getItem(draftKey)); } catch { /* ignore */ } }, [draftKey]);

  const items = imported ?? sheet ?? [];
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

  // Each item's own last count (it may not have been on the latest stock take): newest take that has the item.
  const lastCount = useMemo(() => {
    const m = new Map<number, { qty: number; date: string }>();
    for (const t of [...(takes ?? [])].sort((a, b) => b.count_date.localeCompare(a.count_date) || b.created_at.localeCompare(a.created_at)))
      for (const l of t.lines) if (!m.has(l.item_id)) m.set(l.item_id, { qty: Number(l.qty), date: t.count_date });
    return m;
  }, [takes]);
  const shown = ordered.filter((it) => (!onlyBlank || (qty[it.id] ?? '') === '') && (!q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase())));
  const dShort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const printLayer = printing && createPortal(<div className="stPreview stPrintOnly" aria-hidden="true"><StockSheet items={printing.items} values={printing.values}
    head={printing.take ? { date: printing.take.count_date, start: printing.take.start_time, end: printing.take.end_time, by: printing.take.counted_by } : undefined}
    title={printing.take?.is_first ? 'First stock take' : 'Stock take sheet'} /></div>, document.body);

  // ───── Phone (design 3): two tiles, a list that shows the difference as you type, then fewer / more / match.
  const dialogs = <>
    {saving && <SaveTake take={saving} refName={refOf(saving)} onClose={() => setSaving(null)} />}
    {savingLive && <SaveTake take={{ id: 'live', count_date: realToday, lines: [...balances].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ item_id: b.item_id, qty: b.balance })) } as unknown as Take} refName="Live balances" live onClose={() => setSavingLive(false)} />}
    {sharing && <ShareTake take={sharing} refName={refOf(sharing)} onClose={() => setSharing(null)} />}
    {sharingLive && <ShareTake take={{ id: 'live', count_date: realToday, lines: balances.map((b) => ({ item_id: b.item_id, qty: b.balance })) } as unknown as Take} refName="the live stock take" live onClose={() => setSharingLive(false)} />}
    {printLayer}
  </>;
  if (phone && view === 'home') {
    const t = takes?.find((x) => x.id === sub);
    if (t) return (
      <div className="pPage pDetail">
        {dialogs}
        <PTop title={refOf(t)} back={() => setSub(null)} right={<Pill tone={t.is_first ? 'grey' : 'ok'}>{t.is_first ? 'Opening' : t.status === 'confirmed' ? 'Confirmed' : 'Recorded'}</Pill>} />
        <section className="pDHead">
          <small className="pKick">Stock take · {dShort(t.count_date)}{t.start_time || t.end_time ? ` · ${t.start_time ?? '–'}–${t.end_time ?? '–'}` : ''}</small>
          <h2>{t.lines.length} items counted</h2>
          <dl className="pKv">{[['Counted by', t.counted_by], ['Checked by', t.checked_by]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
        <div className="pGh">Counts</div>
        <div className="pLines">{sorted(t.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]).map((it) => <div key={it.id} className="pLine"><span>{it.name}</span><b className="mono">{fmt(t.lines.find((l) => l.item_id === it.id)?.qty ?? 0)}</b><small>{it.unit}</small></div>)}</div>
        <footer className="pFoot pFoot2"><button className="pBtn ghost" onClick={() => setSaving(t)}><Icon name="download" size={18} />Excel / PDF</button>{editable && <button className="pBtn" onClick={() => setSharing(t)}><Icon name="mail" size={18} />Email it</button>}</footer>
      </div>
    );
    if (sub === 'live') return (
      <div className="pPage pGrey">
        {dialogs}
        <PTop title="Live balances" back={() => setSub(null)} />
        <p className="pLead">What the system shows in {site || 'the store'} right now: {balances.length} items, in the stock take template.</p>
        <section className="pSetCard">
          <button className="pSetRow" onClick={() => { refresh().catch(() => undefined); setSavingLive(true); }}><span className="pSetIc"><Icon name="download" size={17} /></span><b>Download Excel or PDF</b><Icon name="chevR" size={17} /></button>
          {editable && <button className="pSetRow" onClick={() => { refresh().catch(() => undefined); setSharingLive(true); }}><span className="pSetIc"><Icon name="mail" size={17} /></span><b>Email it</b><Icon name="chevR" size={17} /></button>}
          {editable && <button className="pSetRow" disabled={!sheet?.length} onClick={() => sheet && print({ items: sorted(sheet) })}><span className="pSetIc"><Icon name="print" size={17} /></span><b>Print a blank count sheet</b><Icon name="chevR" size={17} /></button>}
        </section>
      </div>
    );
    return (
      <div className="pPage pGrey pStHome">
        {dialogs}
        <PTop title={first ? 'First stock take' : 'Stock take'} back={false} />
        <div className="pStLast"><small>Last count</small><b>{last ? (ago <= 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${ago} days ago`) : 'No count yet'}{last && <small> · {dShort(last.count_date)}</small>}</b></div>
        <div className="pTiles pStTiles">
          {editable && <button className="pTileB pStGo" disabled={!sheet?.length} onClick={startTyping}><span className="pTIc"><Icon name="clip" size={20} /></span><b>{hasDraft ? 'Continue the count' : 'Count now'}</b><small>{sheet ? `${sheet.length} items` : 'Loading…'}</small></button>}
          <button className="pTileB" onClick={() => setSub('live')}><span className="pTIc"><Icon name="box" size={20} /></span><b>Live balances</b><small>Download or email</small></button>
        </div>
        {editable && list && !list.length && <div className="pNote">The admin lists this store’s items first. Then you can count here.</div>}
        {editable && hasDraft && <div className="pNote">An unfinished count is saved on this device. <button className="pLink" onClick={dropDraft}>Discard it</button></div>}
        {editable && <button className="pUpload" onClick={() => setView('upload')}><Icon name="upload" size={16} />Have the count in Excel? Upload the file</button>}
        <div className="pSetH">Past counts</div>
        <section className="pSetCard">
          {takes === null && <Skel rows={3} />}
          {takes && !takes.length && <div className="pEmpty">No stock takes yet.</div>}
          {takes && [...takes].reverse().map((t) => (
            <button key={t.id} className="pSetRow pTakeRow" onClick={() => setSub(t.id)}>
              <span className="pRowT"><b>{t.count_date === realToday ? 'Today' : dShort(t.count_date)}{t.end_time ? `, ${t.end_time}` : ''}</b><small>{refOf(t)} · {t.lines.length} items{t.counted_by ? ` · ${t.counted_by}` : ''}</small></span>
              {t.is_first ? <Pill tone="grey">Opening</Pill> : <Pill tone="ok">{t.status === 'confirmed' ? 'Confirmed' : 'Recorded'}</Pill>}<Icon name="chevR" size={17} />
            </button>
          ))}
        </section>
      </div>
    );
  }
  if (phone && view === 'enter' && reviewing) {
    const counted = ordered.filter((it) => (qty[it.id] ?? '') !== '');
    const fewer = first ? [] : counted.filter((it) => Number(qty[it.id]) < balanceOf(it.id));
    const more = first ? [] : counted.filter((it) => Number(qty[it.id]) > balanceOf(it.id));
    const grp = (title: string, tone: string, xs: Item[]) => xs.length > 0 && <>
      <div className={`pGh ${tone}`}>{title}</div>
      <div className="pLines">{xs.map((it) => <div key={it.id} className="pLine"><span>{it.name}</span><small className="mono pWas">{fmt(balanceOf(it.id))} →</small><b className="mono">{fmt(Number(qty[it.id]))}</b><small>{it.unit}</small></div>)}</div>
    </>;
    return (
      <div className="pPage pDetail">
        <PTop title="Check before saving" back={() => setReviewing(false)} />
        <div className="pStStats">
          {first ? <><div><b className="mono">{entered}</b><small>counted</small></div><div><b className="mono">{blanks.length}</b><small>left blank</small></div></>
            : <><div className="red"><b className="mono">{fewer.length}</b><small>fewer</small></div><div className="green"><b className="mono">{more.length}</b><small>more</small></div><div><b className="mono">{counted.length - fewer.length - more.length}</b><small>match</small></div></>}
        </div>
        {grp('Fewer than the system', 'red', fewer)}
        {grp('More than the system', 'green', more)}
        {blanks.length > 0 && <div className="pNote">{blanks.length} left blank: {blanks.slice(0, 3).map((b) => b.name).join(', ')}{blanks.length > 3 ? ` and ${blanks.length - 3} more` : ''}. {first ? 'They start at zero.' : 'They keep their balance.'}</div>}
        {needWeek && <label className="pField"><span>Which week of the project is this?</span><input inputMode="numeric" value={week} placeholder="e.g. 46" onChange={(e) => setWeek(e.target.value.replace(/\D/g, ''))} /></label>}
        <p className="pLead">{first ? 'Every balance starts from this count.' : 'Saving sets each counted item’s balance to your count.'}</p>
        <footer className="pFoot"><button className="pBtn" disabled={busy} onClick={save}>{busy ? 'Saving…' : first ? 'Save · start the balances' : 'Save · set balances to the count'}</button></footer>
      </div>
    );
  }
  if (phone && view === 'enter') return (
    <div className="pPage pStEnter">
      <PTop title={first ? 'First stock take' : 'New count'} back={() => (imported ? (setImported(null), setView('home')) : keepForLater())} right={<small className="pTopNote mono">{entered}/{ordered.length}</small>} />
      <button className="pStHeadBtn" onClick={() => setPhHead((v) => !v)}><span>{dShort(head.date)}{head.start ? ` · ${head.start}` : ''}{head.by ? ` · ${head.by}` : ''}</span><b>{phHead ? 'Done' : 'Edit'}</b></button>
      {phHead && <section className="pStHead">
        <div className="field"><span>Date of the count</span><DateRange single value={{ from: head.date, to: head.date }} max={day} onChange={(r) => setHead({ ...head, date: r?.from ?? day })} /></div>
        <div className="pStTimes"><TimeBoxes label="Start" value={head.start} onChange={(v) => setHead({ ...head, start: v })} /><TimeBoxes label="End" value={head.end} onChange={(v) => setHead({ ...head, end: v })} /></div>
        <label className="field"><span>Counted by</span><input className="input" value={head.by} onChange={(e) => setHead({ ...head, by: e.target.value })} /></label>
      </section>}
      <i className="pStProg"><i style={{ width: `${(entered / Math.max(1, ordered.length)) * 100}%` }} /></i>
      <PSearch value={q} onChange={setQ} placeholder="Jump to an item" />
      <Chips value={onlyBlank ? 'blank' : 'all'} onChange={(k) => setOnlyBlank(k === 'blank')} items={[['all', `All ${ordered.length}`], ['blank', `Not counted ${blanks.length}`]]} />
      {!first && <div className="pStHint">The difference shows as you type: <b className="green">✓</b> matches · <b className="red">−2</b> fewer · <b className="green">+4</b> more</div>}
      <div className="pStRows" ref={rowsRef}>
        {shown.map((it) => {
          const v = qty[it.id] ?? ''; const sys = balanceOf(it.id); const lc = lastCount.get(it.id);
          const d = v === '' || first ? null : Number(v) - sys;
          return (
            <label key={it.id} className={`pStRow ${v !== '' ? 'filled' : ''}`}>
              <span className="pStName"><b>{it.name}</b><small>{it.unit} · system {fmt(sys)}{lc ? ` · last ${fmt(lc.qty)}` : ''}</small></span>
              <span className={`pStDiff ${d == null ? '' : d === 0 ? 'green' : d < 0 ? 'red' : 'green'}`}>{d == null ? '' : d === 0 ? '✓' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}</span>
              <input className="stIn pStIn mono" inputMode="decimal" value={v} placeholder="" aria-label={`${it.name} count`}
                onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(/[^0-9.]/g, '') })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); nextRow(e.currentTarget); } }} />
            </label>
          );
        })}
        {!shown.length && <div className="pEmpty">{onlyBlank ? 'Everything has a number.' : 'No item matches.'}</div>}
      </div>
      <footer className="pFoot"><button className="pBtn" disabled={!entered} onClick={() => setReviewing(true)}>{entered ? `Review ${entered} counted` : 'Type a count to review'}</button></footer>
    </div>
  );

  if (view === 'upload') return (
    <div className="entryPage">
      {phone && <PTop title="Upload the count" back={() => setView('home')} />}
      <header className="entryHead enter">
        <BackPill label="Stock take" onClick={() => setView('home')} />
        <div className="entryTitle"><div><h1>New stock take · from a file</h1><p>Upload the count. The system matches each line to {site || 'the store'}’s item list, then you check it before saving.</p></div></div>
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
        <div className="field"><span>Date of the count</span><DateRange single value={{ from: head.date, to: head.date }} max={day} onChange={(r) => setHead({ ...head, date: r?.from ?? day })} /></div>
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
        <div className="stGrid stGrid3" ref={rowsRef}>
          {shown.length > 0 && [0, 1].map((k) => <div key={`h${k}`} className={`stCell stCellHead ${k ? 'second' : ''}`} aria-hidden="true"><span /><span>Item</span><span>Unit</span><span>In system</span><span>Last count</span><span>Count</span></div>)}
          {shown.map((it) => {
            const v = qty[it.id] ?? '';
            const lc = lastCount.get(it.id);
            return (
              <label key={it.id} className={`stCell ${v !== '' ? 'filled' : ''}`}>
                <span className="stTick" aria-hidden="true">{v !== '' && <Icon name="check" size={11} />}</span>
                <span className="stName" title={it.name}>{it.name}</span>
                <span className="stUnit">{it.unit}</span>
                <span className="stRead mono" title="What the system shows now">{fmt(balanceOf(it.id))}</span>
                <span className="stRead mono" title={lc ? `Counted ${dShort(lc.date)}` : 'Not counted before'}>{lc ? <>{fmt(lc.qty)}<small>{dShort(lc.date).split(' ').slice(1).join(' ')}</small></> : '—'}</span>
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
            <span className="small muted">{first ? 'Every balance starts from this count. From tonight, each delivery, card, return and transfer moves them.' : 'Saving sets each counted item’s balance to your count. Items left blank keep their balance.'}</span>
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
        <div className="phText"><h1>{first ? 'First stock take' : 'Stock take'}</h1><span className="phLead">{!editable ? 'Every count of the store, newest first. Print one to download it as Excel or PDF.' : first ? 'Count the store once. Every balance starts from this count.' : 'Every count of the store, newest first.'}</span></div>
      </header>
      {!editable ? (
        <section className="panel stNext">
          <span className="stNextIc" aria-hidden="true"><Icon name="box" size={22} /></span>
          <div className="stNextText">
            <b>Live balances · {dShort(realToday)}</b>
            <span>What the system shows in the store right now, {balances.length} items, in the stock take template.</span>
          </div>
          <button className="btn accent sm stLiveBtn" disabled={!balances.length} onClick={() => { setSavingLive(true); refresh().catch(() => undefined); }}><Icon name="print" size={16} />Print live balances</button>
        </section>
      ) : list && !list.length ? (
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
            <span>{sheet ? `${sheet.length} items on ${site || 'the store'}’s count sheet${!first ? ` · ${balances.length} have stock records` : ''}. ` : ''}Count straight into the system, or on the printed sheet.</span>
          </div>
          <button className="btn ghost sm" disabled={!sheet?.length} onClick={() => sheet && print({ items: sorted(sheet) })}><Icon name="print" size={16} />Print blank sheet</button>
          <button className="btn ghost sm" disabled={!balances.length} onClick={() => { setSharingLive(true); refresh().catch(() => undefined); }}><Icon name="mail" size={16} />Email live stock take</button>
          <button className="btn accent sm" disabled={!sheet?.length} onClick={() => (hasDraft ? startTyping() : setChoosing(true))}><Icon name="plus" size={16} />{hasDraft ? 'Continue the count' : 'New stock take'}</button>
        </section>
      )}
      {editable && hasDraft && <div className="stDraftNote">An unfinished count is saved on this device. <button className="btn link inline" onClick={startTyping}>Continue it</button> · <button className="btn link inline" onClick={dropDraft}>Discard it</button></div>}

      <section className="panel stTakes" aria-label="Stock takes">
        <div className="stTakeRow th"><span>Ref</span><span>Date</span><span>Time</span><span>Counted by</span><span>Items</span><span>Status</span><span className="r">{editable ? 'Share' : 'Print'}</span></div>
        {takes === null && <div className="pad muted">Loading…</div>}
        {takes && !takes.length && <div className="pad muted">No stock takes yet. Press “New stock take” to count the store.</div>}
        {takes && [...takes].reverse().map((t) => (
          <div key={t.id} className={`stTakeRow ${t.count_date === realToday ? 'today' : ''}`} title={t.count_date === realToday ? 'Done and saved today' : undefined} role="button" tabIndex={0} onClick={() => setOpenTake(t)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenTake(t); }}>
            <b className="mono stRef">{refOf(t)}</b>
            <span>{dShort(t.count_date)}{t.count_date === realToday && <span className="stToday">Today</span>}</span>
            <span className="mono muted">{t.start_time ?? '–'} – {t.end_time ?? '–'}</span>
            <span className="ellip">{t.counted_by ?? '–'}</span>
            <span className="mono">{t.lines.length}</span>
            <span><span className={`stPill ${t.is_first || t.status === 'confirmed' ? 'ok' : 'idle'}`}>{t.is_first ? 'Opening balances' : t.status === 'confirmed' ? 'Confirmed' : 'Recorded'}</span></span>
            <span className="r">{!editable ? <button className="stShare" title="Download as Excel or PDF" aria-label={`Print ${refOf(t)}`} onClick={(e) => { e.stopPropagation(); setSaving(t); }}><Icon name="print" size={17} /></button> : <button className="stShare" title="Share by email (Zoho Mail)" aria-label={`Share ${refOf(t)} by email`} onClick={(e) => { e.stopPropagation(); setSharing(t); }}><Icon name="mail" size={17} /></button>}</span>
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
                <b>Type it in the system</b><small>Straight in while counting, or from the paper sheet</small>
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
              <button className="btn ghost sm" onClick={() => !editable ? setSaving(openTake) : print({ items: openTake.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[], values: Object.fromEntries(openTake.lines.map((l) => [l.item_id, l.qty])), take: openTake })}><Icon name="print" size={16} />Print</button>
              <button className="iconBtn" onClick={() => setOpenTake(null)} aria-label="Close"><Icon name="close" /></button></header>
            <div className="stViewSheet"><StockSheet items={openTake.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]} values={Object.fromEntries(openTake.lines.map((l) => [l.item_id, l.qty]))} head={{ date: openTake.count_date, start: openTake.start_time, end: openTake.end_time, by: openTake.counted_by, checked: openTake.checked_by }} title={openTake.is_first ? 'First stock take' : 'Stock take'} /></div>
          </section>
        </div>, document.body)}
      {printLayer}
      {saving && <SaveTake take={saving} refName={refOf(saving)} onClose={() => setSaving(null)} />}
      {savingLive && <SaveTake take={{ id: 'live', count_date: realToday, lines: [...balances].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ item_id: b.item_id, qty: b.balance })) } as unknown as Take} refName="Live balances" live onClose={() => setSavingLive(false)} />}
      {sharingLive && <ShareTake take={{ id: 'live', count_date: realToday, lines: balances.map((b) => ({ item_id: b.item_id, qty: b.balance })) } as unknown as Take} refName="the live stock take" live onClose={() => setSharingLive(false)} />}
      {sharing && <ShareTake take={sharing} refName={refOf(sharing)} onClose={() => setSharing(null)} />}
    </div>
  );
}

/** "Sunday, 19 October 2026" */
const longDay = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/^(\w+) /, '$1, ');
const partOfDay = () => { const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' })); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Email one stock take from the person's own Zoho Mail, with the count as an Excel file attached. */
function ShareTake({ take, refName, live = false, onClose }: { take: Take; refName: string; live?: boolean; onClose: () => void }) {
  const { site, user, itemById } = useData();
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
  const asOf = live ? `${site}’s live stock take as of ${longDay(take.count_date)}, ${now}` : `${site}’s stock take as of ${longDay(take.count_date)}`;
  const [to, setTo] = useState(() => { try { return localStorage.getItem('ssms-st-mail-to') ?? ''; } catch { return ''; } });
  const [text, setText] = useState(() => `${partOfDay()},\n\nFind attached ${asOf}.\n\nRegards,\n${user.name}\n${site} Store`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; reconnect?: boolean } | null>(null);
  const rows = sorted(take.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]);
  const qty = new Map(take.lines.map((l) => [l.item_id, l.qty]));
  const fileName = `${site} ${live ? 'live stock take' : 'stock take'} ${take.count_date.split('-').reverse().join('-')}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
  const notInZoho = rows.filter((it) => it.in_zoho === false).length;
  const excel = async () => {
    const { stockTakeExcel } = await import('../lib/stockTakeExcel');
    return stockTakeExcel(take.count_date, rows.map((it) => ({ name: it.name, unit: it.unit, qty: qty.get(it.id) ?? 0, inZoho: it.in_zoho !== false })));
  };
  const send = async () => {
    const list = to.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!list.length) { setErr({ text: 'Add who to send it to.' }); return; }
    setBusy(true); setErr(null);
    try {
      const r = await api.sendMail({ to: list, subject: asOf, text, attachment: { name: fileName, base64: await excel() } });
      if (r.ok) { try { localStorage.setItem('ssms-st-mail-to', to); } catch { /* ignore */ } toast(`Sent from ${r.from ?? 'your Zoho Mail'}`); onClose(); return; }
      setErr({ text: r.error ?? 'Not sent.', reconnect: r.reconnect });
    } catch (e) { setErr({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="dayAsk stShareBox" role="dialog" aria-modal="true" aria-labelledby="stShareTitle">
        <span className="daKicker">Email · from your Zoho Mail</span>
        <h2 id="stShareTitle">Send {refName}</h2>
        <label className="field"><span>To</span><input className="input" type="email" multiple value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@comex.co.ke · separate several with commas" autoFocus /></label>
        <div className="field"><span>Subject</span><div className="input locked fakeIn">{asOf}</div></div>
        <label className="field"><span>Message</span><textarea className="input" rows={7} value={text} onChange={(e) => setText(e.target.value)} /></label>
        <div className="stAttach"><span className="stAttachIc" aria-hidden="true">XLS</span><span><b>{fileName}</b><small>{rows.length} items{notInZoho ? <> · <span className="stNoZoho">{notInZoho} not in Zoho, marked red</span></> : ''} · attached</small></span></div>
        {err && <div className="note err" role="alert">{err.text}{err.reconnect && <> <button className="btn link inline" onClick={() => api.zohoConnect(true).catch((e) => toast((e as Error).message, 'warn'))}>Allow Zoho Mail</button></>}</div>}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost sm" disabled={busy} onClick={onClose}>Cancel</button>
          <span className="abGrow" />
          <button className="btn sm" disabled={busy} onClick={send}><Icon name="mail" size={16} />{busy ? 'Sending…' : 'Send email'}</button>
        </div>
      </section>
    </div>, document.body);
}

/** View-only people print a stock take by downloading it, in the same template as the email: Excel or PDF. */
function SaveTake({ take, refName, live = false, onClose }: { take: Take; refName: string; live?: boolean; onClose: () => void }) {
  const { site, itemById } = useData();
  const [busy, setBusy] = useState('');
  const rows = sorted(take.lines.map((l) => itemById.get(l.item_id)).filter(Boolean) as Item[]);
  const qty = new Map(take.lines.map((l) => [l.item_id, l.qty]));
  const data = rows.map((it) => ({ name: it.name, unit: it.unit, qty: qty.get(it.id) ?? 0, inZoho: it.in_zoho !== false }));
  const base = `${site} ${live ? 'live balances' : 'stock take'} ${take.count_date.split('-').reverse().join('-')}`.replace(/[\\/:*?"<>|]/g, '-');
  const go = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    try {
      const m = await import('../lib/stockTakeExcel');
      const blob = kind === 'xlsx'
        ? m.b64ToBlob(await m.stockTakeExcel(take.count_date, data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        : await m.stockTakePdf(take.count_date, data, site || 'Site');
      m.saveFile(`${base}.${kind}`, blob);
      toast(`${refName} downloaded as ${kind === 'xlsx' ? 'Excel' : 'PDF'}`);
      onClose();
    } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(''); }
  };
  return createPortal(
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="dirPick" role="dialog" aria-modal="true" aria-labelledby="stSaveTitle">
        <header><span className="daKicker">Print {refName} · {nice(take.count_date)}</span><h2 id="stSaveTitle">Download it as</h2>
          <button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="dirOpts">
          <button className="dirOpt type" disabled={!!busy} onClick={() => go('xlsx')} autoFocus>
            <span className="dirIc" aria-hidden="true"><Icon name="download" size={22} /></span>
            <b>{busy === 'xlsx' ? 'Preparing…' : 'Excel'}</b><small>{rows.length} items · the stock take template</small>
          </button>
          <button className="dirOpt in" disabled={!!busy} onClick={() => go('pdf')}>
            <span className="dirIc" aria-hidden="true"><Icon name="download" size={22} /></span>
            <b>{busy === 'pdf' ? 'Preparing…' : 'PDF'}</b><small>Ready to print or forward</small>
          </button>
        </div>
      </section>
    </div>, document.body);
}
