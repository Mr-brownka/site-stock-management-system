import { useEffect, useState } from 'react';
import { StepShell } from '../components/StepShell';
import { checkLines, enterNext, LineEditor, newLine, Suggest, type LineDraft } from '../components/ui';
import { api } from '../lib/api';
import { addDays, nowTime } from '../lib/dates';
import { useData } from '../lib/store';
import { SUBPHASES } from '../lib/types';

function weekNo(d: string) {
  const x = new Date(`${d}T00:00:00Z`);
  const start = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
}

function CardForm({ done }: { done: () => void }) {
  const { day, user, balanceOf, docsToday } = useData();
  const [known, setKnown] = useState<Map<string, string>>(new Map());
  const [acts, setActs] = useState<string[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [sups, setSups] = useState<string[]>([]);
  const [cardNo, setCardNo] = useState('');
  const [time, setTime] = useState(nowTime());
  const [activity, setActivity] = useState('');
  const [gemba, setGemba] = useState('');
  const [to, setTo] = useState('');
  const [sup, setSup] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    api.remembered('activity').then(setActs);
    api.remembered('issued_to').then(setPeople);
    api.remembered('supervisor').then(setSups);
    api.documents(addDays(day, -180), day).then((ds) => setKnown(new Map(ds.filter((d) => d.kind === 'issue' && d.ref_no).map((d) => [d.ref_no!.trim(), d.doc_date]))));
  }, [day, docsToday.length]);

  const dupe = cardNo.trim() ? known.get(cardNo.trim()) : undefined;
  const setCardGemba = (g: string) => {
    setLines(lines.map((l) => (!l.subphase || l.subphase === gemba ? { ...l, subphase: g } : l)));
    setGemba(g);
  };

  const save = async () => {
    const problem = !cardNo.trim() ? 'Enter the card number (red number on the card).' : dupe ? `Card ${cardNo} was already entered on ${dupe}.`
      : !activity.trim() ? 'Enter the activity.' : !gemba ? 'Choose the gemba (floor).' : !to.trim() ? 'Enter who it was issued to.'
      : checkLines(lines, { subphase: true, stock: balanceOf }) ?? (!sup.trim() ? 'Enter the SM / supervisor.' : null);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try {
      await api.saveDocument({ kind: 'issue', doc_date: day, doc_time: time || null, ref_no: cardNo.trim(), party: to.trim(), activity: activity.trim(), gemba, supervisor: sup.trim() },
        lines.filter((l) => l.item).map((l) => ({ item_id: l.item!.id, qty: Number(l.qty), subphase: l.subphase || gemba })));
      setStamped(true);
      setTimeout(done, 900);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="stack enter">
      <div className="paperCard">
        <div className="cardTitle">Material Withdrawal Card</div>
        {stamped && <div className="stampMark">ENTERED</div>}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1 }}><span>Card no.</span>
            <input data-nav className={`input cardNo ${!cardNo ? 'next' : ''} ${dupe ? 'bad' : ''}`} inputMode="numeric" value={cardNo} autoFocus
              onChange={(e) => setCardNo(e.target.value.replace(/[^0-9A-Za-z-]/g, ''))} onKeyDown={enterNext} style={{ color: 'var(--error)', fontFamily: 'var(--mono)', fontSize: 22 }} />
          </label>
          <div className="field" style={{ width: 70 }}><span>Week</span><div className="mono" style={{ minHeight: 50, display: 'flex', alignItems: 'center' }}>{weekNo(day)}</div></div>
          <label className="field" style={{ width: 132 }}><span>Time</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        {dupe && <div className="hint bad">Card {cardNo} was already entered on {dupe}. Check the number.</div>}
        <Suggest label="Activity" value={activity} onChange={setActivity} options={acts} placeholder="e.g. Plaster" glow={!!cardNo && !activity} />
        <label className="field"><span>Gemba (floor)</span>
          <select data-nav className={`select input ${activity && !gemba ? 'next' : ''}`} value={gemba} onChange={(e) => setCardGemba(e.target.value)} onKeyDown={enterNext}>
            <option value="">Choose…</option>{SUBPHASES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <Suggest label="Issued to" value={to} onChange={setTo} options={people} placeholder="Name on the card" glow={!!gemba && !to} />
      </div>
      <div className="label">Items on the card</div>
      <LineEditor lines={lines} setLines={setLines} withSubphase stockCheck subphaseLabel="Gemba for this item" />
      <div className="paperCard">
        <Suggest label="SM / Supervisor" value={sup} onChange={setSup} options={sups} glow={!!lines[0]?.qty && !sup} />
        <div className="field"><span>Store keeper</span><div style={{ minHeight: 40, display: 'flex', alignItems: 'center', fontWeight: 600 }}>{user.name}</div></div>
      </div>
      {err && <div className="note err" role="alert">{err}</div>}
      <button data-nav className="btn accent" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save card'}</button>
    </div>
  );
}

export function Issued() {
  return (
    <StepShell step="issued" question="Were materials issued to production today?" hint="One entry per Material Withdrawal Card. Cards can also be entered during the day."
      another="Was there another card?" formTitle="New withdrawal card" docTone={() => 'out'}
      renderForm={(done) => <CardForm done={done} />}
      docTitle={(d) => `Card ${d.ref_no} · ${d.activity}, ${d.gemba} · ${d.party}`} />
  );
}
