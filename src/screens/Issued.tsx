import { useEffect, useRef, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, fmt, ItemPicker, lineMiss, newLine, Suggest, TimeBoxes, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { addDays } from '../lib/dates';
import { useData } from '../lib/store';
import { focusMiss, LaterBar, linesFromPayload, linesToPayload, useDraft } from '../components/Unfinished';
import { toast } from '../components/feedback';
import { openRecords } from '../components/AddEntry';

const ROWS = 7; // the paper card has seven item rows
const blank = () => Array.from({ length: ROWS }, () => newLine());

/** The Material Withdrawal Card, laid out box for box like the paper one (Ref: FM-5/CB/IMS/SOP/PMD). */
function CardForm({ done, again }: { done: () => void; again: () => Promise<void> }) {
  const { day: today_, user, balanceOf, docsToday, projectWeek, company, subphases, itemById, refreshUnfinished, go } = useData();
  const draft = useDraft('issued');
  const day = draft?.doc_date ?? today_;
  const p = (draft?.payload ?? {}) as Record<string, string>;
  const [later, setLater] = useState<string[] | null>(null);
  const [flag, setFlag] = useState(false); // after a save attempt: highlight what is still empty
  const miss = (empty: boolean) => (flag && empty ? 'miss' : '');
  const [known, setKnown] = useState<Map<string, string>>(new Map());
  const [acts, setActs] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [sups, setSups] = useState<string[]>([]);
  const [code, setCode] = useState(p.code ?? '');
  const [cardNo, setCardNo] = useState(p.cardNo ?? '');
  const [time, setTime] = useState(p.time ?? '');
  const [activity, setActivity] = useState(p.activity ?? '');
  const [gemba, setGemba] = useState(p.gemba ?? '');
  const [to, setTo] = useState(p.to ?? '');
  const [sup, setSup] = useState(p.sup ?? '');
  // Anyone on the site's store team can approve an issue; the signed-in person by default.
  const [store, setStore] = useState(p.store ?? user.name);
  const [team, setTeam] = useState<string[]>([user.name]);
  const [lines, setLines] = useState<LineDraft[]>(() => (draft ? linesFromPayload(draft.payload.lines, itemById, ROWS) : blank()));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    api.remembered('activity').then(setActs);
    api.remembered('issued_to').then(setPeople);
    api.remembered('supervisor').then(setSups);
    api.siteTeam().then((t) => setTeam(t.length ? t : [user.name])).catch(() => undefined);
    api.documents(addDays(day, -180), day).then((ds) => setKnown(new Map(ds.filter((d) => d.kind === 'issue' && d.ref_no).map((d) => [d.ref_no!.trim(), d.doc_date]))));
  }, [day, docsToday.length]);

  // The card number (Card No box) is what identifies a card; the Code box is optional.
  const dupe = cardNo.trim() ? known.get(cardNo.trim()) : undefined;
  const patch = (k: number, p: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));
  const used = lines.filter((l) => l.item || l.qty);
  const firstEmpty = lines.findIndex((l) => !l.item);

  /* Guided order, one glowing box at a time:
     Code → Activity → Card No → Item → Qty → (next item …) → Time → Gemba → Issued to → Supervisor → Store → saved, stamped.
     Clicking any box moves the guide there; Enter always moves it on. */
  const root = useRef<HTMLDivElement>(null);
  const [guide, setGuide] = useState('code');
  const goTo = (key: string) => {
    setGuide(key);
    // Focus straight away so fast typing lands in the right box; a box that is only now appearing gets it a frame later.
    const find = () => root.current?.querySelector<HTMLElement>(`[data-g="${key}"]`);
    const el = find();
    if (el) el.focus(); else requestAnimationFrame(() => find()?.focus());
  };
  const afterHead = () => goTo(`item${Math.max(0, firstEmpty)}`);
  const g = (key: string) => guide === key;
  // A floor picked with the mouse moves on by itself; with the keyboard, arrows browse and Enter moves on.
  const gembaByMouse = useRef(false);
  const dateText = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).replace(/\//g, '.');

  const save = async (stay: boolean, confirmLater = false) => {
    // Items, quantities and stock must be right; the other boxes can be confirmed later.
    const hard = !cardNo.trim() ? 'Write the card number (Card No box).' : dupe ? `Card ${cardNo.trim()} was already entered on ${dupe}.` : checkLines(lines, { stock: balanceOf });
    setFlag(true);
    if (hard) { setErr(hard); setLater(null); focusMiss(); return; }
    const missing = [!activity.trim() && 'activity', time.length !== 5 && 'doc_time', !gemba && 'gemba', !gemba && 'subphase', !to.trim() && 'party', !sup.trim() && 'supervisor'].filter(Boolean) as string[];
    if (missing.length && !confirmLater) { setErr(''); setLater(missing); return; }
    setBusy(stay ? 'again' : 'save'); setErr(''); setLater(null);
    try {
      await api.saveDocument({ kind: 'issue', doc_date: day, doc_time: time.length === 5 ? time : null, ref_no: cardNo.trim(), card_no: code.trim() || null, party: to.trim() || null, activity: activity.trim() || null, gemba: gemba || null, supervisor: sup.trim() || null, authorised_by: store.trim() || null, ...(missing.length ? { to_confirm: missing } : {}) },
        used.map((l) => ({ item_id: l.item!.id, qty: Number(l.qty), subphase: gemba || null })));
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      if (missing.length || draft) refreshUnfinished();
      setStamped(true);
      if (stay) {
        await again();
        setTimeout(() => { setStamped(false); setFlag(false); setCode(''); setCardNo(''); setTime(''); setActivity(''); setGemba(''); setTo(''); setSup(''); setStore(user.name); setLines(blank()); setBusy(''); window.scrollTo({ top: 0, behavior: 'smooth' }); goTo('code'); }, 1300);
      } else setTimeout(done, 1400);
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };

  // Enter on the last box saves; it runs after the picked name has landed in the form.
  const saveRef = useRef(save); saveRef.current = save;
  const saveSoon = () => setTimeout(() => saveRef.current(false), 30);

  const saveDraft = async () => {
    if (!cardNo.trim() && !code.trim() && !activity.trim() && !used.length) { setErr('Nothing to keep yet.'); return; }
    setBusy('draft');
    try {
      if (draft) await api.deleteDraft(draft.id).catch(() => undefined);
      await api.saveDraft({ step: 'issued', doc_date: day, label: `Card ${cardNo.trim() || '(no. not filled in)'}${activity.trim() ? ` · ${activity.trim()}` : ''}`, payload: { code, cardNo, time, activity, gemba, to, sup, store, lines: linesToPayload(lines) } });
      await refreshUnfinished(); toast('Saved as a draft · not counted in stock yet'); go('home');
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  };

  // The right-hand column of the item rows on the paper: Time, Gemba, Issued to, Date.
  const side: { label?: string; node?: JSX.Element }[] = [
    { node: <TimeBoxes nav="time" value={time} onChange={setTime} glow={g('time')} miss={flag} onDone={() => goTo('gemba')} /> },
    { label: 'Gemba' },
    { node: (
      <label className="field bare"><span className="sr">Gemba</span>
        <select data-nav data-g="gemba" className={`select input mwcIn ${g('gemba') ? 'next' : ''} ${miss(!gemba)}`} value={gemba}
          onPointerDown={() => { gembaByMouse.current = true; }}
          onChange={(e) => { setGemba(e.target.value); if (e.target.value && gembaByMouse.current) goTo('to'); }}
          onKeyDown={(e) => { gembaByMouse.current = false; if (e.key === 'Enter') { e.preventDefault(); goTo('to'); } }}>
          <option value="">Choose…</option>{subphases.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>) },
    { label: 'Issued to' },
    { node: <Suggest bare nav="to" label="Issued to" value={to} onChange={setTo} options={people} placeholder="Name" glow={g('to')} inputClass={`mwcIn ${miss(!to.trim())}`} onNext={() => goTo('sup')} /> },
    { label: 'Date' },
    { node: <div className="mwcDate mono">{dateText}</div> },
  ];

  return (
    <div className="stack enter">
      <div ref={root} className={`mwc ${stamped ? 'stamped' : ''}`} role="group" aria-label="Material withdrawal card"
        onFocusCapture={(e) => { const k = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g; if (k) setGuide(k); }}>
        {stamped && <div className="stampMark big" aria-live="polite"><b>ENTERED</b><small>{dateText} · {store.split(' ')[0]}</small></div>}
        <div className="mwcRef"><span>Effective Date: April 2025</span><span>Ref: FM-5/CB/IMS/SOP/PMD</span></div>

        <div className="mwcHead">
          <div className="mwcLogo"><span className="mwcArc" aria-hidden="true" /><b>{(company || 'Comex Builders').toUpperCase()}</b><small>LTD</small></div>
          <div className="mwcTitle">MATERIAL WITHDRAWAL CARD</div>
          <div className="mwcWeek"><span>Week no.</span><b className="mono" title="Project week">{projectWeek ?? '–'}</b></div>
        </div>

        <div className="mwcHead lbl"><div>Code</div><div>Activity</div><div>Card No</div></div>
        <div className="mwcHead vals">
          <div>
            <label className="field bare"><span className="sr">Code (red number)</span>
              <input data-nav data-g="code" className={`input mwcIn mwcCode mono ${g('code') ? 'next' : ''}`} value={code} autoFocus placeholder="(optional)"
                onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goTo('activity'); } }} />
            </label>
          </div>
          <div><Suggest bare nav="activity" label="Activity" value={activity} onChange={setActivity} options={acts} placeholder="e.g. Plaster" glow={g('activity')} inputClass={`mwcIn ${miss(!activity.trim())}`} onNext={() => goTo(cardNo.trim() ? `item${Math.max(0, firstEmpty)}` : 'cardNo')} /></div>
          <div>
            <label className="field bare"><span className="sr">Card No</span>
              <input data-nav data-g="cardNo" className={`input mwcIn mono ${g('cardNo') ? 'next' : ''} ${dupe ? 'bad' : ''} ${miss(!cardNo.trim())}`} inputMode="numeric" value={cardNo} placeholder="Card no."
                onChange={(e) => setCardNo(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); afterHead(); } }} />
            </label>
          </div>
        </div>
        {dupe && <div className="mwcWarn">Card {cardNo.trim()} was already entered on {dupe}. Check the number.</div>}

        <div className="mwcGrid">
          <div className="mwcTh mwcN">#</div><div className="mwcTh mwcItemH" aria-hidden="true" /><div className="mwcTh">Qty</div><div className="mwcTh">Unit</div><div className="mwcTh mwcSideH">Time</div>
          {/* The side column comes first so Enter goes Time → Gemba → Issued to before the items. */}
          {side.map((s, i) => <div key={`s${i}`} className={`mwcTd mwcSide ${s.label ? 'mwcSideL' : ''}`} style={{ gridRow: i + 2 }}>{s.label ?? s.node}</div>)}
          {lines.map((l, i) => {
            const q = Number(l.qty) || 0;
            const have = l.item ? balanceOf(l.item.id) : 0;
            const over = !!l.item && q > have;
            const ms = lineMiss(lines, i, flag);
            return [
              <div key={`n${l.key}`} className="mwcTd mwcN mono" style={{ gridRow: i + 2 }}>{i + 1}</div>,
              <div key={`i${l.key}`} className="mwcTd mwcItem" style={{ gridRow: i + 2 }}>
                <ItemPicker bare nav={`item${i}`} label={`Item ${i + 1}`} item={l.item} onPick={(it) => patch(l.key, { item: it })} inputClass={`mwcIn ${ms.item ? 'miss' : ''}`} placeholder={i === firstEmpty ? 'Item…' : ''} glow={g(`item${i}`)}
                  onNext={() => goTo(`qty${i}`)} onEmptyEnter={() => goTo('time')} />
                {l.item && <span className={`mwcHave ${over ? 'bad' : ''}`}>{over ? `Only ${fmt(have)} in store` : `${fmt(have)} in store`}</span>}
              </div>,
              <div key={`q${l.key}`} className="mwcTd" style={{ gridRow: i + 2 }}>
                <label className="field bare"><span className="sr">Qty for item {i + 1}</span>
                  <input data-nav data-g={`qty${i}`} className={`input mwcIn num ${over ? 'bad' : g(`qty${i}`) ? 'next' : ''} ${ms.qty ? 'miss' : ''}`} inputMode="decimal" value={l.qty}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); goTo(i + 1 < lines.length ? `item${i + 1}` : 'time'); } }}
                    onChange={(e) => patch(l.key, { qty: e.target.value.replace(/[^0-9.]/g, '') })} aria-invalid={over} />
                </label>
              </div>,
              <div key={`u${l.key}`} className="mwcTd mwcUnit" style={{ gridRow: i + 2 }}>{l.item?.unit ?? ''}</div>,
              i >= side.length ? <div key={`e${l.key}`} className="mwcTd mwcSide mwcSideX" style={{ gridRow: i + 2 }} /> : null,
            ];
          })}
        </div>
        {used.length >= ROWS - 1 && <button type="button" className="mwcMore" onClick={() => setLines([...lines, newLine()])}>+ Add a row (card continues)</button>}

        <div className="mwcAppr">Approval</div>
        <div className="mwcFoot">
          <div><span>SM/Supervisor :</span><Suggest bare nav="sup" label="SM / Supervisor" value={sup} onChange={setSup} options={sups} placeholder="Name" glow={g('sup')} inputClass={`mwcIn ${miss(!sup.trim())}`} onNext={() => goTo('store')} /></div>
          <div><span>Store :</span><Suggest bare showAll nav="store" label="Store" value={store} onChange={setStore} options={team} placeholder="Who approved in the store" glow={g('store')} inputClass="mwcIn" onNext={() => { setGuide('done'); saveSoon(); }} /></div>
        </div>
      </div>

      {err && <div className="note err" role="alert">{err}</div>}
      {later && <LaterBar kind="issue" missing={later} busy={!!busy} onLater={() => save(false, true)} onCancel={() => setLater(null)} />}
      <div className="actionBar">
        <button className="btn ghost sm" onClick={() => openRecords(go, 'issued')}>Cancel</button>
        <button className="btn link" disabled={!!busy} onClick={saveDraft}>{busy === 'draft' ? 'Saving…' : 'Save as draft'}</button>
        <span className="abGrow" />
        <span className="small muted abHint">Copy the card exactly as written</span>
        <button data-nav className="btn ghost sm" disabled={!!busy} onClick={() => save(true)}>{busy === 'again' ? 'Saving…' : 'Save & next card'}</button>
        <button className="btn accent sm" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? 'Saving…' : 'Save card'}</button>
      </div>
    </div>
  );
}

export function Issued() {
  return (
    <StepShell step="issued" sub="One entry per Material Withdrawal Card, copied box for box."
      renderForm={(done, again) => <CardForm done={done} again={again} />} />
  );
}
