import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { niceDate, weekdayName } from '../lib/dates';
import { STEPS, useData } from '../lib/store';
import type { Doc, Draft, Item, StepKey } from '../lib/types';
import { signal } from '../lib/signals';
import { ask, toast } from './feedback';
import { Icon } from './fx';
import { fmt, newLine, Suggest, TimeBoxes, type LineDraft } from './ui';

/** What each left-out detail is called, per kind of entry. */
export const DETAIL_LABEL: Record<string, Record<string, string>> = {
  delivery: { party: 'Supplier', ref_no: 'Delivery note no.', subphase: 'Sub-phase' },
  issue: { ref_no: 'Card code (red number)', activity: 'Activity', doc_time: 'Time', gemba: 'Gemba', subphase: 'Gemba', party: 'Issued to', supervisor: 'SM / Supervisor' },
  transfer_in: { party: 'Project', ref_no: 'Transfer note no.', authorised_by: 'Authorised by' },
  transfer_out: { party: 'Project', ref_no: 'Transfer note no.', authorised_by: 'Authorised by' },
};
const KIND_NAME: Record<string, string> = { delivery: 'Delivery', issue: 'Card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };
const labelsFor = (kind: string, keys: string[]) => [...new Set(keys.map((k) => DETAIL_LABEL[kind]?.[k] ?? k))];
export const shortDay = (d: string) => `${weekdayName(d).slice(0, 3)} ${niceDate(d).split(' ').slice(1).join(' ')}`;

/** Brings the first gently highlighted box into view and puts the cursor in it. */
export function focusMiss() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('.miss');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
  });
}

/** Shown under a form when details are missing: save now and confirm them later, or keep it as a draft. */
export function LaterBar({ kind, missing, busy, onLater, onCancel }: { kind: string; missing: string[]; busy: boolean; onLater: () => void; onCancel: () => void }) {
  return (
    <div className="laterBar" role="alert">
      <span className="lbIc" aria-hidden="true"><Icon name="clock" size={18} /></span>
      <div className="lbText"><b>Missing: {labelsFor(kind, missing).join(', ')}.</b><span>They're highlighted in yellow on the form. Quantities are complete, so you can also save now: it counts in stock, and Bohari reminds you to fill these in.</span></div>
      <span className="lbActs">
        <button className="btn ghost sm" onClick={() => { onCancel(); focusMiss(); }}>Fill them in now</button>
        <button className="btn sm" disabled={busy} onClick={onLater}>{busy ? 'Saving…' : 'Save · confirm later'}</button>
      </span>
    </div>
  );
}

/** A form picks up the draft the user chose to finish (once), and knows its date. */
export function useDraft(step: StepKey) {
  const { draftToOpen, openDraft } = useData();
  const [draft] = useState<Draft | null>(() => (draftToOpen?.step === step ? draftToOpen : null));
  useEffect(() => { if (draft) openDraft(null); }, [draft, openDraft]);
  return draft;
}

/** "Sub-phase missing" first, what it belongs to second: the missing part is what the eye lands on. */
const missingText = (labels: string[]) =>
  labels.length === 1 ? `${labels[0]} missing` : labels.length === 2 ? `${labels[0]} and ${labels[1].toLowerCase()} missing` : `${labels.length} details missing`;

/** One slim line on the check-in page per unfinished entry (the first shown, the rest behind "+ more"). */
export function UnfinishedCard() {
  const { unconfirmed, drafts, refreshUnfinished, openDraft, go, itemById, startCatchUp, realToday, day } = useData();
  const [finishing, setFinishing] = useState<Doc | null>(null);
  const [all, setAll] = useState(false);
  const n = unconfirmed.length + drafts.length;
  if (!n) return null;
  const openIt = (d: Draft) => {
    const st = STEPS.find((s) => s.key === d.step)!;
    if (d.doc_date !== day && d.doc_date !== realToday) startCatchUp(d.doc_date);
    openDraft(d);
    signal('step-form', d.step);
    go(st.screen);
  };
  const discard = async (d: Draft) => {
    if (!(await ask({ title: 'Discard this draft?', body: <p>{d.label}. Nothing from it was counted in stock, so nothing else changes.</p>, yes: 'Discard draft', tone: 'danger' }))) return;
    await api.deleteDraft(d.id); await refreshUnfinished(); toast('Draft discarded');
  };
  const rows = [
    ...unconfirmed.map((d) => {
      const labels = labelsFor(d.kind, d.to_confirm ?? []);
      const what = `${KIND_NAME[d.kind] ?? 'Entry'}${d.ref_no ? ` ${d.ref_no}` : ''} · ${d.lines.slice(0, 2).map((l) => { const it = itemById.get(l.item_id); return `${it?.name ?? 'Item'} ${fmt(l.qty)} ${it?.unit ?? ''}`.trim(); }).join(', ')}${d.lines.length > 2 ? '…' : ''} · ${shortDay(d.doc_date)}`;
      return (
        <div key={d.id} className="fbRow">
          <span className="fbIc" aria-hidden="true">!</span>
          <div className="fbText"><b className="fbMiss">{missingText(labels)}</b><span className="fbWhat">{labels.length > 2 ? `${labels.join(', ')} · ` : ''}{what}</span></div>
          <button className="btn sm" onClick={() => setFinishing(d)}>{labels.length === 1 ? `Add ${labels[0].toLowerCase()}` : 'Fill in'}</button>
        </div>
      );
    }),
    ...drafts.map((d) => (
      <div key={d.id} className="fbRow draft">
        <span className="fbIc" aria-hidden="true"><Icon name="list" size={14} /></span>
        <div className="fbText"><b className="fbMiss">Draft not finished</b><span className="fbWhat">{d.label} · {shortDay(d.doc_date)} · not counted in stock</span></div>
        <span className="fbActs"><button className="btn link" onClick={() => discard(d)}>Discard</button><button className="btn sm" onClick={() => openIt(d)}>Finish</button></span>
      </div>
    )),
  ];
  return (
    <section className="finBar enter" aria-label="Entries to finish">
      {all ? rows : rows[0]}
      {n > 1 && <button className="fbMore" onClick={() => setAll(!all)}>{all ? 'Show less' : `+ ${n - 1} more to finish`}</button>}
      {finishing && createPortal(<FinishSheet doc={finishing} onClose={() => setFinishing(null)} />, document.body)}
    </section>
  );
}

