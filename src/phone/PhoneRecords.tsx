import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/fx';
import { useNewZohoDeliveries } from '../lib/newDeliveries';
import { fmt } from '../components/ui';
import { useZohoDeliveries, ZohoOpen } from '../components/Zoho';
import { useAddEntry } from '../components/AddEntry';
import { canEdit, canSee } from '../lib/access';
import { api } from '../lib/api';
import { addDays, niceDate } from '../lib/dates';
import { openFixFor } from '../lib/fixLink';
import { weekStart } from '../lib/projectWeek';
import { REPORTS } from '../lib/reports';
import { useData, type Screen } from '../lib/store';
import type { Doc } from '../lib/types';
import type { RecKey } from '../screens/Records';
import { Chips, FlipNum, Pill, PSearch, PTop, shortDay, Skel, timeOf, useSub } from './PhoneUI';

const LAST = 'ssms-rec-last';
const SECTIONS: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'rec-deliveries', label: 'Deliveries', icon: 'truck' },
  { screen: 'rec-transfers', label: 'Project transfers', icon: 'swap' },
  { screen: 'rec-issued', label: 'Issued items', icon: 'issue' },
  { screen: 'rec-returns', label: 'Returned items', icon: 'undo' },
  { screen: 'dashboard', label: 'All items', icon: 'box' },
  { screen: 'reports', label: 'Reports', icon: 'bars' },
];

/** Records on the phone (design C): a green "this week" card, then six coloured cards. The one last opened stays green. */
const TONE: Record<string, string> = { 'rec-deliveries': 'green', 'rec-transfers': 'purple', 'rec-issued': 'orange', 'rec-returns': 'blue', dashboard: 'ink', reports: 'amber' };
export function PhoneRecordsHub() {
  const { go, recent, docsToday, day, balances, site, user } = useData();
  const newDel = useNewZohoDeliveries();
  const [last] = useState(() => { try { return sessionStorage.getItem(LAST); } catch { return null; } });
  const from = weekStart(day);
  const all = useMemo(() => { const m = new Map<string, Doc>(); [...recent, ...docsToday].forEach((d) => m.set(d.id, d)); return [...m.values()]; }, [recent, docsToday]);
  const wk = all.filter((d) => d.doc_date >= from && d.doc_date <= day);
  const week = (kinds: Doc['kind'][]) => wk.filter((d) => kinds.includes(d.kind)).length;
  const lines = (kinds: Doc['kind'][]) => wk.filter((d) => kinds.includes(d.kind)).reduce((a, d) => a + d.lines.length, 0);
  const sub: Record<string, string> = {
    'rec-deliveries': `${week(['delivery'])} this week`,
    'rec-transfers': `${week(['transfer_in', 'transfer_out'])} this week`,
    'rec-issued': docsToday.some((d) => d.kind === 'issue') ? 'Today’s register started' : 'None today yet',
    'rec-returns': `${week(['return'])} this week`,
    dashboard: `${balances.filter((b) => b.balance > 0).length} in store`,
    reports: `${REPORTS.length} reports`,
  };
  const open = (s: Screen) => { try { sessionStorage.setItem(LAST, s); } catch { /* ignore */ } go(s); };
  return (
    <div className="pPage pGrey pRecHub">
      <header className="pHello"><span><small>{site || 'Store'} · {shortDay(day)}</small><b className="big">Records</b></span></header>
      <section className="pWeekCard">
        <small>This week at {site || 'the store'}</small>
        <div>
          <span className="in"><b className="mono"><FlipNum value={lines(['delivery', 'transfer_in'])} /></b><small>items came in</small></span>
          <span className="out"><b className="mono"><FlipNum value={lines(['issue', 'transfer_out'])} /></b><small>went out</small></span>
          <span className="back"><b className="mono"><FlipNum value={lines(['return'])} /></b><small>came back</small></span>
        </div>
      </section>
      <div className="pHubGrid pHubC">
        {SECTIONS.filter((s) => canSee(user, s.screen)).map((s, i) => (
          <button key={s.screen} className={`pHubRow ${TONE[s.screen]} ${last === s.screen ? 'on' : ''}`} style={{ animationDelay: `${i * 45}ms` }} onClick={() => open(s.screen)}>
            <span className="pHubIc"><Icon name={s.icon} size={20} /></span>
            <span className="pHubT"><b>{s.label}</b><small>{sub[s.screen]}</small></span>
            {s.screen === 'rec-deliveries' && newDel > 0 && <i className="pNewDot" aria-label={`${newDel} new from Zoho`} />}
          </button>
        ))}
      </div>
    </div>
  );
}

