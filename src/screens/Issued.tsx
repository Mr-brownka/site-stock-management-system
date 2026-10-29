import { useEffect, useRef, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, fmt, newLine, Suggest, type LineDraft } from '../components/ui';
import { SheetGrid } from '../components/SheetGrid';
import { api } from '../lib/api';
import { useData } from '../lib/store';
import { focusMiss, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { ask, toast } from '../components/feedback';
import { openRecords } from '../components/AddEntry';

const ROWS = 10; // the register starts with ten rows and grows as you fill it
const blank = () => Array.from({ length: ROWS }, () => newLine());

/** Material Issuance Register: everything the store gave out in the day, on one sheet (item, quantity, unit). */
function RegisterForm({ done, again }: { done: () => void; again: () => Promise<void> }) {
  const { day: today_, user, balanceOf, projectWeek, company, itemById, refreshUnfinished, go, recent } = useData();
  const draft = useDraft('issued');
  const day = draft?.doc_date ?? today_;
  const p = (draft?.payload ?? {}) as Record<string, string>;
  const [flag, setFlag] = useState(false);
  const [store, setStore] = useState(p.store ?? user.name);
  const [team, setTeam] = useState<string[]>([user.name]);
  const [lines, setLines] = useState<LineDraft[]>(() => (draft ? linesFromPayload(draft.payload.lines, itemById, ROWS) : blank()));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [stamped, setStamped] = useState(false);
  const [addedTo, setAddedTo] = useState(false);
  // One register a day: when the day already has one, this sheet adds to it.
  const existing = recent.find((d) => d.kind === 'issue' && !d.ref_no && d.doc_date === day);
  // The day's register is open (not submitted): its rows come back on the sheet and can all be changed.
  const savedQty = (id: number) => (existing?.lines ?? []).filter((l) => l.item_id === id).reduce((a, l) => a + Number(l.qty), 0);
  const stockFor = (id: number) => balanceOf(id) + savedQty(id); // before this register took anything
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || draft || !existing) return;
    filled.current = true;
    const rows = existing.lines.map((l) => ({ ...newLine(), item: itemById.get(l.item_id) ?? null, qty: String(Number(l.qty)) }));
    setLines([...rows, ...Array.from({ length: Math.max(2, ROWS - rows.length) }, () => newLine())]);
  }, [existing, draft, itemById]);
  useEffect(() => { api.siteTeam().then((t) => setTeam(t.length ? t : [user.name])).catch(() => undefined); }, [user.name]);

  const used = lines.filter((l) => l.item || l.qty);
  // The same item twice adds up (Cement 20 + 18 = 38).
  const merged = () => {
    const m = new Map<number, number>();
    for (const l of used) if (l.item) m.set(l.item.id, (m.get(l.item.id) ?? 0) + (Number(l.qty) || 0));
    return m;
  };
  const dateText = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const save = async () => {
    setFlag(true);
    if (existing && !used.length) {
      if (!(await ask({ title: `Take every row off ${dateText}’s register?`, body: <p>The register for the day is removed and the stock goes back to the store.</p>, yes: 'Remove the register', no: 'Keep it', tone: 'danger' }))) return;
      setBusy('save');
      try { await api.setRegister(day, store.trim() || null, []); toast('Register removed · stock is back'); done(); } catch (e) { setErr((e as Error).message); setBusy(''); }
      return;
    }
    const hard = !used.length && !existing ? 'Add at least one item with its quantity.' : checkLines(lines, { stock: stockFor });
    const over = [...merged().entries()].find(([id, q]) => q > stockFor(id));
    if (hard || over) { setErr(hard || `Only ${fmt(stockFor(over![0]))} ${itemById.get(over![0])?.unit ?? ''} of ${itemById.get(over![0])?.name} in store.`); focusMiss(); return; }
    setBusy('save'); setErr('');
    try {
      const items = [...merged().entries()].filter(([, q]) => q > 0).map(([item_id, qty]) => ({ item_id, qty }));
      const r = existing ? await api.setRegister(day, store.trim() || null, items) : await api.saveRegister(day, store.trim() || null, items);
      setAddedTo(r !== 'new');
      if (draft) { await api.deleteDraft(draft.id).catch(() => undefined); refreshUnfinished(); }
      setStamped(true);
      setTimeout(done, 1300);
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };
  void again;

  const saveDraft = async () => {
    if (!used.length) { setErr('Nothing to keep yet.'); return; }
    setBusy('draft');
    try {
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      await api.saveDraft({ step: 'issued', doc_date: day, label: `Issuance register · ${used.length} item${used.length === 1 ? '' : 's'}`, payload: { store, lines: linesToPayload(lines) } });
      await refreshUnfinished(); toast('Saved as a draft · not counted in stock yet'); go('home');
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };

  return (
    <div className="stack enter">
      {existing && <div className="note mirAdd" role="status"><b>{dateText}’s register, not submitted yet.</b> Change any row, take one off (clear it), or add the next items below.</div>}
      <div className={`mir ${stamped ? 'stamped' : ''}`} role="group" aria-label="Material Issuance Register">
        {stamped && <div className="stampMark big" aria-live="polite"><b>{addedTo ? 'SAVED' : 'ENTERED'}</b><small>{dateText} · {store.split(' ')[0]}</small></div>}
        <div className="mirHead">
          <div className="mwcLogo"><span className="mwcArc" aria-hidden="true" /><b>{(company || 'Comex Builders').toUpperCase()}</b><small>LTD</small></div>
          <div className="mirTitle">MATERIAL ISSUANCE REGISTER</div>
          <div className="mirMeta"><span>Week <b className="mono">{projectWeek ?? '–'}</b></span><span>Date <b>{dateText}</b></span></div>
        </div>
        <SheetGrid lines={lines} setLines={setLines} stock={stockFor} effect="out" flag={flag} onEmptyEnter={() => save()} />
        <div className="mirFoot"><span>Store</span><Suggest bare showAll nav="store" label="Store" value={store} onChange={setStore} options={team} placeholder="Who issued from the store" inputClass="mirIn" onNext={() => save()} /></div>
      </div>

      {err && <div className="note err" role="alert">{err}</div>}
      <div className="actionBar">
        <button className="btn ghost sm" onClick={() => openRecords(go, 'issued')}>Cancel</button>
        <button className="btn link" disabled={!!busy} onClick={saveDraft}>{busy === 'draft' ? 'Saving…' : 'Save as draft'}</button>
        <span className="abGrow" />
        <span className="small muted abHint">{used.length ? `${merged().size} item${merged().size === 1 ? '' : 's'} · one entry for the day` : 'Item, quantity, Enter. Next item.'}</span>
        <button className="btn accent sm" disabled={!!busy} onClick={save}>{busy === 'save' ? 'Saving…' : existing ? 'Save changes' : 'Save the register'}</button>
      </div>
    </div>
  );
}

export function Issued() {
  return (
    <StepShell step="issued" sub="Everything the store gave out today, on one sheet."
      renderForm={(done, again) => <RegisterForm done={done} again={again} />} />
  );
}
