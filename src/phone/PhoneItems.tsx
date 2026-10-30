import { useMemo, useState } from 'react';
import { Icon } from '../components/fx';
import { fmt } from '../components/ui';
import { canEdit } from '../lib/access';
import { weekStart } from '../lib/projectWeek';
import { useData } from '../lib/store';
import { delta, type Doc } from '../lib/types';
import { Chips, Pill, PSearch, PTop, shortDay, timeOf, useSub } from './PhoneUI';

type F = 'all' | 'low' | 'today';
const KIND: Record<string, string> = { delivery: 'Delivery', issue: 'Register', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction', opening: 'Stock take' };

/** All items on the phone: cards with the balance big; tapping one opens the item with its moves. */
export function PhoneItems() {
  const { balances, recent, docsToday, day, isLow, daysLeft, go, user } = useData();
  const [f, setF] = useState<F>(() => { try { const v = sessionStorage.getItem('ssms-pitems'); sessionStorage.removeItem('ssms-pitems'); return v === 'low' ? 'low' : 'all'; } catch { return 'all'; } });
  const [q, setQ] = useState('');
  const [more, setMore] = useState(60);
  const [openId, setOpen] = useSub();
  const docs = useMemo(() => { const m = new Map<string, Doc>(); [...recent, ...docsToday].forEach((d) => m.set(d.id, d)); return [...m.values()]; }, [recent, docsToday]);
  const from = weekStart(day);
  const week = useMemo(() => {
    const m = new Map<number, { inn: number; out: number; today: boolean }>();
    docs.filter((d) => d.doc_date >= from && d.doc_date <= day).forEach((d) => d.lines.forEach((l) => {
      const v = delta(l.kind, Number(l.qty)); const r = m.get(l.item_id) ?? { inn: 0, out: 0, today: false };
      if (v > 0) r.inn += v; else r.out -= v; if (d.doc_date === day) r.today = true; m.set(l.item_id, r);
    }));
    return m;
  }, [docs, from, day]);
  const nLow = balances.filter(isLow).length;
  const list = balances.filter((b) => (f === 'low' ? isLow(b) : f === 'today' ? week.get(b.item_id)?.today : true) && (!q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (f === 'low' ? (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9) : a.name.localeCompare(b.name)));
  const status = (b: (typeof balances)[number]) => {
    if (b.balance <= 0) return <Pill tone="red">Finished</Pill>;
    const d0 = daysLeft(b); const dl = d0 == null ? null : Math.max(0, Math.round(d0));
    if (isLow(b)) return <Pill tone="red">{dl != null ? `${dl} day${dl === 1 ? '' : 's'} left` : 'Low'}</Pill>;
    return dl != null && dl < 60 ? <Pill tone="grey">{dl} days left</Pill> : null;
  };

  const b = balances.find((x) => String(x.item_id) === openId);
  if (b) {
    const w = week.get(b.item_id) ?? { inn: 0, out: 0, today: false };
    const moves = docs.flatMap((d) => d.lines.filter((l) => l.item_id === b.item_id).map((l) => ({ d, l, v: delta(l.kind, Number(l.qty)) })))
      .sort((x, y) => y.d.doc_date.localeCompare(x.d.doc_date) || y.d.created_at.localeCompare(x.d.created_at));
    const todayMove = moves.filter((m) => m.d.doc_date === day).reduce((a, m) => a + m.v, 0);
    return (
      <div className="pPage pDetail">
        <PTop title={b.name} back={() => setOpen(null)} right={status(b)} />
        <section className="pDHead">
          <small className="pKick">Item · {b.unit}</small>
          <h2>{fmt(b.balance)} {b.unit} in store</h2>
          <dl className="pKv">
            <div><dt>This morning</dt><dd>{fmt(b.balance - todayMove)}</dd></div>
            <div><dt>In this week</dt><dd className="in">+{fmt(w.inn)}</dd></div>
            <div><dt>Out this week</dt><dd className="out">−{fmt(w.out)}</dd></div>
            {b.reorder_level != null && <div><dt>Order when below</dt><dd>{fmt(b.reorder_level)}</dd></div>}
          </dl>
        </section>
        <div className="pGh">Moves · newest first</div>
        <div className="pLines">
          {!moves.length && <div className="pEmpty">No moves in the last few weeks.</div>}
          {moves.slice(0, 40).map(({ d, l, v }) => (
            <div key={l.id} className="pLine"><span>{KIND[l.kind] ?? 'Entry'}{d.party ? ` · ${d.party}` : ''}<small>{shortDay(d.doc_date)} · {timeOf(d)}</small></span><b className={`mono ${v < 0 ? 'out' : l.kind === 'return' ? 'back' : 'in'}`}>{v < 0 ? '−' : '+'}{fmt(Math.abs(v))}</b><small>{b.unit}</small></div>
          ))}
        </div>
        {canEdit(user) && <footer className="pFoot"><button className="pBtn ghost" onClick={() => go('corrections')}><Icon name="fix" size={18} />Fix this balance</button></footer>}
      </div>
    );
  }

  return (
    <div className="pPage pList">
      <PTop title="All items" back="records" />
      <PSearch value={q} onChange={setQ} placeholder={`Search ${balances.length} items`} />
      <Chips value={f} onChange={(v) => { setF(v); setMore(60); }} items={[['all', 'All'], ['low', `Low · ${nLow}`], ['today', 'Moved today']]} />
      {!list.length && <div className="pEmpty">{f === 'low' ? 'Nothing is low. All good.' : f === 'today' ? 'Nothing moved today.' : 'No items match.'}</div>}
      <div className="pCards">
        {list.slice(0, more).map((x) => {
          const w = week.get(x.item_id);
          return (
            <button key={x.item_id} className={`pCard item ${isLow(x) ? 'low' : ''}`} onClick={() => setOpen(String(x.item_id))}>
              <span className="pCardMid"><b>{x.name}</b><b className="mono pBig">{fmt(x.balance)}</b></span>
              <span className="pCardTop"><small>{x.unit}</small>{status(x)}</span>
              {w && (w.inn || w.out) ? <span className="pCardChips">{w.inn ? <span>In {fmt(w.inn)} this week</span> : null}{w.out ? <span>Out {fmt(w.out)}</span> : null}</span> : null}
            </button>
          );
        })}
        {list.length > more && <button className="pMore" onClick={() => setMore((m) => m + 60)}>Show more · {list.length - more} left</button>}
      </div>
    </div>
  );
}
