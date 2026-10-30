import { useCallback, useEffect, useState } from 'react';
import { toast } from '../components/feedback';
import { fmt } from '../components/ui';
import { due, OrderView, RemoveSheet, useIncoming } from '../components/Incoming';
import { ZohoBooksMark } from '../components/Zoho';
import { canEdit } from '../lib/access';
import { api } from '../lib/api';
import { niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { IncomingDismissed, IncomingOrder } from '../lib/types';
import { Chips, PTop, useSub } from './PhoneUI';

const addDay = (d: string, n: number) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** Incoming deliveries on the phone: this week and pending only. */
export function PhoneIncoming() {
  const { data, busy, refresh } = useIncoming();
  const { user, projectWeek } = useData();
  const editable = canEdit(user);
  const [tab, setTab] = useState<'this' | 'part'>('this');
  const [openId, setOpen] = useSub();
  const [removing, setRemoving] = useState<IncomingOrder | null>(null);
  const [gone, setGone] = useState<IncomingDismissed[]>([]);
  const loadGone = useCallback(() => api.dismissedIncoming().then(setGone).catch(() => undefined), []);
  useEffect(() => { loadGone(); }, [loadGone]);
  const today = data?.today ?? new Date().toISOString().slice(0, 10);
  const goneIds = new Set(gone.map((g) => g.po_id));
  const part = (data?.part ?? []).filter((o) => !goneIds.has(o.id) && (o.late || !o.firstIn || o.firstIn >= addDay(today, -13)));
  const week = data?.thisWeek ?? [];
  const remove = async (o: IncomingOrder, reason: string) => {
    await api.dismissIncoming({ po_id: o.id, po: o.po, vendor: o.vendor, reason });
    setRemoving(null); setOpen(null); await loadGone();
    toast(`${o.po} removed from incoming`, 'ok', { label: 'Undo', run: () => { api.restoreIncoming(o.id).then(loadGone).catch(() => undefined); } });
  };
  const fromOf = (o: IncomingOrder) => {
    const d = o.expected ?? o.firstIn; if (!d) return '';
    const mon = (x: string) => { const t = new Date(x + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.getTime(); };
    const back = data?.week ? Math.round((mon(data.week.from) - mon(d)) / (7 * 864e5)) : null;
    return `From ${projectWeek != null && back != null ? `Wk ${projectWeek - back} · ` : ''}${niceDate(d).split(' ').slice(0, 3).join(' ')}`;
  };
  const sel = [...week, ...part].find((o) => o.id === openId);
  const zohoBtn = <button className={`pIconBtn ${busy ? 'busy' : ''}`} onClick={refresh} disabled={busy} aria-label="Refresh from Zoho"><ZohoBooksMark size={20} /></button>;

  if (sel) {
    const isPart = part.some((o) => o.id === sel.id);
    return (
      <div className="pPage pDetail pOrder">
        <PTop title={sel.po} back={() => setOpen(null)} />
        <div className="pOrderBody"><OrderView o={sel} onClose={() => setOpen(null)} onNot={isPart && editable ? () => setRemoving(sel) : undefined} /></div>
        {removing && <RemoveSheet o={removing} onClose={() => setRemoving(null)} onDone={(r) => remove(removing, r)} />}
      </div>
    );
  }
  if (data && !data.connected) return <div className="pPage"><PTop title="Incoming deliveries" back="home" /><div className="pEmpty">Zoho Books isn’t connected for this site yet.</div></div>;

  // This week, grouped by the day each is expected: Yesterday · Today · Tomorrow · Monday…
  const groups: { label: string; today: boolean; list: IncomingOrder[] }[] = [];
  if (tab === 'this') {
    [...week].sort((a, b) => (a.expected ?? '9').localeCompare(b.expected ?? '9')).forEach((o) => {
      const l = due(o, today).t; const g = groups.find((x) => x.label === l);
      if (g) g.list.push(o); else groups.push({ label: l, today: o.expected === today, list: [o] });
    });
  } else groups.push({ label: '', today: false, list: part });
  return (
    <div className="pPage pList">
      <PTop title="Incoming deliveries" back="home" right={zohoBtn} />
      <Chips value={tab} onChange={setTab} items={[['this', `This week · ${week.length}`], ['part', `Pending · ${part.length}`]]} />
      {data?.error && <div className="pNote">Zoho didn’t answer just now. Showing the last check.</div>}
      {!data && busy && <div className="pEmpty">Checking Zoho…</div>}
      {data && !groups.some((g) => g.list.length) && <div className="pEmpty">{tab === 'this' ? 'Nothing expected this week.' : 'Nothing pending.'}</div>}
      {groups.map((g) => (
        <section key={g.label || 'p'}>
          {g.label && <div className={`pGh ${g.today ? 'now' : ''}`}>{g.label}</div>}
          <div className="pRows">
            {g.list.map((o) => {
              const first = o.lines[0]; const more = o.lines.length - 1;
              return (
                <button key={o.id} className="pRow" onClick={() => setOpen(o.id)}>
                  <span className="pRowT"><b>{o.vendor ?? 'Vendor'}</b><small>{first ? `${first.name} ${fmt(first.ordered - first.received)}${first.unit ? ` ${first.unit}` : ''}` : ''}{more > 0 ? ` · +${more} more` : ''}</small>
                    {tab === 'part' && <small className={o.late ? 'late' : ''}>{fromOf(o)}</small>}</span>
                  <small className="mono pRowR">{o.po}</small>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className="pHint">{tab === 'this' ? 'Not delivered by Sunday → moves to Pending.' : 'Late, or part of it still owed.'}</div>
    </div>
  );
}
