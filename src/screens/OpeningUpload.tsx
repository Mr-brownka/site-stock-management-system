// Admin → Sites → (new site) → Stock take list: upload the first count, check it against Zoho, sort out problems, approve.
// Design C (5 Nov): the numbers first, then one card per kind of problem, the full list one tap away.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/fx';
import { ask, toast } from '../components/feedback';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { today } from '../lib/dates';
import { checkLines, readTable, searchZoho, type Line, type Table } from '../lib/firstCount';
import type { OpeningLine, ZohoItem } from '../lib/types';

/** What the admin decided for one line. */
interface Pick { zoho?: ZohoItem | null; skip?: boolean; accepted?: boolean; qty?: number | null; keepOne?: boolean }
interface Extra { zoho: ZohoItem; qty: number | null }
interface Draft { file: string; table: Table; col: number; picks: Record<number, Pick>; extra: Extra[]; by: string; date: string }

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function OpeningUpload({ siteId, siteName, onDone }: { siteId: string; siteName: string; onDone: () => void }) {
  const KEY = `ostock-first-count:${siteId}`;
  const [zoho, setZoho] = useState<{ items: ZohoItem[]; fetchedAt: string | null; error: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [d, setD] = useState<Draft | null>(() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } });
  const [reading, setReading] = useState(false);
  const [all, setAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadZoho = () => api.admin.zohoList().then(setZoho).catch((e) => setZoho({ items: [], fetchedAt: null, error: (e as Error).message }));
  useEffect(() => { loadZoho(); }, []);
  useEffect(() => { try { d ? localStorage.setItem(KEY, JSON.stringify(d)) : localStorage.removeItem(KEY); } catch { /* full */ } }, [d, KEY]);

  const refresh = async () => {
    setRefreshing(true);
    try { const n = await api.admin.refreshZohoItems(); await loadZoho(); toast(`Zoho list fetched again · ${fmt(n)} items`, 'ok'); }
    catch (e) { toast((e as Error).message, 'warn'); } finally { setRefreshing(false); }
  };
  const upload = async (f: File) => {
    setReading(true);
    try {
      const t = await readTable(f);
      if (t.nameCol < 0) throw new Error('No column of item names found in that file.');
      if (!t.numCols.length) throw new Error('No column of numbers found in that file.');
      // Only one numbers column: use it. Several: the admin chooses (col = -1 until then).
      setD({ file: f.name, table: t, col: t.numCols.length === 1 ? t.numCols[0].col : -1, picks: {}, extra: d?.extra ?? [], by: d?.by ?? '', date: d?.date ?? today() });
    } catch (e) { toast((e as Error).message || 'Could not read that file. Save it as .xlsx or .csv and try again.', 'warn'); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const checked = useMemo(() => (d && zoho && d.col >= 0 ? checkLines(d.table, d.col, zoho.items) : null), [d?.table, d?.col, zoho]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k: number, p: Pick) => d && setD({ ...d, picks: { ...d.picks, [k]: { ...d.picks[k], ...p } } });
  const lines = checked?.lines ?? [];
  const state = (l: Line) => {
    const p = d?.picks[l.key] ?? {};
    const zo = p.zoho !== undefined ? p.zoho : l.zoho;
    const qty = p.qty !== undefined ? p.qty : l.qty;
    const qtyOk = qty != null && qty >= 0 && (!l.qtyBad || p.qty !== undefined);
    const nameOk = !!p.skip || (l.kind === 'ok' && p.zoho === undefined) || (!!zo && (l.kind !== 'close' || p.accepted || p.zoho !== undefined));
    return { zo, qty, skip: !!p.skip, done: !!p.skip || (nameOk && qtyOk) };
  };
  const close = lines.filter((l) => l.kind === 'close');
  const none = lines.filter((l) => l.kind === 'none');
  const twins = lines.filter((l) => l.twin != null);
  const qtyBad = lines.filter((l) => l.qtyBad);
  const open = lines.filter((l) => !state(l).done).length + (d?.extra ?? []).filter((e) => e.qty == null).length;
  const inZohoSet = new Set([...lines.map((l) => state(l).zo?.zoho_item_id).filter(Boolean) as string[], ...(d?.extra ?? []).map((e) => e.zoho.zoho_item_id)]);

  const approve = async () => {
    if (!d) return;
    const out: OpeningLine[] = [];
    for (const l of lines) {
      const s = state(l);
      if (s.skip || !s.zo) continue;
      if (l.twin != null && d.picks[l.key]?.keepOne) continue;
      out.push({ zoho_item_id: s.zo.zoho_item_id, name: s.zo.name, unit: s.zo.unit, qty: s.qty ?? 0 });
    }
    d.extra.forEach((e) => out.push({ zoho_item_id: e.zoho.zoho_item_id, name: e.zoho.name, unit: e.zoho.unit, qty: e.qty ?? 0 }));
    const n = new Set(out.map((o) => o.zoho_item_id)).size;
    const ok = await ask({ title: `Load ${n} items into ${siteName}?`, body: <p>They become {siteName}’s opening stock, counted {d.date === today() ? 'today' : d.date}{d.by ? ` by ${d.by}` : ''}. The stock take list is set to these items. This can’t be undone from here.</p>, yes: `Load ${n} items` });
    if (!ok) return;
    setSaving(true);
    try { await api.admin.openingCount(siteId, d.date, d.by, out); setD(null); toast(`${siteName} is set up · ${n} items in store`, 'ok'); onDone(); }
    catch (e) { toast((e as Error).message, 'warn'); } finally { setSaving(false); }
  };

  const zohoLine = (
    <span className="fcZoho"><Icon name="refresh" size={15} />Zoho list: <b>{zoho ? fmt(zoho.items.length) : '…'} items</b> · fetched {ago(zoho?.fetchedAt ?? null)}
      <button type="button" className="adLinkBtn" disabled={refreshing} onClick={refresh}>{refreshing ? 'Checking Zoho…' : 'Check Zoho again'}</button></span>
  );
  const fileInput = <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />;

  // 1 · Nothing uploaded yet
  if (!d) {
    return (
      <div className="fc">
        {fileInput}
        <section className="panel fcDrop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
          <span className="fcDropIc"><Icon name="upload" size={22} /></span>
          <span className="fcDropT"><b>Upload {siteName}’s first count</b><small>Excel or CSV with item names and quantities. Each line is checked against Zoho’s item list.</small></span>
          <button className="adBtn dark" disabled={reading} onClick={() => fileRef.current?.click()}>{reading ? 'Reading…' : 'Choose a file'}</button>
          <button className="adBtn" onClick={() => setD({ file: '', table: { name: '', rows: [], start: 0, nameCol: 0, unitCol: -1, numCols: [] }, col: 0, picks: {}, extra: [], by: '', date: today() })}><Icon name="plus" size={15} />Add items</button>
        </section>
        {zohoLine}
      </div>
    );
  }
  const t = d.table;
  // 2 · Several number columns: which one is the count?
  if (d.file && d.col < 0) {
    return (
      <div className="fc">
        {fileInput}
        <section className="panel adPad fcCols">
          <b>Which column is {siteName}’s count?</b>
          <span className="muted">{d.file} has {t.numCols.length} columns of numbers. Pick the one with the quantities in store now.</span>
          <div className="fcColGrid">
            {t.numCols.map((c) => (
              <button key={c.col} type="button" className="fcCol" onClick={() => setD({ ...d, col: c.col })}>
                <b>{c.label}</b><small>{c.filled} lines filled</small>
                <span>{c.sample.map((x) => <em key={x}>{x}</em>)}</span>
              </button>
            ))}
          </div>
          <button className="adLinkBtn" onClick={() => setD(null)}>Use another file</button>
        </section>
      </div>
    );
  }

  const Picker = ({ value, onPick, suggest }: { value: ZohoItem | null; onPick: (z: ZohoItem) => void; suggest: ZohoItem[] }) => <ZohoPicker value={value} onPick={onPick} suggest={suggest} zoho={zoho?.items ?? []} />;
  return (
    <div className="fc">
      {fileInput}
      {d.file && (
        <div className="fcBig">
          <div className="panel hero"><small>{d.file}</small><b className="mono">{lines.length} lines</b><small>counted · {checked?.blank ?? 0} with no number left out · {t.numCols.find((c) => c.col === d.col)?.label}</small>
            <span className="fcHeroActs">{t.numCols.length > 1 && <button className="adLinkBtn light" onClick={() => setD({ ...d, col: -1, picks: {} })}>Other column</button>}<button className="adLinkBtn light" onClick={() => fileRef.current?.click()}>Another file</button></span></div>
          <div className="panel"><span className="stPill ok">Matched</span><b className="mono">{lines.filter((l) => l.kind === 'ok').length}</b><small>Go in as they are</small></div>
          <div className="panel"><span className="stPill warn">Close match</span><b className="mono">{close.length}</b><small>Name spelt differently</small></div>
          <div className="panel"><span className="stPill out">Not in Zoho</span><b className="mono">{none.length}</b><small>Pick or leave out</small></div>
          <div className="panel"><span className="stPill fcDupPill">Twice</span><b className="mono">{twins.length}</b><small>Added together</small></div>
        </div>
      )}

      <div className="fcFix">
        {close.length > 0 && (
          <section className="panel fcCard">
            <header><span className="stPill warn">{close.length}</span><b>Close matches</b><button className="adLinkBtn" onClick={() => setD({ ...d, picks: { ...d.picks, ...Object.fromEntries(close.map((l) => [l.key, { ...d.picks[l.key], accepted: true }])) } })}>Accept all</button></header>
            {close.map((l) => { const s = state(l); return (
              <div key={l.key} className={`fcRow ${s.done ? 'done' : ''}`}>
                <span className="fcT"><b>{l.raw}</b><small>{fmt(s.qty ?? 0)} {l.unit ?? ''} · line {l.row}</small></span>
                {s.skip ? <span className="muted small">Left out</span> : <Picker value={s.zo} suggest={l.suggest} onPick={(z) => pick(l.key, { zoho: z, accepted: true })} />}
                {!s.done && <button className="adLinkBtn" onClick={() => pick(l.key, { accepted: true })}>Accept</button>}
                {s.done && !s.skip && <span className="fcOk"><Icon name="check" size={14} /></span>}
              </div>
            ); })}
          </section>
        )}
        {none.length > 0 && (
          <section className="panel fcCard">
            <header><span className="stPill out">{none.length}</span><b>Not in Zoho</b><button className="adLinkBtn" onClick={() => setD({ ...d, picks: { ...d.picks, ...Object.fromEntries(none.filter((l) => !state(l).done).map((l) => [l.key, { ...d.picks[l.key], skip: true }])) } })}>Leave the rest out</button></header>
            {none.map((l) => { const s = state(l); return (
              <div key={l.key} className={`fcRow ${s.done ? 'done' : ''}`}>
                <span className="fcT"><b>{l.raw}</b><small>{fmt(s.qty ?? 0)} {l.unit ?? ''} · line {l.row}</small></span>
                {s.skip ? <span className="muted small">Left out</span> : <Picker value={s.zo} suggest={l.suggest} onPick={(z) => pick(l.key, { zoho: z, skip: false })} />}
                <button className="adLinkBtn grey" onClick={() => pick(l.key, { skip: !s.skip, zoho: s.skip ? undefined : null })}>{s.skip ? 'Put back' : 'Leave out'}</button>
              </div>
            ); })}
            <small className="muted">Not in Zoho at all? Ask procurement to add it in Zoho, then press <b>Check Zoho again</b> below.</small>
          </section>
        )}
        {twins.length > 0 && (
          <section className="panel fcCard">
            <header><span className="stPill fcDupPill">{twins.length}</span><b>Twice in the file</b><span className="muted small">Added together unless you keep one</span></header>
            {twins.map((l) => { const first = lines[l.twin!]; const keep = !!d.picks[l.key]?.keepOne; const a = state(first).qty ?? 0, b = state(l).qty ?? 0; return (
              <div key={l.key} className="fcRow done">
                <span className="fcT"><b>{state(l).zo?.name ?? l.raw}</b><small>lines {first.row} and {l.row} · {keep ? `keeping ${fmt(a)}` : `${fmt(a)} + ${fmt(b)} = ${fmt(a + b)}`}</small></span>
                <button className="adLinkBtn" onClick={() => pick(l.key, { keepOne: !keep })}>{keep ? 'Add together' : 'Keep the first only'}</button>
              </div>
            ); })}
          </section>
        )}
        {qtyBad.length > 0 && (
          <section className="panel fcCard">
            <header><span className="stPill out">{qtyBad.length}</span><b>Quantity problems</b></header>
            {qtyBad.map((l) => { const s = state(l); return (
              <div key={l.key} className={`fcRow ${s.done ? 'done' : ''}`}>
                <span className="fcT"><b>{s.zo?.name ?? l.raw}</b><small>{l.qtyBad} · line {l.row}</small></span>
                <input className="input num fcQty" inputMode="decimal" aria-label={`Quantity for ${l.raw}`} value={d.picks[l.key]?.qty ?? ''} placeholder={l.qty != null && l.qty >= 0 ? String(l.qty) : 'Qty'}
                  onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); pick(l.key, { qty: v === '' ? undefined : Number(v) }); }} />
              </div>
            ); })}
          </section>
        )}
        <section className="panel fcCard">
          <header><span className="stPill">{d.extra.length}</span><b>Items you add</b><button className="adBtn sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add items</button></header>
          {!d.extra.length && <small className="muted">Anything counted but not in the file. Search Zoho’s list and type the quantity.</small>}
          {d.extra.map((e, i) => (
            <div key={e.zoho.zoho_item_id} className="fcRow done">
              <span className="fcT"><b>{e.zoho.name}</b><small>{e.zoho.unit ?? ''}</small></span>
              <input className="input num fcQty" inputMode="decimal" aria-label={`Quantity for ${e.zoho.name}`} value={e.qty ?? ''} placeholder="Qty" onChange={(ev) => { const v = ev.target.value.replace(/[^\d.]/g, ''); const x = [...d.extra]; x[i] = { ...e, qty: v === '' ? null : Number(v) }; setD({ ...d, extra: x }); }} />
              <button className="iconBtn" aria-label={`Remove ${e.zoho.name}`} onClick={() => setD({ ...d, extra: d.extra.filter((_, j) => j !== i) })}><Icon name="close" size={15} /></button>
            </div>
          ))}
        </section>
      </div>

      {all && (
        <section className="panel fcAll">
          <table className="fcTbl"><thead><tr><th>Line</th><th>In the file</th><th className="r">Qty</th><th>Zoho item</th><th>Result</th></tr></thead>
            <tbody>{lines.map((l) => { const s = state(l); return (
              <tr key={l.key} className={s.skip ? 'skip' : ''}><td className="mono">{l.row}</td><td>{l.raw}</td><td className="r mono">{s.qty == null ? l.qtyText : fmt(s.qty)}</td><td>{s.zo?.name ?? '—'}</td>
                <td>{s.skip ? <span className="stPill">Left out</span> : l.kind === 'ok' && !l.qtyBad ? <span className="stPill ok">Matched</span> : s.done ? <span className="stPill ok">Sorted</span> : <span className="stPill warn">Needs you</span>}</td></tr>
            ); })}</tbody></table>
        </section>
      )}

      <section className="panel fcFoot">
        <label className="field"><span>Counted by</span><input className="input" value={d.by} placeholder="e.g. Muhidin" onChange={(e) => setD({ ...d, by: e.target.value })} /></label>
        <label className="field"><span>Count date</span><input className="input" type="date" max={today()} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></label>
        <span className="fcFootMid">{zohoLine}</span>
        {d.file && <button className="adBtn" onClick={() => setAll(!all)}>{all ? 'Hide the list' : `See all ${lines.length} lines`}</button>}
        <button className="adBtn" onClick={async () => { if (await ask({ title: 'Start again?', body: <p>The file and everything you sorted out here are cleared.</p>, yes: 'Start again', tone: 'danger' })) setD(null); }}>Start again</button>
        <button className="adBtn dark" disabled={saving || open > 0 || !(lines.length || d.extra.length) || !d.date} onClick={approve}>
          {saving ? 'Loading…' : open > 0 ? `Approve · ${open} to sort out` : `Approve and load into ${siteName}`}</button>
      </section>
      {adding && <AddItems zoho={zoho?.items ?? []} skip={inZohoSet} onClose={() => setAdding(false)} onAdd={(z) => setD({ ...d, extra: [...d.extra, { zoho: z, qty: null }] })} />}
    </div>
  );
}

