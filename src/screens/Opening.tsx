import { useMemo, useRef, useState } from 'react';
import { checkLines, fmt, ItemPicker, LineEditor, newLine, Top, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_ORDER, categoryOf } from '../lib/categories';
import { matchRows, readPasted, readSheet, type MatchRow } from '../lib/importSheet';
import { useData } from '../lib/store';
import type { Item } from '../lib/types';
import { ask, toast } from '../components/feedback';

type Mode = 'upload' | 'checklist' | 'search';

/** Save item → quantity pairs as one opening-count entry. */
function useSaveOpening() {
  const { day, balances, refresh, go } = useData();
  return async (pairs: [Item, number][], first: boolean) => {
    const sum = new Map<number, { it: Item; q: number }>();
    pairs.filter(([, q]) => q > 0).forEach(([it, q]) => sum.set(it.id, { it, q: (sum.get(it.id)?.q ?? 0) + q }));
    if (!sum.size) throw new Error('Nothing to save yet.');
    const already = balances.filter((b) => sum.has(b.item_id));
    if (already.length && !(await ask({ title: 'Add to existing balances?', body: <p>{already.length} of these items already have a balance (e.g. {already[0].name}). Saving adds to them.</p>, yes: 'Yes, add them' }))) return false;
    await api.saveDocument({ kind: 'opening', doc_date: day, reason: first ? 'Opening count' : 'Added to opening count' },
      [...sum.values()].map(({ it, q }) => ({ item_id: it.id, qty: q })));
    await refresh();
    toast(`Opening count saved · ${sum.size} item${sum.size === 1 ? '' : 's'}`);
    go('home');
    return true;
  };
}

