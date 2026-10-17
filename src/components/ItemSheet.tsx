import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryOf } from '../lib/categories';
import { addDays, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import { delta, type Balance } from '../lib/types';
import { Icon, Num, PulseDot } from './fx';
import { fmt } from './ui';

export interface Use { issued: number; returned: number; used: number; bySub: Map<string, number> }

const KIND_LABEL: Record<string, string> = { opening: 'Opening count', delivery: 'Delivered', issue: 'Issued', return: 'Returned', transfer_in: 'Received', transfer_out: 'Sent', correction: 'Correction' };

/** Balance at the end of each of the last 28 days, oldest first. */
function history(itemId: number, balance: number, day: string, docs: ReturnType<typeof useData>['recent']): number[] {
  const byDay = new Map<string, number>();
  for (const d of docs) for (const l of d.lines) if (l.item_id === itemId) byDay.set(d.doc_date, (byDay.get(d.doc_date) ?? 0) + delta(l.kind, l.qty));
  const out: number[] = [];
  let b = balance;
  for (let i = 0; i < 28; i++) { const dt = addDays(day, -i); out.unshift(b); b -= byDay.get(dt) ?? 0; }
  return out;
}

function Spark({ data, low }: { data: number[]; low: boolean }) {
  const w = 300, h = 64, max = Math.max(...data, 1), min = Math.min(...data, 0);
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - 4 - ((v - min) / (max - min || 1)) * (h - 10);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const color = low ? 'var(--error)' : 'var(--ok)';
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Balance over the last 4 weeks">
      <defs><linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#sparkFill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" className="sparkLine" pathLength={1} />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="4.5" fill={color} />
    </svg>
  );
}