type Period = 'week' | 'month' | 'all';
const TITLE: Record<RecKey, string> = { deliveries: 'Deliveries', issued: 'Issued items', returns: 'Returned items', transfers: 'Project transfers' };
const KINDS: Record<RecKey, Doc['kind'][]> = { deliveries: ['delivery'], issued: ['issue'], returns: ['return'], transfers: ['transfer_in', 'transfer_out'] };
const PREFIX: Record<RecKey, string> = { deliveries: 'DLV', issued: 'ISS', returns: 'RET', transfers: 'TRF' };

/** One section's records as cards; tapping one opens its own page. */
export function PhoneRecList({ recKey: key }: { recKey: RecKey }) {
  const { day, itemById, go, user, submission } = useData();
  const [all, setAll] = useState<Doc[] | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [q, setQ] = useState('');
  const [find, setFind] = useState(false);
  const [more, setMore] = useState(40);
  const [openId, setOpen] = useSub();
  const { add, modal } = useAddEntry();
  const zohoOnly = useZohoDeliveries();
  useEffect(() => { api.documents('2000-01-01', day).then(setAll).catch(() => setAll([])); }, [day]);
  const name = (id: number) => itemById.get(id)?.name ?? 'Item';
  const unit = (id: number) => itemById.get(id)?.unit ?? '';

  const rows = useMemo(() => {
    if (!all) return [];
    const mine = all.filter((d) => KINDS[key].includes(d.kind)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return mine.map((d, i) => ({ d, sys: `${PREFIX[key]}-${String(d.sys_no ?? i + 1).padStart(4, '0')}` }))
      .sort((a, b) => b.d.doc_date.localeCompare(a.d.doc_date) || b.d.created_at.localeCompare(a.d.created_at));
  }, [all, key]);
  const from = period === 'week' ? weekStart(day) : period === 'month' ? day.slice(0, 8) + '01' : '2000-01-01';
  const shown = rows.filter(({ d, sys }) => {
    if (d.doc_date < from) return false;
    const s = q.trim().toLowerCase();
    return !s || [sys, d.ref_no, d.party, d.zoho_grn, d.gemba, d.activity, ...d.lines.map((l) => name(l.item_id))].some((x) => (x ?? '').toLowerCase().includes(s));
  });

  const title = (d: Doc) => key === 'deliveries' ? d.party || 'Delivery'
    : key === 'transfers' ? `${d.kind === 'transfer_out' ? 'Sent to' : 'Received from'} ${d.party || '…'}`
      : key === 'issued' ? (d.doc_date === day ? 'Today’s register' : 'Issuance register')
        : `Returned${d.gemba ? ` from ${d.gemba}` : d.lines[0]?.subphase ? ` from ${d.lines[0].subphase}` : ''}`;
  const ref = (d: Doc, sys: string) => key === 'deliveries' ? d.zoho_grn || d.ref_no || sys : key === 'issued' ? `MIR · ${shortDay(d.doc_date).split(' ').slice(1).join(' ')}` : d.ref_no || sys;
  const pill = (d: Doc) => key === 'deliveries' ? (d.source === 'zoho' ? <Pill tone="blue">Zoho</Pill> : <Pill tone="grey">Hand-entered</Pill>)
    : key === 'transfers' ? (d.kind === 'transfer_out' ? <Pill tone="amb">Sent out</Pill> : <Pill tone="ok">Received</Pill>)
      : key === 'issued' ? (d.doc_date === day && !submission ? <Pill tone="amb">Not submitted</Pill> : <Pill tone="ok">{d.lines.length} item{d.lines.length === 1 ? '' : 's'}</Pill>)
        : d.ref_no && d.ref_no !== 'No card' ? <Pill tone="grey">Card {d.ref_no}</Pill> : null;
  const when = (d: Doc) => { const t = d.doc_date === day ? 'Today' : d.doc_date === addDays(day, -1) ? 'Yesterday' : shortDay(d.doc_date); return `${t} · ${timeOf(d)}`; };

  const open = rows.find((r) => r.d.id === openId);
  if (open) {
    const d = open.d;
    const tone = key === 'deliveries' ? 'in' : key === 'returns' ? 'back' : key === 'issued' || d.kind === 'transfer_out' ? 'out' : 'in';
    const sign = tone === 'out' ? '−' : '+';
    const kv: [string, string | null | undefined][] = [
      ['Date', `${niceDate(d.doc_date)} · ${timeOf(d)}`],
      ...(key === 'deliveries' ? [['Delivery note', d.ref_no], ['Purchase order', d.zoho_po], ['GRN', d.zoho_grn], ['Vehicle / driver', d.vehicle]] as [string, string | null | undefined][] : []),
      ...(key === 'transfers' ? [[d.kind === 'transfer_out' ? 'Sent to' : 'Received from', d.party], ['Transfer note', d.ref_no], ['Authorised by', d.authorised_by], ['Vehicle', d.vehicle]] as [string, string | null | undefined][] : []),
      ...(key === 'issued' ? [['Store keeper', d.authorised_by], ['Activity', d.activity], ['Gemba', d.gemba]] as [string, string | null | undefined][] : []),
      ...(key === 'returns' ? [['Card', d.ref_no], ['Gemba', d.gemba], ['Returned by', d.party]] as [string, string | null | undefined][] : []),
      ['Ref', open.sys],
    ];
    const zoho = d.zoho_receive_id || d.zoho_po || d.zoho_grn;
    const todayReg = key === 'issued' && d.doc_date === day && !submission;
    return (
      <div className="pPage pDetail">
        {modal}
        <PTop title={ref(d, open.sys)} back={() => setOpen(null)} right={pill(d)} />
        <section className="pDHead">
          <small className="pKick">{({ deliveries: 'Delivery', issued: 'Issuance register', returns: 'Return', transfers: 'Transfer' } as Record<RecKey, string>)[key]} · {shortDay(d.doc_date)}</small>
          <h2>{title(d)}</h2>
          <dl className="pKv">{kv.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
        <div className="pGh">Items · {d.lines.length}</div>
        <div className="pLines">
          {d.lines.map((l) => <div key={l.id} className="pLine"><span>{name(l.item_id)}{l.subphase && l.subphase !== d.gemba ? <small>{l.subphase}</small> : null}</span><b className={`mono ${tone}`}>{key === 'issued' ? '' : sign}{fmt(Number(l.qty))}</b><small>{unit(l.item_id)}</small></div>)}
        </div>
        <footer className="pFoot">
          {zoho ? <ZohoOpen className="pBtn ghost" zref={{ receive_id: d.zoho_receive_id, grn: d.zoho_grn, po: d.zoho_po }} />
            : todayReg && canEdit(user) ? <button className="pBtn" onClick={() => add('issued')}><Icon name="plus" size={18} />Add to it</button>
              : canEdit(user) ? <button className="pBtn ghost" onClick={() => openFixFor(go, d)}><Icon name="fix" size={18} />Fix an error</button> : null}
        </footer>
      </div>
    );
  }

  return (
    <div className="pPage pList">
      {modal}
      <PTop title={TITLE[key]} back="records" right={<>
        <button className="pIconBtn" onClick={() => { setFind((v) => !v); if (find) setQ(''); }} aria-label="Search" aria-pressed={find}><Icon name={find ? 'close' : 'search'} size={19} /></button>
        {canEdit(user) && !(key === 'deliveries' && zohoOnly) && <button className="pAddBtn" onClick={() => add(key)}><Icon name="plus" size={18} />Add</button>}
      </>} />
      {find && <PSearch value={q} onChange={setQ} placeholder={`Search ${TITLE[key].toLowerCase()}`} />}
      <Chips value={period} onChange={(p) => { setPeriod(p); setMore(40); }} items={[['week', 'This week'], ['month', 'This month'], ['all', 'All']]} />
      {all === null && <Skel rows={5} card />}
      {all && !shown.length && <div className="pEmpty">Nothing {period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'yet'}{q ? ' matching your search' : ''}.{period !== 'all' && <button className="pLink" onClick={() => setPeriod('all')}>See all</button>}</div>}
      <div className="pCards">
        {shown.slice(0, more).map(({ d, sys }) => {
          const ls = d.lines.slice(0, 2);
          return (
            <button key={d.id} className={`pCard ${Date.now() - Date.parse(d.created_at) < 180_000 ? 'fresh' : ''}`} onClick={() => setOpen(d.id)}>
              <span className="pCardTop"><b className="mono pRef">{ref(d, sys)}</b><small>{when(d)}</small></span>
              <span className="pCardMid"><b>{title(d)}</b>{pill(d)}</span>
              <span className="pCardChips">{ls.map((l) => <span key={l.id}>{name(l.item_id)} {fmt(Number(l.qty))}</span>)}{d.lines.length > 2 && <span>+{d.lines.length - 2}</span>}</span>
            </button>
          );
        })}
        {shown.length > more && <button className="pMore" onClick={() => setMore((m) => m + 40)}>Show more · {shown.length - more} left</button>}
      </div>
    </div>
  );
}