/** Fill in only the details that were left out. Quantities and the date never change here. */
function FinishSheet({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const { subphases, itemById, refreshUnfinished, refresh } = useData();
  const keys = doc.to_confirm ?? [];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const floorKeys: string[] = keys.filter((k) => k === 'gemba' || k === 'subphase');
  const other = keys.filter((k) => !floorKeys.includes(k));
  useEffect(() => {
    const f: Record<string, Parameters<typeof api.remembered>[0]> = { party: doc.kind === 'delivery' ? 'supplier' : doc.kind === 'issue' ? 'issued_to' : 'site', activity: 'activity', supervisor: 'supervisor', authorised_by: 'authorised_by' };
    Promise.all(other.filter((k) => f[k]).map((k) => api.remembered(f[k]).then((o) => [k, o] as const))).then((x) => setOpts(Object.fromEntries(x)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  const floor = vals.floor ?? '';
  const ready = other.some((k) => (vals[k] ?? '').trim()) || !!floor;
  const save = async () => {
    const fields: Record<string, string> = {};
    for (const k of other) if ((vals[k] ?? '').trim()) fields[k] = vals[k].trim();
    for (const k of floorKeys) if (floor) fields[k] = floor;
    setBusy(true);
    try {
      await api.confirmDetails(doc.id, fields);
      await Promise.all([refreshUnfinished(), refresh()]);
      toast(Object.keys(fields).length === keys.length ? 'Entry complete' : 'Saved · the rest is still to confirm');
      onClose();
    } catch (e) { toast((e as Error).message, 'warn'); setBusy(false); }
  };
  return (
    <div className="sheetBack dayAskBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dayAsk" role="dialog" aria-modal="true" aria-labelledby="finTitle">
        <span className="daKicker">Finish entry</span>
        <h2 id="finTitle">Fill in what was left out</h2>
        <div className="finSummary">{KIND_NAME[doc.kind] ?? 'Entry'}{doc.ref_no ? <> <b>{doc.ref_no}</b></> : ''} · {shortDay(doc.doc_date)} · {doc.lines.map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)}`).join(', ')}</div>
        {floorKeys.length > 0 && (
          <label className="field"><span>{doc.kind === 'issue' ? 'Gemba (floor)' : 'Sub-phase'}</span>
            <select className="select input" value={floor} onChange={(e) => setVals({ ...vals, floor: e.target.value })}><option value="">Choose…</option>{subphases.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
        )}
        {other.map((k) => k === 'doc_time'
          ? <div key={k} className="field"><span>Time on the card</span><TimeBoxes value={vals[k] ?? ''} onChange={(v) => setVals({ ...vals, [k]: v })} /></div>
          : opts[k] ? <Suggest key={k} label={DETAIL_LABEL[doc.kind]?.[k] ?? k} value={vals[k] ?? ''} onChange={(v) => setVals({ ...vals, [k]: v })} options={opts[k]} />
            : <label key={k} className="field"><span>{DETAIL_LABEL[doc.kind]?.[k] ?? k}</span><input className="input" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /></label>)}
        <button className="btn" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <span className="small muted" style={{ textAlign: 'center' }}>Only the missing details change. Quantities and the date stay as entered.</span>
        <button className="btn link" onClick={onClose}>Later</button>
      </section>
    </div>
  );
}

type PL = { itemId: number | null; qty: string; subphase: string };
export const linesToPayload = (ls: LineDraft[]): PL[] => ls.filter((l) => l.item || l.qty).map((l) => ({ itemId: l.item?.id ?? null, qty: l.qty, subphase: l.subphase }));
export function linesFromPayload(p: unknown, itemById: Map<number, Item>, min = 1): LineDraft[] {
  const ls = ((p as PL[] | undefined) ?? []).map((x) => ({ ...newLine(x.subphase ?? ''), item: x.itemId ? itemById.get(x.itemId) ?? null : null, qty: x.qty ?? '' }));
  while (ls.length < min) ls.push(newLine());
  return ls;
}