export function ItemSheet({ b, mode, use, rangeLabel, onClose, onSaveReorder }: {
  b: Balance; mode: 'cons' | 'bal'; use?: Use; rangeLabel: string; onClose: () => void; onSaveReorder: (v: number | null) => Promise<void>;
}) {
  const { day, recent, isLow, daysLeft } = useData();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(b.reorder_level == null ? '' : String(b.reorder_level));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setDraft(b.reorder_level == null ? '' : String(b.reorder_level)); }, [b.item_id, b.reorder_level]);
  useEffect(() => {
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    document.body.classList.add('noScroll');
    return () => { document.removeEventListener('keydown', k); document.body.classList.remove('noScroll'); };
  }, [onClose]);

  const low = isLow(b), out = b.balance <= 0;
  const days = daysLeft(b);
  const hist = useMemo(() => history(b.item_id, b.balance, day, recent), [b.item_id, b.balance, day, recent]);
  const moves = useMemo(() => recent.flatMap((d) => d.lines.filter((l) => l.item_id === b.item_id).map((l) => ({ d, l })))
    .sort((x, y) => y.d.doc_date.localeCompare(x.d.doc_date) || y.l.id - x.l.id).slice(0, 8), [recent, b.item_id]);
  const subs = use ? [...use.bySub].filter(([, v]) => v > 0).sort((a, c) => c[1] - a[1]) : [];
  const subMax = Math.max(1, ...subs.map(([, v]) => v));
  const status = out ? { t: 'Out of stock', c: 'out' } : low ? { t: 'Low stock', c: 'low' } : { t: 'In stock', c: 'ok' };
  const gauge = days == null ? null : Math.min(1, days / 30);
  const step = (n: number) => setDraft((v) => String(Math.max(0, (Number(v) || 0) + n)));
  const save = async () => {
    const v = draft.trim() === '' ? null : Number(draft);
    if (v != null && !(v >= 0)) return;
    await onSaveReorder(v); setSaved(true); setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="sheetBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet" data-status={status.c} role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <div className="sheetHandle" aria-hidden />
        <header className="sheetHead">
          <div>
            <span className="chip">{categoryOf(b.name)}</span>
            <h3 id="sheetTitle">{b.name}</h3>
          </div>
          <button ref={closeRef} className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>

        {mode === 'bal' ? (
          <>
            <div className="sheetHero">
              <div>
                <div className="label">In store now</div>
                <div className="heroNum"><Num value={b.balance} /><small>{b.unit}</small></div>
              </div>
              <span className={`statusPill ${status.c}`}>{status.c !== 'ok' && <PulseDot />}{status.t}</span>
            </div>
            <div className="sparkWrap">
              <Spark data={hist} low={low} />
              <div className="between small muted"><span>{niceDate(addDays(day, -27))}</span><span>Last 4 weeks</span><span>Today</span></div>
            </div>
            <div className="tiles">
              <div className="tile">
                <span className="label">Lasts about</span>
                <b>{days == null ? '–' : days > 30 ? '30+ days' : `${days} day${days === 1 ? '' : 's'}`}</b>
                {gauge != null && <span className="gauge"><i className={days! <= 5 ? 'red' : days! <= 10 ? 'gold' : ''} style={{ width: `${Math.max(4, gauge * 100)}%` }} /></span>}
                <span className="small muted">{days == null ? 'Not used in the last 2 weeks' : 'At the last 2 weeks’ rate'}</span>
              </div>
              <div className="tile">
                <span className="label">Reorder level</span>
                <div className="stepper">
                  <button onClick={() => step(-1)} aria-label="Lower">−</button>
                  <input inputMode="decimal" value={draft} placeholder="Not set" aria-label="Reorder level" onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))} />
                  <button onClick={() => step(1)} aria-label="Higher">+</button>
                </div>
                <button className="btn link" onClick={save} disabled={draft === (b.reorder_level == null ? '' : String(b.reorder_level))}>{saved ? '✓ Saved' : 'Save level'}</button>
              </div>
            </div>
            {low && <div className="note err sheetNote"><PulseDot />{out ? 'None left in the store.' : 'Running low.'} Tell the site manager so it can be ordered.</div>}
            <div className="stack" style={{ gap: 0 }}>
              <div className="label" style={{ marginBottom: 6 }}>Recent movements</div>
              <ol className="timeline">
                {moves.map(({ d, l }, i) => {
                  const v = delta(l.kind, l.qty);
                  return (
                    <li key={l.id} style={{ animationDelay: `${0.05 * i}s` }} className={v < 0 ? 'minus' : 'plus'}>
                      <span className="tlDot" />
                      <span className="tlText"><span><b>{KIND_LABEL[d.kind] ?? d.kind}</b>{d.kind === 'issue' || d.kind === 'return' ? (d.ref_no ? ` · card ${d.ref_no}` : '') : d.party ? ` · ${d.party}` : ''}</span><span className="small muted">{niceDate(d.doc_date)}</span></span>
                      <span className="tlQty">{v < 0 ? '−' : '+'}{fmt(Math.abs(v))}</span>
                    </li>
                  );
                })}
                {!moves.length && <li className="muted small">No movements in the last 4 weeks.</li>}
              </ol>
            </div>
          </>
        ) : (
          <>
            <div className="sheetHero">
              <div>
                <div className="label">Used · {rangeLabel}</div>
                <div className="heroNum"><Num value={use?.used ?? 0} /><small>{b.unit}</small></div>
              </div>
              <span className={`statusPill ${status.c}`}>{status.c !== 'ok' && <PulseDot />}{fmt(b.balance)} left</span>
            </div>
            <div className="tiles three">
              <div className="tile"><span className="label">Issued</span><b><Num value={use?.issued ?? 0} /></b></div>
              <div className="tile"><span className="label">Returned</span><b><Num value={use?.returned ?? 0} /></b></div>
              <div className="tile"><span className="label">Lasts about</span><b>{days == null ? '–' : days > 30 ? '30+ d' : `${days} d`}</b></div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="label">By subphase</div>
              {subs.length ? subs.map(([s, v], i) => (
                <div className="subBar" key={s}>
                  <span className="subName">{s}</span>
                  <span className="subTrack"><i style={{ width: `${(v / subMax) * 100}%`, animationDelay: `${0.06 * i}s` }} /></span>
                  <span className="mono">{fmt(v)}</span>
                </div>
              )) : <div className="muted small">Not used in this period.</div>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