/** A Zoho item, changeable: suggestions first, then search the whole list. */
function ZohoPicker({ value, onPick, suggest, zoho }: { value: ZohoItem | null; onPick: (z: ZohoItem) => void; suggest: ZohoItem[]; zoho: ZohoItem[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = q.trim() ? searchZoho(q, zoho) : suggest;
  return (
    <span className="fcPick">
      <button type="button" className={`fcPickBtn ${value ? '' : 'empty'}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{value ? value.name : 'Pick a Zoho item'}</span>{value?.unit && <small>{value.unit}</small>}<Icon name="chevD" size={14} /></button>
      {open && (
        <div className="fcMenu" role="listbox">
          <input className="input" autoFocus placeholder="Search Zoho’s list" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
          {!q.trim() && <small className="muted">Closest in Zoho</small>}
          {hits.map((z) => <button key={z.zoho_item_id} type="button" role="option" aria-selected={value?.zoho_item_id === z.zoho_item_id} onClick={() => { onPick(z); setOpen(false); setQ(''); }}><span>{z.name}</span><small>{z.unit ?? ''}</small></button>)}
          {q.trim() && !hits.length && <small className="muted">Nothing in Zoho matches “{q}”.</small>}
        </div>
      )}
    </span>
  );
}

/** + Add items: search Zoho's list and add items that weren't in the file. */
function AddItems({ zoho, skip, onAdd, onClose }: { zoho: ZohoItem[]; skip: Set<string>; onAdd: (z: ZohoItem) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const hits = q.trim().length > 1 ? searchZoho(q, zoho, new Set([...skip, ...added]), 12) : [];
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="panel fcAdd" role="dialog" aria-modal="true" aria-label="Add items">
        <header><b>Add items from Zoho</b><button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <input className="input" autoFocus placeholder="Search, e.g. cement, T12, PPR 25" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="fcAddList">
          {hits.map((z) => <button key={z.zoho_item_id} type="button" onClick={() => { onAdd(z); setAdded(new Set([...added, z.zoho_item_id])); }}><span>{z.name}</span><small>{z.unit ?? ''}</small><Icon name="plus" size={15} /></button>)}
          {q.trim().length > 1 && !hits.length && <small className="muted">Nothing in Zoho matches “{q}”.</small>}
          {q.trim().length <= 1 && <small className="muted">Type at least two letters. Items already on the list don’t show.</small>}
        </div>
        <footer><span className="muted small">{added.size ? `${added.size} added. Type their quantities on the page.` : ''}</span><button className="adBtn dark" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}