export function Upload({ first, onPairs }: { first: boolean; onPairs?: (pairs: [Item, number][]) => Promise<unknown> }) {
  const { items, addItem } = useData();
  const saveOpening = useSaveOpening();
  const save = onPairs ?? saveOpening;
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const units = useMemo(() => [...new Set(items.map((i) => i.unit))].sort(), [items]);

  const load = async (f: File) => {
    setErr(''); setBusy(true); setFileName(f.name);
    try {
      const sheet = await readSheet(f);
      if (!sheet.length) throw new Error('No item and quantity columns found in this file. Check it has a column of item names and a column of numbers.');
      setRows(matchRows(sheet, items));
    } catch (e) { setErr((e as Error).message); setRows(null); } finally { setBusy(false); }
  };
  const loadPaste = () => {
    const sheet = readPasted(paste);
    if (!sheet.length) { setErr('Paste lines like “Cement 212” or two columns copied from Excel.'); return; }
    setErr(''); setFileName('pasted list'); setRows(matchRows(sheet, items));
  };
  const setRow = (key: number, patch: Partial<MatchRow>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const order: Record<string, number> = { check: 0, new: 1, ok: 2 };
  const sorted = rows ? [...rows].sort((a, b) => order[a.kind] - order[b.kind] || a.key - b.key) : [];
  const ready = rows?.filter((r) => r.kind === 'ok' && r.item) ?? [];
  const left = rows?.filter((r) => r.kind !== 'ok').length ?? 0;

  const onSave = async () => {
    setBusy(true); setErr('');
    try { await save(ready.map((r) => [r.item!, r.qty]), first); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!rows) {
    return (
      <div className="stack enter">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
        <button className="card pad" style={{ textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center', border: '2px solid var(--ink)' }} onClick={() => fileRef.current?.click()} disabled={busy}>
          <span style={{ fontSize: 30 }} aria-hidden>📊</span>
          <span><b style={{ fontSize: 17 }}>{busy ? 'Reading…' : 'Upload Excel or CSV'}</b><br /><span className="small muted">The store’s stock sheet: any layout with item names and quantities.</span></span>
        </button>
        <button className="card pad" style={{ textAlign: 'left', display: 'flex', gap: 14, alignItems: 'center', border: '2px solid var(--ink)' }} onClick={() => setShowPaste(!showPaste)}>
          <span style={{ fontSize: 30 }} aria-hidden>📋</span>
          <span><b style={{ fontSize: 17 }}>Paste a list</b><br /><span className="small muted">From Excel, WhatsApp or notes: one item per line, name then number.</span></span>
        </button>
        {showPaste && (
          <div className="card pad stack enter">
            <textarea className="input" style={{ minHeight: 140, padding: 10, fontFamily: 'var(--mono)', fontSize: 14 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Cement 212\nBallast 9\nRiver sand 14\nY12 40'} aria-label="Pasted list" />
            <button className="btn accent" onClick={loadPaste}>Match the list</button>
          </div>
        )}
        <div className="note info">Nothing is saved until you check the list. Lines the system is unsure about are shown first. A photo of a handwritten count comes later.</div>
        {err && <div className="note err" role="alert">{err}</div>}
      </div>
    );
  }

  return (
    <div className="stack enter">
      <div className="between"><span className="small muted">From {fileName}</span><button className="btn link" onClick={() => { setRows(null); setErr(''); }}>Use a different file</button></div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="pill done">{ready.length} matched</span>
        {!!rows.filter((r) => r.kind === 'check').length && <span className="pill">{rows.filter((r) => r.kind === 'check').length} to check</span>}
        {!!rows.filter((r) => r.kind === 'new').length && <span className="pill" style={{ background: 'var(--error-soft)', color: 'var(--error)' }}>{rows.filter((r) => r.kind === 'new').length} not in the list</span>}
      </div>
      {sorted.map((r) => (
        <div key={r.key} className="card pad stack" style={{ gap: 6, borderLeft: `5px solid ${r.kind === 'ok' ? 'var(--ok)' : r.kind === 'check' ? 'var(--accent)' : 'var(--error)'}` }}>
          <div className="between"><span className="small muted mono">“{r.raw}”</span>
            <input className="input num" style={{ width: 90, minHeight: 38 }} inputMode="decimal" value={r.qty} aria-label={`Quantity for ${r.raw}`} onChange={(e) => setRow(r.key, { qty: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} /></div>
          {r.kind === 'ok' && r.item && <div className="between"><span><span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span> <b>{r.item.name}</b> <span className="muted">{r.item.unit}</span></span>
            <button className="btn link" onClick={() => setRow(r.key, { kind: 'check', item: null, options: r.options.length ? r.options : [r.item!] })}>Change</button></div>}
          {r.kind === 'check' && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>Which item is it?</span>
              {r.options.map((o) => <button key={o.id} className="btn ghost" style={{ minHeight: 42, justifyContent: 'space-between', fontSize: 15 }} onClick={() => setRow(r.key, { kind: 'ok', item: o })}><span>{o.name}</span><span className="mono small muted">{o.unit}</span></button>)}
              <ItemPicker item={null} onPick={(it) => it && setRow(r.key, { kind: 'ok', item: it })} />
              <button className="btn link" style={{ alignSelf: 'flex-start' }} onClick={() => setRow(r.key, { kind: 'new' })}>None of these: it’s a new item</button>
            </div>
          )}
          {r.kind === 'new' && <NewItemRow raw={r.raw} units={units} onAdded={(it) => setRow(r.key, { kind: 'ok', item: it })} add={addItem} onSkip={() => setRows((rs) => rs!.filter((x) => x.key !== r.key))} />}
        </div>
      ))}
      {err && <div className="note err" role="alert">{err}</div>}
      <button className="btn ok" disabled={busy || !ready.length} onClick={onSave}>{busy ? 'Saving…' : `Save ${ready.length} items${left ? ` · ${left} still to check` : ''}`}</button>
      {!!left && <div className="small muted">Lines still to check are left out. You can add them later.</div>}
    </div>
  );
}

function NewItemRow({ raw, units, add, onAdded, onSkip }: { raw: string; units: string[]; add: (n: string, u: string) => Promise<Item>; onAdded: (it: Item) => void; onSkip: () => void }) {
  const [name, setName] = useState(raw);
  const [unit, setUnit] = useState('Pcs');
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">Not in the item list. Add it, or skip this line.</span>
      <div className="row"><input className="input" style={{ flex: 1, minHeight: 42 }} value={name} onChange={(e) => setName(e.target.value)} aria-label="New item name" />
        <select className="select" style={{ width: 96, minHeight: 42 }} value={unit} onChange={(e) => setUnit(e.target.value)}>{units.map((u) => <option key={u}>{u}</option>)}</select></div>
      <div className="row"><button className="btn accent" style={{ minHeight: 42, fontSize: 16 }} disabled={busy || !name.trim()} onClick={async () => { setBusy(true); try { onAdded(await add(name.trim(), unit)); } finally { setBusy(false); } }}>Add as new item</button>
        <button className="btn link" onClick={onSkip}>Skip</button></div>
    </div>
  );
}

function Checklist({ first }: { first: boolean }) {
  const { items } = useData();
  const save = useSaveOpening();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ 'Cement & aggregates': true });
  const [q, setQ] = useState('');
  const [review, setReview] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    items.forEach((it) => { const c = categoryOf(it.name); m.set(c, [...(m.get(c) ?? []), it]); });
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({ name: c, items: m.get(c)! }));
  }, [items]);
  const counted = items.filter((it) => qty[it.id] && Number(qty[it.id]) > 0);
  const s = q.trim().toLowerCase();

  if (review) {
    return (
      <div className="stack enter">
        <div className="label">Check before saving ({counted.length})</div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {counted.map((it) => <div key={it.id} className="listRow" style={{ cursor: 'default' }}><span className="nm">{it.name}</span><span className="q">{fmt(Number(qty[it.id]))}</span><span className="u">{it.unit}</span></div>)}
        </div>
        {err && <div className="note err" role="alert">{err}</div>}
        <button className="btn ok" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await save(counted.map((it) => [it, Number(qty[it.id])]), first); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Save opening count'}</button>
        <button className="btn ghost" onClick={() => setReview(false)}>Back to counting</button>
      </div>
    );
  }

  return (
    <div className="stack enter">
      <div className="card pad between"><div><div className="label">Counted so far</div><div className="mono" style={{ fontSize: 26, fontWeight: 600 }}>{counted.length} <span className="small muted" style={{ fontFamily: 'var(--body)' }}>items</span></div></div>
        <button className="btn accent" style={{ width: 'auto' }} disabled={!counted.length} onClick={() => setReview(true)}>Review</button></div>
      <input className="search" type="search" placeholder={`Search any item (${items.length.toLocaleString()})`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
      {groups.map((g) => {
        const list = s ? g.items.filter((it) => it.name.toLowerCase().includes(s)) : g.items;
        if (s && !list.length) return null;
        const done = g.items.filter((it) => qty[it.id] && Number(qty[it.id]) > 0).length;
        const isOpen = s ? true : !!open[g.name];
        return (
          <div key={g.name} className="card" style={{ overflow: 'hidden' }}>
            <button className="step" style={{ background: '#F6F7F5' }} aria-expanded={isOpen} onClick={() => setOpen({ ...open, [g.name]: !open[g.name] })}>
              <b style={{ flex: 1 }}>{g.name}</b><span className={`pill ${done ? 'done' : 'grey'}`}>{done} counted</span><span aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && list.slice(0, s ? 60 : 400).map((it) => {
              const v = qty[it.id] ?? '';
              return (
                <div key={it.id} className="listRow" style={{ background: v ? '#F3FAF6' : '#fff', cursor: 'default' }}>
                  <span className="nm" style={{ whiteSpace: 'normal', fontSize: 14 }}>{it.name}</span>
                  <input className="input num" style={{ width: 84, minHeight: 40, borderWidth: 1 }} inputMode="decimal" placeholder="–" value={v} aria-label={`${it.name} quantity`}
                    onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(/[^0-9.]/g, '') })} />
                  <span className="u">{it.unit}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="small muted center" style={{ textAlign: 'center' }}>Leave empty anything that isn’t in the store.</div>
    </div>
  );
}

function Search({ first }: { first: boolean }) {
  const save = useSaveOpening();
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack enter">
      <LineEditor lines={lines} setLines={setLines} withSubphase={false} />
      {err && <div className="note err" role="alert">{err}</div>}
      <button className="btn accent" disabled={busy} onClick={async () => {
        const p = checkLines(lines, {});
        if (p) { setErr(p); return; }
        setBusy(true); setErr('');
        try { await save(lines.filter((l) => l.item).map((l) => [l.item!, Number(l.qty)]), first); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Saving…' : 'Save opening count'}</button>
    </div>
  );
}

export function Opening() {
  const { balances, go, submission } = useData();
  const [mode, setMode] = useState<Mode>('upload');
  const first = !balances.length;
  return (
    <div className="phone">
      <Top onBack={() => go('home')} title="Opening count" sub={first ? 'What is in the store right now' : 'Add items that were missed in the first count'} />
      <main className="body">
        {submission ? (
          <div className="note info">Today has been submitted. Enter the opening count tomorrow, before the day’s check-in.</div>
        ) : (
          <>
            <div className="seg" role="tablist" style={{ display: 'flex' }}>
              {([['upload', 'Upload a sheet'], ['checklist', 'Checklist'], ['search', 'One by one']] as [Mode, string][]).map(([m, l]) => (
                <button key={m} role="tab" aria-pressed={mode === m} style={{ flex: 1 }} onClick={() => setMode(m)}>{l}</button>
              ))}
            </div>
            {mode === 'upload' && <Upload first={first} />}
            {mode === 'checklist' && <Checklist first={first} />}
            {mode === 'search' && <Search first={first} />}
          </>
        )}
      </main>
    </div>
  );
}
