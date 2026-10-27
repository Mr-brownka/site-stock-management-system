import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/fx';
import { Ring } from '../components/Ring';
import { ChatMark, waNumber } from '../components/StockAlert';
import { fmt } from '../components/ui';
import { toast } from '../components/feedback';
import { api } from '../lib/api';
import { longDate, niceDate, weekdayName } from '../lib/dates';
import { signal } from '../lib/signals';
import { STEPS, useData } from '../lib/store';
import { delta, type AlertInfo, type Doc } from '../lib/types';
import { openItems } from './Dashboard';

const time = (d: Doc) => d.doc_time?.slice(0, 5) ?? new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
const TONE: Record<string, string> = { delivery: 'in', transfer_in: 'in', issue: 'out', transfer_out: 'out', return: 'back', correction: 'fix', opening: 'fix' };

/** Today's summary: the day hour by hour on the left; what came in, went out and came back, and each item's balance, on the right. */
export function Submitted() {
  const { day, realToday, docsToday, balances, submission, stepState, go, isLow, daysLeft, itemById, site, user, projectWeek } = useData();
  const [info, setInfo] = useState<AlertInfo | null>(null);
  useEffect(() => { api.alertInfo().then(setInfo).catch(() => setInfo(null)); }, []);
  const name = (id: number) => itemById.get(id)?.name ?? 'Item';
  const unit = (id: number) => itemById.get(id)?.unit ?? '';

  const docs = useMemo(() => docsToday.filter((d) => d.kind !== 'opening').sort((a, b) => time(a).localeCompare(time(b)) || a.created_at.localeCompare(b.created_at)), [docsToday]);
  const count = (k: string) => docs.filter((d) => STEPS.find((s) => s.key === k)!.kinds.includes(d.kind)).length;

  // Each item that moved: morning balance, what came in, what went out, balance now.
  const rows = useMemo(() => {
    const m = new Map<number, { inn: number; out: number }>();
    docs.forEach((d) => d.lines.forEach((l) => {
      const v = delta(l.kind, Number(l.qty)); const r = m.get(l.item_id) ?? { inn: 0, out: 0 };
      if (v > 0) r.inn += v; else r.out -= v; m.set(l.item_id, r);
    }));
    return balances.filter((b) => m.has(b.item_id)).map((b) => { const r = m.get(b.item_id)!; return { b, ...r, from: b.balance - r.inn + r.out, low: isLow(b) }; })
      .sort((x, y) => Number(y.low) - Number(x.low) || (y.inn + y.out) - (x.inn + x.out));
  }, [docs, balances, isLow]);

  const lines = (d: Doc) => { const ls = d.lines.slice(0, 3).map((l) => `${name(l.item_id)} ${fmt(Number(l.qty))}`); return ls.join(' · ') + (d.lines.length > 3 ? ` +${d.lines.length - 3} more` : ''); };
  const title = (d: Doc) => d.kind === 'issue' ? `Card ${d.ref_no ?? ''}` : d.kind === 'delivery' ? 'Delivery' : d.kind === 'return' ? 'Return' : d.kind === 'transfer_in' ? 'Transfer in' : d.kind === 'transfer_out' ? 'Transfer out' : 'Correction';
  const sub = (d: Doc) => [lines(d), d.kind === 'issue' ? [d.activity, d.gemba].filter(Boolean).join(' · ') : d.kind === 'return' ? (d.ref_no ? `on card ${d.ref_no}` : '') : d.party].filter(Boolean).join(' · ');

  const at = submission ? new Date(submission.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' }) : null;
  const wd = weekdayName(day);
  const done3 = STEPS.filter((s) => s.key !== 'deliveries' && stepState(s.key) !== 'todo').length;

  const message = () => {
    const L = [`*${site} · ${submission ? 'Day summary' : 'Today so far'}*`, `${longDate(day)}${projectWeek != null ? ` · Week ${projectWeek}` : ''}${at ? ` · submitted ${at}` : ''}`, '',
      `Came in: ${count('deliveries') || 'none'}${count('deliveries') ? ` deliver${count('deliveries') === 1 ? 'y' : 'ies'}` : ''}`,
      `Went out: ${count('issued') || 'none'}${count('issued') ? ` card${count('issued') === 1 ? '' : 's'}` : ''}`,
      `Came back: ${count('returns') || 'none'}${count('returns') ? ` return${count('returns') === 1 ? '' : 's'}` : ''}`,
      `Transfers: ${count('transfers') || 'none'}`];
    if (rows.length) { L.push('', '*What moved*'); rows.forEach((r) => L.push(`• ${r.b.name}: ${fmt(r.from)} → ${fmt(r.b.balance)} ${r.b.unit}${r.low ? ' ⚠' : ''}`)); }
    L.push('', `— ${user.name}`, '_Sent from Ostock_');
    return L.join('\n');
  };
  const send = () => {
    const phone = waNumber(info?.phone);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message())}`, '_blank', 'noopener');
    toast(phone ? `WhatsApp opened for ${info?.name || 'the Site manager'}` : 'WhatsApp opened · choose who to send it to');
  };

  return (
    <div className="page sumPage">
      <header className="sumHead enter">
        <div>
          <span className={`sumKick ${submission ? 'ok' : ''}`}>{submission ? (day === realToday ? 'Today’s summary' : `${wd}’s summary`) : 'So far · not submitted yet'}</span>
          <h1>{submission ? 'Balances are final' : `${wd} so far`}</h1>
        </div>
        <span className="abGrow" />
        <button className="btn ghost sm" onClick={() => window.print()}><Icon name="print" size={16} />Print</button>
        {submission
          ? <button className="sumSend" onClick={send}><ChatMark />Send to Site Manager</button>
          : <button className="btn accent sm" onClick={() => { signal('proc'); go('home'); }}>{done3 ? 'Continue' : 'Start'}<Icon name="arrow" size={16} /></button>}
      </header>

      <div className="sumGrid">
        <aside className="sumDay enter">
          <div className="sumDayHead">
            <Ring p={submission ? 1 : done3 / 3} size={72} stroke={9} label={submission ? '✓' : `${done3}/3`} tone={submission ? 'green' : 'amber'} dark />
            <span className="sdT">
              <small className={submission ? 'ok' : ''}>{submission ? `Submitted ${at}` : 'Not submitted yet'}</small>
              <b>{niceDate(day)}</b>
              <span>{projectWeek != null ? `Week ${projectWeek} · ` : ''}{submission ? `by ${user.name.split(' ')[0]}` : site}</span>
            </span>
          </div>
          <b className="sumDayT">The day, hour by hour</b>
          {!docs.length && <p className="sumNone">Nothing entered {submission ? 'that day' : 'yet'}.</p>}
          <ol className="sumTl">
            {docs.map((d) => (
              <li key={d.id} className={TONE[d.kind]}>
                <span className="mono">{time(d)}</span><i aria-hidden="true" />
                <span><b>{title(d)}{d.source === 'zoho' && <small> · from Zoho</small>}</b><span>{sub(d)}</span></span>
              </li>
            ))}
          </ol>
        </aside>

        <section className="sumMain">
          <div className="sumTiles">
            <div className="t-in"><span>Came in</span><b>{count('deliveries') || '–'}<small>{count('deliveries') === 1 ? 'delivery' : 'deliveries'}</small></b></div>
            <div className="t-out"><span>Went out</span><b>{count('issued') || '–'}<small>{count('issued') === 1 ? 'card' : 'cards'}</small></b></div>
            <div className="t-back"><span>Came back</span><b>{count('returns') || '–'}<small>{count('returns') === 1 ? 'return' : 'returns'}</small></b></div>
            <div className="t-ink"><span>Items moved</span><b>{rows.length}<small>of {balances.length}</small></b></div>
          </div>
          <div className="sumTable panel">
            <div className="sumTh"><span>Item</span><span>Morning</span><span>In</span><span>Out</span><span>Now</span></div>
            {!rows.length && <div className="pad muted">No stock moved {submission ? 'that day' : 'yet today'}.</div>}
            {rows.map((r) => {
              const dl = r.low ? daysLeft(r.b) : null;
              return (
                <button key={r.b.item_id} className={`sumTr ${r.low ? 'low' : ''}`} onClick={() => openItems(go, { tab: 'bal', item: r.b.item_id })}>
                  <span className="sumItem"><b>{r.b.name}</b> <small>{unit(r.b.item_id)}</small>{r.low && <em>{r.b.balance <= 0 ? 'Finished' : dl != null ? `${dl} day${dl === 1 ? '' : 's'} left` : 'Low'}</em>}</span>
                  <span className="mono mute">{fmt(r.from)}</span>
                  <span className="mono in">{r.inn ? `+${fmt(r.inn)}` : ''}</span>
                  <span className="mono out">{r.out ? `−${fmt(r.out)}` : ''}</span>
                  <span className="sumNow"><i><i style={{ width: `${Math.min(100, (Math.max(0, r.b.balance) / Math.max(r.from, r.b.balance, 1)) * 100)}%` }} /></i><b className="mono">{fmt(r.b.balance)}</b></span>
                </button>
              );
            })}
          </div>
          <button className="btn link" onClick={() => go('home')}>Back to the dashboard</button>
        </section>
      </div>
    </div>
  );
}
