import { ComexLogo, SiteLogo } from '../components/Brand';
import { Icon } from '../components/fx';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate, today, weekday } from '../lib/dates';
import type { AlertContact, Balance, ZohoConnection, ZohoItemMatch, ZohoLogRow, ZohoPending, ZohoRun, CorrectionRequest, Item, Profile, Role, SiteDoc, SiteInfo, Structure, User } from '../lib/types';
import { ask, toast } from '../components/feedback';
import { StartTraining } from '../components/Training';
import { TRAINING_DAYS } from '../lib/trainingPlan';
import { describeStructure, subphasesFor } from '../lib/structure';

type Sec = 'overview' | 'approvals' | 'sites' | 'people' | 'items' | 'zoho' | 'activity';
type SiteTab = 'overview' | 'list' | 'reorder' | 'building' | 'manager' | 'zoho';
const ROLE_LABEL: Record<Role, string> = { store: 'Store', assistant: 'Assistant', admin: 'Admin' };
const KIND_LABEL: Record<string, string> = { opening: 'Opening count', delivery: 'Delivery', issue: 'Card', return: 'Return', transfer_in: 'Transfer in', transfer_out: 'Transfer out', correction: 'Correction' };
const KIND_DOT: Record<string, string> = { opening: '#1B2120', delivery: '#1F7A4D', issue: '#B54708', return: '#2E5AAC', transfer_in: '#6B46C1', transfer_out: '#6B46C1', correction: '#8A5000' };
const PREFIX: Record<string, string> = { delivery: 'DLV', issue: 'ISS', return: 'RET', transfer_in: 'TRF', transfer_out: 'TRF' };
const AV = ['#2C3533', '#2E5AAC', '#1F7A4D', '#B54708', '#6B46C1', '#8A5000'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(iso));
const norm = (n: string) => n.toLowerCase().replace(/["'’]/g, '').replace(/[^a-z0-9]+/g, '').replace(/s$/, '');
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avColor = (s: string) => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
function ago(iso: string | null) {
  if (!iso) return '—';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24 && dayOf(iso) === dayOf(new Date().toISOString())) return `${Math.round(m / 60)} h ago`;
  if (dayOf(iso) === addDays(today(), -1)) return 'yesterday';
  return niceDate(dayOf(iso));
}
/** wa.me wants the number in international form, digits only (07… → 2547…). */
const waNumber = (p: string) => { const d = p.replace(/\D/g, ''); return d.startsWith('0') ? `254${d.slice(1)}` : d; };

interface Data {
  profiles: Profile[]; sites: SiteInfo[]; corr: CorrectionRequest[]; balances: Balance[];
  subs: { site_id: string; submitted_at: string }[]; docs: SiteDoc[]; items: Item[];
  conns: ZohoConnection[]; zitems: ZohoItemMatch[]; pending: ZohoPending[]; zlog: ZohoLogRow[]; zruns: ZohoRun[]; projects: Record<string, string | null>; contacts: Record<string, AlertContact>;
}
type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;
interface Nav { sec: Sec; site?: string | null; tab?: SiteTab; sel?: string | null }

export function Admin({ user, onExit, onSignOut }: { user: User; onExit: () => void; onSignOut: () => void }) {
  const [nav, setNav] = useState<Nav>({ sec: 'overview' });
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [menu, setMenu] = useState(false);
  /** Phones: the admin menu slides in from the left. */
  const [drawer, setDrawer] = useState(false);
  const day = today();

  const load = useCallback(async () => {
    try {
      const soft = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
      const [profiles, sites, corr, balances, subs, docs, items, conns, zitems, pending, projects, contacts, zlog, zruns] = await Promise.all([
        api.admin.profiles(), api.admin.sites(), api.admin.corrections(), api.admin.balances(), api.admin.submissions(day), api.admin.documents(addDays(day, -13), day), api.items(),
        soft(api.admin.zohoConnections(), []), soft(api.admin.zohoItems(), []), soft(api.admin.zohoPending(), []), soft(api.admin.zohoProjects(), {}), soft(api.admin.alertContacts(), {}),
        soft(api.admin.zohoLog(), []), soft(api.admin.zohoRuns(), []),
      ]);
      setD({ profiles, sites, corr, balances, subs, docs, items, conns, zitems, pending, projects, contacts, zlog, zruns });
    } catch (e) { setErr((e as Error).message); }
  }, [day]);
  useEffect(() => { load(); }, [load]);

  const act: Act = async (key, fn) => {
    setBusy(key); setErr('');
    try { await fn(); await load(); } catch (e) { setErr((e as Error).message); toast((e as Error).message, 'warn'); } finally { setBusy(''); }
  };
  const go = (n: Nav) => { setNav(n); setDrawer(false); window.scrollTo(0, 0); };

  const waitingCount = (d?.profiles.filter((p) => p.status === 'pending').length ?? 0) + (d?.corr.filter((c) => c.status === 'pending').length ?? 0);
  const zohoCount = (d?.zitems.filter((z) => !z.item_id).length ?? 0) + (d?.pending.filter((p) => !p.site_id).length ?? 0);
  const LINKS: { sec: Sec; label: string; icon: string; group?: string; badge?: number }[] = [
    { sec: 'overview', label: 'Overview', icon: 'chart' },
    { sec: 'approvals', label: 'Approvals', icon: 'check', group: 'Waiting for you', badge: waitingCount },
    { sec: 'sites', label: 'Sites', icon: 'box', group: 'Manage' }, { sec: 'people', label: 'People', icon: 'user' }, { sec: 'items', label: 'Items', icon: 'list' },
    { sec: 'zoho', label: 'Zoho', icon: 'swap', group: 'Connections', badge: zohoCount },
    { sec: 'activity', label: 'Activity', icon: 'clock', group: 'Records' },
  ];
  const TITLE: Record<Sec, string> = { overview: 'Overview', approvals: 'Approvals', sites: 'Sites', people: 'People', items: 'Items', zoho: 'Zoho', activity: 'Activity' };
  const siteName = (id: string | null | undefined) => d?.sites.find((s) => s.id === id)?.name ?? '';
  const crumb = nav.sec === 'sites' && nav.site ? `Sites / ${siteName(nav.site)}` : TITLE[nav.sec];

  return (
    <div className="ad">
      {drawer && <div className="adScrim" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside className={`adRail ${drawer ? 'open' : ''}`} aria-label="Admin menu">
        <div className="adBrand"><ComexLogo dark width={150} /><span className="adTag">ADMIN</span></div>
        <nav className="adNav">
          {LINKS.map((l) => (
            <div key={l.sec} className="adNavGroup">
              {l.group && <span className="adSec">{l.group}</span>}
              <button className="adLink" aria-current={nav.sec === l.sec ? 'page' : undefined} onClick={() => go({ sec: l.sec })}>
                <Icon name={l.icon} size={18} /><span>{l.label}</span>{!!l.badge && <span className="adBadge">{l.badge}</span>}
              </button>
            </div>
          ))}
        </nav>
        <span className="adGrow" />
        <button className="adStore" onClick={onExit}><Icon name="arrowL" size={16} />Open the store app</button>
        <div className="adUserWrap">
          {menu && (
            <div className="adUserMenu" role="menu" onMouseLeave={() => setMenu(false)}>
              <StartTraining user={user} className="adLink" label="Training mode" />
              <button className="adLink" role="menuitem" onClick={onSignOut}><Icon name="out" size={18} /><span>Sign out</span></button>
            </div>
          )}
          <button className="adUser" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
            <span className="adAv" style={{ background: '#2C3533' }}>{initials(user.name)}</span>
            <span className="adUserTxt"><b>{user.name}</b><small>Admin · all sites</small></span>
          </button>
        </div>
      </aside>

      <div className="adMain">
        <header className="adTop">
          <button className="adMenuBtn" onClick={() => setDrawer(true)} aria-label="Open the menu"><Icon name="list" size={20} />{!!(waitingCount + zohoCount) && <i />}</button>
          <span className="adCrumb">{d?.sites[0]?.company || 'Comex Builders'} <span>/ {crumb}</span></span>
          <span className="adGrow" />
          <button className="adRefresh" onClick={() => { load(); toast('Up to date'); }} title="Refresh"><Icon name="swap" size={14} />Refresh</button>
          <span className="adDate">{niceDate(day)}</span>
        </header>
        <main className="adBody">
          {err && <div className="note err" role="alert">{err}</div>}
          {!d ? <div className="adLoading"><span className="skel big" /><span className="skel" /><span className="skel" /></div> : (
            <>
              {nav.sec === 'overview' && <Overview d={d} day={day} user={user} go={go} />}
              {nav.sec === 'approvals' && <Approvals d={d} sel={nav.sel ?? null} setSel={(sel) => setNav({ sec: 'approvals', sel })} busy={busy} act={act} />}
              {nav.sec === 'sites' && !nav.site && <Sites d={d} day={day} go={go} busy={busy} act={act} />}
              {nav.sec === 'sites' && nav.site && <SitePage d={d} day={day} id={nav.site} tab={nav.tab ?? 'overview'} setTab={(tab) => setNav({ sec: 'sites', site: nav.site, tab })} back={() => go({ sec: 'sites' })} busy={busy} act={act} />}
              {nav.sec === 'people' && <People d={d} me={user} busy={busy} act={act} />}
              {nav.sec === 'items' && <Items d={d} busy={busy} act={act} />}
              {nav.sec === 'zoho' && <ZohoPage d={d} busy={busy} act={act} go={go} />}
              {nav.sec === 'activity' && <Activity d={d} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ───────── shared bits ───────── */

function Head({ title, lead, right, back }: { title: string; lead?: ReactNode; right?: ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <>
      {back && <button className="backPill" onClick={back.onClick}><Icon name="arrowL" size={16} />{back.label}</button>}
      <header className="adHead enter">
        <div><h1>{title}</h1>{lead && <p>{lead}</p>}</div>
        {right && <div className="adHeadR">{right}</div>}
      </header>
    </>
  );
}
function Seg<T extends string>({ opts, value, onPick }: { opts: [T, string][]; value: T; onPick: (v: T) => void }) {
  return <span className="adSeg" role="group">{opts.map(([k, l]) => <button key={k} aria-pressed={value === k} onClick={() => onPick(k)}>{l}</button>)}</span>;
}
const Av = ({ name }: { name: string }) => <span className="adAv" style={{ background: avColor(name) }}>{initials(name)}</span>;
function Dots({ items }: { items: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', off); window.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', off); window.removeEventListener('scroll', close, true); };
  }, [open]);
  return (
    <span className="adDots" ref={ref}>
      <button aria-label="More" aria-expanded={open} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) }); setOpen((v) => !v); }}>···</button>
      {open && createPortal(<span className="adDotsMenu" role="menu" style={pos} ref={menuRef}>{items.map((i) => <button key={i.label} role="menuitem" className={i.danger ? 'danger' : ''} disabled={i.disabled} onClick={() => { setOpen(false); i.onClick(); }}>{i.label}</button>)}</span>, document.body)}
    </span>
  );
}

/** Same rule as the store dashboard: out, at/below the reorder level, or about 5 days left at the last 2 weeks' rate. */
function lowCount(bs: Balance[], site: string, docs: SiteDoc[], day: string) {
  const from = addDays(day, -13);
  const used = new Map<number, number>();
  for (const d of docs) {
    if (d.site_id !== site || d.doc_date < from) continue;
    for (const l of d.lines) {
      const v = l.kind === 'issue' ? l.qty : l.kind === 'return' ? -l.qty : l.kind === 'correction' && (l.corrects_kind === 'issue' || l.corrects_kind === 'return') ? -l.qty : 0;
      if (v) used.set(l.item_id, (used.get(l.item_id) ?? 0) + v);
    }
  }
  let workdays = 0;
  for (let i = 0; i < 14; i++) if (weekday(addDays(day, -i)) !== 'Sun') workdays++;
  return bs.filter((b) => {
    if (b.site_id !== site) return false;
    if (b.balance <= 0 || (b.reorder_level != null && b.balance <= b.reorder_level)) return true;
    const a = Math.max(0, used.get(b.item_id) ?? 0) / workdays;
    return a > 0 && b.balance / a <= 5;
  }).length;
}
const teamOf = (d: Data, site: string) => d.profiles.filter((p) => p.site_id === site && p.status === 'approved' && p.role !== 'admin');
const isActive = (d: Data, site: string) => teamOf(d, site).length > 0 || d.balances.some((b) => b.site_id === site);
const subOf = (d: Data, site: string) => d.subs.find((x) => x.site_id === site);
function TodayPill({ d, site }: { d: Data; site: string }) {
  const sub = subOf(d, site);
  return sub ? <span className="stPill ok">Submitted {time(sub.submitted_at)}</span> : isActive(d, site) ? <span className="stPill low">Not yet</span> : <span className="stPill idle">Not set up</span>;
}

/* ───────── Overview: what needs you, then one row per site ───────── */

interface Todo { key: string; title: string; detail: string; kind: string; dot: string; action: string; at: string; run: () => void; disabled?: boolean }
function Overview({ d, day, user, go }: { d: Data; day: string; user: User; go: (n: Nav) => void }) {
  const name = (id: string | null | undefined) => d.sites.find((s) => s.id === id)?.name ?? '';
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const person = new Map(d.profiles.map((p) => [p.id, p]));
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Nairobi' }));
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';

  const todo: Todo[] = [];
  d.profiles.filter((p) => p.status === 'pending').forEach((p) => todo.push({ key: `p${p.id}`, title: `${p.full_name} wants to join${p.site_id ? ` ${name(p.site_id)}` : ''}`, detail: `${ROLE_LABEL[p.role]} · asked ${ago(p.created_at)}`, kind: 'Sign-up', dot: '#6B46C1', action: 'Review', at: p.created_at, run: () => go({ sec: 'approvals', sel: `p:${p.id}` }) }));
  d.corr.filter((c) => c.status === 'pending').forEach((c) => {
    const it = itemById.get(c.item_id);
    todo.push({ key: `c${c.id}`, title: `${c.kind === 'fix' ? 'Fix' : 'Recount'}: ${it?.name ?? 'Item'} ${fmt(c.from_qty)} → ${fmt(c.to_qty)} ${it?.unit ?? ''}`, detail: `${name(c.site_id)} · ${c.reason}${person.get(c.created_by) ? ` · ${person.get(c.created_by)!.full_name}` : ''}`, kind: c.kind === 'fix' ? 'Fix' : 'Recount', dot: '#2E5AAC', action: 'Review', at: c.created_at, run: () => go({ sec: 'approvals', sel: `c:${c.id}` }) });
  });
  const toMatch = d.zitems.filter((z) => !z.item_id);
  if (toMatch.length) todo.push({ key: 'zm', title: `${toMatch.length} Zoho item${toMatch.length === 1 ? '' : 's'} to match`, detail: toMatch.slice(0, 2).map((z) => z.zoho_name).join(' · ') + (toMatch.length > 2 ? ' …' : ''), kind: 'Zoho', dot: '#1F7A4D', action: 'Match', at: '9', run: () => go({ sec: 'zoho' }) });
  const noSite = d.pending.filter((p) => !p.site_id);
  if (noSite.length) todo.push({ key: 'zp', title: `${noSite.length} Zoho receive${noSite.length === 1 ? '' : 's'} with no Project`, detail: 'Choose which site each one belongs to', kind: 'Zoho', dot: '#1F7A4D', action: 'Place', at: '9', run: () => go({ sec: 'zoho' }) });
  d.conns.filter((c) => c.last_error).forEach((c) => todo.push({ key: `ze${c.user_id}`, title: `Zoho stopped for ${name(c.site_id) || c.full_name || 'a site'}`, detail: c.last_error ?? '', kind: 'Zoho', dot: '#B42318', action: 'Open', at: '9', run: () => go({ sec: 'zoho' }) }));
  if (weekday(day) !== 'Sun') d.sites.filter((s) => isActive(d, s.id) && !subOf(d, s.id) && h >= 15).forEach((s) => {
    const keeper = teamOf(d, s.id).find((p) => p.role === 'store' && p.phone) ?? teamOf(d, s.id).find((p) => p.phone);
    const last = d.docs.filter((x) => x.site_id === s.id && x.doc_date === day).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    todo.push({ key: `s${s.id}`, title: `${s.name} hasn’t submitted today`, detail: last ? `Last entry ${time(last.created_at)}` : 'No entries yet today', kind: 'Day', dot: '#B54708', action: 'Remind', at: '8', disabled: !keeper,
      run: () => keeper && window.open(`https://wa.me/${waNumber(keeper.phone!)}?text=${encodeURIComponent(`Hello ${keeper.full_name.split(' ')[0]}, please submit today’s entries for ${s.name} on Bohari. Thanks, ${user.name}`)}`, '_blank') });
  });
  todo.sort((a, b) => a.at.localeCompare(b.at));

  const entriesToday = (site: string) => d.docs.filter((x) => x.site_id === site && x.doc_date === day && x.kind !== 'correction').length;
  const submitted = d.sites.filter((s) => isActive(d, s.id) && subOf(d, s.id)).length;
  const active = d.sites.filter((s) => isActive(d, s.id)).length;

  return (
    <div className="adStack">
      <Head title={`${hello}, ${user.name.split(' ')[0]}`} lead={`${todo.length ? `${todo.length} thing${todo.length === 1 ? '' : 's'} need${todo.length === 1 ? 's' : ''} you` : 'Nothing needs you'} · ${submitted} of ${active} site${active === 1 ? '' : 's'} ha${active === 1 ? 's' : 've'} submitted today`} />
      <section className="panel adCard enter">
        <div className="adCardHead"><b>Needs you</b><span>Oldest first</span></div>
        {!todo.length && <div className="adAllClear"><span className="adTick"><Icon name="check" size={18} /></span><div><b>All clear.</b><small>Sign-ups, corrections and Zoho matches show up here when they arrive.</small></div></div>}
        {todo.map((t, i) => (
          <div key={t.key} className={`adTodo ${i === 0 ? 'first' : ''}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <span className="adNum">{i + 1}</span>
            <span className="adTodoTxt"><b>{t.title}{i === 0 && <span className="adStart">START HERE</span>}</b><small>{t.detail}</small></span>
            <span className="adKind"><i style={{ background: t.dot }} />{t.kind}</span>
            <button className={`adBtn ${i === 0 ? 'dark' : ''}`} disabled={t.disabled} title={t.disabled ? 'No phone number for this site’s store keeper' : undefined} onClick={t.run}>{t.action}</button>
          </div>
        ))}
      </section>
      <section className="panel adCard enter">
        <div className="adCardHead"><b>Sites today</b><button className="adLinkBtn" onClick={() => go({ sec: 'sites' })}>All sites →</button></div>
        <div className="adTable adSitesT">
          <div className="th"><span>Site</span><span>Today</span><span className="r">Entries</span><span className="r">Low stock</span><span className="r">Items</span><span className="r">Team</span><span /></div>
          {d.sites.map((s) => {
            const low = lowCount(d.balances, s.id, d.docs, day);
            return (
              <button key={s.id} className="tr" onClick={() => go({ sec: 'sites', site: s.id })}>
                <b>{s.name}</b><span><TodayPill d={d} site={s.id} /></span>
                <span className="r mono">{isActive(d, s.id) ? entriesToday(s.id) : '—'}</span>
                <span className={`r mono ${low ? 'red' : ''}`}>{low}</span>
                <span className="r mono">{d.balances.filter((b) => b.site_id === s.id && b.balance > 0).length}</span>
                <span className="r mono">{teamOf(d, s.id).length}</span><span className="adChev">›</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ───────── Approvals: sign-ups and corrections in one inbox ───────── */

function Approvals({ d, sel, setSel, busy, act }: { d: Data; sel: string | null; setSel: (s: string | null) => void; busy: string; act: Act }) {
  const [view, setView] = useState<'wait' | 'done'>('wait');
  const [note, setNote] = useState('');
  const [choice, setChoice] = useState<{ site: string; role: Role } | null>(null);
  const name = (id: string | null | undefined) => d.sites.find((s) => s.id === id)?.name ?? '';
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const person = new Map(d.profiles.map((p) => [p.id, p]));
  type Row = { id: string; title: string; sub: string; tag: string; tone: string; at: string; status: string };
  const rows: Row[] = [
    ...d.profiles.filter((p) => (view === 'wait' ? p.status === 'pending' : p.status !== 'pending' && p.decided_at)).map((p) => ({ id: `p:${p.id}`, title: `${p.full_name} wants to join`, sub: `${name(p.site_id) || 'No site'} · asked ${ago(p.created_at)}`, tag: 'Sign-up', tone: 'low', at: view === 'wait' ? p.created_at : p.decided_at ?? p.created_at, status: p.status })),
    ...d.corr.filter((c) => (view === 'wait' ? c.status === 'pending' : c.status !== 'pending')).map((c) => {
      const it = itemById.get(c.item_id);
      return { id: `c:${c.id}`, title: `${c.kind === 'fix' ? 'Fix' : 'Recount'}: ${it?.name ?? 'Item'} ${fmt(c.from_qty)} → ${fmt(c.to_qty)} ${it?.unit ?? ''}`, sub: `${name(c.site_id)} · ${person.get(c.created_by)?.full_name ?? ''} · ${ago(c.created_at)}`, tag: c.kind === 'fix' ? 'Fix' : 'Recount', tone: 'blue', at: view === 'wait' ? c.created_at : c.decided_at ?? c.created_at, status: c.status };
    }),
  ].sort((a, b) => (view === 'wait' ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));
  const waitN = d.profiles.filter((p) => p.status === 'pending').length + d.corr.filter((c) => c.status === 'pending').length;
  const cur = rows.find((r) => r.id === sel) ?? (view === 'wait' ? rows[0] : undefined);
  useEffect(() => { setNote(''); setChoice(null); }, [cur?.id]);

  return (
    <div className="adStack">
      <Head title="Approvals" lead="Sign-ups and corrections, in one place. Oldest first." right={<Seg opts={[['wait', `Waiting ${waitN}`], ['done', 'Decided']]} value={view} onPick={(v) => { setView(v); setSel(null); }} />} />
      <div className={`adSplit ${sel ? 'hasSel' : ''}`}>
        <section className="panel adList">
          {!rows.length && <div className="adAllClear"><span className="adTick"><Icon name="check" size={18} /></span><div><b>{view === 'wait' ? 'All caught up.' : 'Nothing decided yet.'}</b><small>{view === 'wait' ? 'New sign-ups and corrections appear here.' : ''}</small></div></div>}
          {rows.map((r) => (
            <button key={r.id} className={`adListRow ${cur?.id === r.id ? 'on' : ''}`} onClick={() => setSel(r.id)}>
              <span><b>{r.title}</b><small>{r.sub}</small></span>
              {view === 'wait' ? <span className={`adTag2 ${r.tone}`}>{r.tag}</span> : <span className={`stPill ${r.status === 'approved' ? 'ok' : 'out'}`}>{r.status === 'approved' ? 'Approved' : r.status === 'removed' ? 'Removed' : 'Declined'}</span>}
            </button>
          ))}
        </section>
        <section className="panel adDetail">
          {!cur ? <div className="adEmpty">Pick one on the left.</div> : cur.id.startsWith('p:') ? (() => {
            const p = d.profiles.find((x) => `p:${x.id}` === cur.id)!;
            const c = choice ?? { site: p.site_id ?? d.sites[0]?.id ?? '', role: p.role };
            return (
              <div className="adDIn" key={cur.id}>
                <button className="backPill adPhoneBack" onClick={() => setSel(null)}><Icon name="arrowL" size={16} />All requests</button>
                <span className="adKick">Sign-up{p.site_id ? ` · ${name(p.site_id)}` : ''}</span>
                <div className="adWho"><Av name={p.full_name} /><div><h2>{p.full_name}</h2><small>{p.email}{p.phone ? ` · ${p.phone}` : ''} · asked {ago(p.created_at)}</small></div></div>
                {p.status === 'pending' ? (
                  <>
                    <div className="adGrid2">
                      <label className="field"><span>Site</span><select className="select input" value={c.site} onChange={(e) => setChoice({ ...c, site: e.target.value })}>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                      <label className="field"><span>Role</span><select className="select input" value={c.role} onChange={(e) => setChoice({ ...c, role: e.target.value as Role })}>{(['store', 'assistant', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
                    </div>
                    <div className="adActs">
                      <button className="adBtn" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { status: 'declined' })).then(() => setSel(null))}>Decline</button>
                      <button className="adBtn ok" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { status: 'approved', site_id: c.site, role: c.role })).then(() => { toast(`${p.full_name} can sign in now`); setSel(null); })}>Approve</button>
                    </div>
                    <small className="muted">After approval they do the {TRAINING_DAYS}-day training first, unless you skip it in People.</small>
                  </>
                ) : <span className={`stPill ${p.status === 'approved' ? 'ok' : 'out'}`}>{p.status === 'approved' ? 'Approved' : 'Declined'} {p.decided_at ? ago(p.decided_at) : ''}</span>}
              </div>
            );
          })() : (() => {
            const c = d.corr.find((x) => `c:${x.id}` === cur.id)!;
            const it = itemById.get(c.item_id);
            const bal = d.balances.find((b) => b.site_id === c.site_id && b.item_id === c.item_id)?.balance;
            const doc = c.movement_id ? d.docs.find((x) => x.lines.some((l) => l.id === c.movement_id)) : undefined;
            const line = doc?.lines.find((l) => l.id === c.movement_id);
            const effect = c.kind === 'recount' ? c.to_qty - c.from_qty : line && (line.kind === 'issue' || line.kind === 'transfer_out') ? c.from_qty - c.to_qty : c.to_qty - c.from_qty;
            const others = c.movement_id && doc ? d.corr.filter((x) => x.id !== c.id && x.status === 'pending' && doc.lines.some((l) => l.id === x.movement_id)).length : 0;
            return (
              <div className="adDIn" key={cur.id}>
                <button className="backPill adPhoneBack" onClick={() => setSel(null)}><Icon name="arrowL" size={16} />All requests</button>
                <span className="adKick">{c.kind === 'fix' ? 'Fix an entry' : 'Recount'} · {name(c.site_id)}</span>
                <h2>{doc ? `${KIND_LABEL[doc.kind] ?? 'Entry'}${doc.ref_no ? ` ${doc.ref_no}` : ''} · ${niceDate(doc.doc_date)}` : c.kind === 'recount' ? `${it?.name} · shelf count` : it?.name}</h2>
                <small className="muted">Asked by {person.get(c.created_by)?.full_name ?? 'the store'} · {ago(c.created_at)} · “{c.reason}”{c.note ? ` · ${c.note}` : ''}</small>
                <div className="adChange">
                  <span>{it?.name}</span><s className="mono">{fmt(c.from_qty)}</s><span aria-hidden>→</span><b className="mono">{fmt(c.to_qty)} {it?.unit}</b>
                  {bal != null && <span className="adBal">Balance {fmt(bal)} → <b className={effect >= 0 ? 'up' : 'down'}>{fmt(bal + effect)}</b></span>}
                </div>
                <div className="adFacts">
                  <div><span>Original entry</span><b>{doc ? [doc.sys_no ? `${PREFIX[doc.kind] ?? ''}-${String(doc.sys_no).padStart(4, '0')}` : '', doc.activity, doc.party, doc.gemba].filter(Boolean).join(' · ') || '—' : c.kind === 'recount' ? 'None (shelf count)' : 'Older than 14 days'}</b></div>
                  <div><span>Effect</span><b>{effect === 0 ? 'No change' : `${effect > 0 ? '+' : '−'}${fmt(Math.abs(effect))} ${it?.unit ?? ''} ${effect > 0 ? 'into' : 'out of'} ${name(c.site_id)}`}</b></div>
                  {c.kind === 'fix' && <div><span>Other changes on this entry</span><b>{others ? `${others} more waiting` : 'None'}</b></div>}
                  <div><span>Status</span><b>{c.status === 'pending' ? 'Waiting for you' : `${c.status === 'approved' ? 'Approved' : 'Rejected'} ${c.decided_at ? ago(c.decided_at) : ''}${c.decision_note ? ` · “${c.decision_note}”` : ''}`}</b></div>
                </div>
                {c.status === 'pending' && (
                  <>
                    <input className="input" placeholder="Note to the store (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="adActs">
                      <button className="adBtn" disabled={!!busy} onClick={() => act(c.id, () => api.admin.decide(c.id, false, note || 'Rejected by the admin')).then(() => setSel(null))}>Reject</button>
                      <button className="adBtn ok" disabled={!!busy} onClick={() => act(c.id, () => api.admin.decide(c.id, true, note || undefined)).then(() => { toast('Approved · the balance is updated'); setSel(null); })}>Approve</button>
                    </div>
                  </>
                )}
                <small className="muted">Nothing is deleted: an approved change is added as its own entry, so the original stays in the record.</small>
              </div>
            );
          })()}
        </section>
      </div>
    </div>
  );
}

/* ───────── Sites ───────── */

function Sites({ d, day, go, busy, act }: { d: Data; day: string; go: (n: Nav) => void; busy: string; act: Act }) {
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState('');
  const [st, setSt] = useState<Structure>({ basements: 0, has_ground: true, floors: null, roof_name: null });
  return (
    <div className="adStack">
      <Head title="Sites" lead="Each site has its own store, team and balances. Click a site for its settings." right={<button className="adBtn acc" onClick={() => setAdding((v) => !v)}><Icon name="plus" size={16} />New site</button>} />
      {adding && (
        <section className="panel adPad enter">
          <b>Register a new site</b>
          <input className="input" style={{ maxWidth: 360 }} placeholder="Site name" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="New site name" autoFocus />
          <StructureFields value={st} busy={!!busy || !add.trim()} saveLabel="Add site" onChange={setSt}
            onSave={(s) => act('add', async () => { await api.admin.addSite(add.trim(), s); setAdd(''); setAdding(false); toast('Site added'); })} />
        </section>
      )}
      <section className="panel adCard enter">
        <div className="adTable adSitesL">
          <div className="th"><span>Site</span><span>Today</span><span className="r">Items</span><span className="r">Low</span><span className="r">Team</span><span>Project week</span><span>Zoho Project</span></div>
          {d.sites.map((s) => {
            const low = lowCount(d.balances, s.id, d.docs, day);
            return (
              <button key={s.id} className="tr" onClick={() => go({ sec: 'sites', site: s.id })}>
                <span className="adSiteN"><span className="adSiteLogo"><SiteLogo name={s.name} height={22} /></span><b>{s.name}</b></span>
                <span><TodayPill d={d} site={s.id} /></span>
                <span className="r mono">{d.balances.filter((b) => b.site_id === s.id && b.balance > 0).length}</span>
                <span className={`r mono ${low ? 'red' : ''}`}>{low}</span>
                <span className="r mono">{teamOf(d, s.id).length}</span>
                <span className="muted">{s.week_anchor_no ? `Week ${s.week_anchor_no}+` : '—'}</span>
                <span className="muted">{d.projects[s.id] || '—'}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SitePage({ d, day, id, tab, setTab, back, busy, act }: { d: Data; day: string; id: string; tab: SiteTab; setTab: (t: SiteTab) => void; back: () => void; busy: string; act: Act }) {
  const s = d.sites.find((x) => x.id === id);
  const [list, setList] = useState<number[] | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [week, setWeek] = useState('');
  const [proj, setProj] = useState<string | null>(null);
  const [contact, setContact] = useState<AlertContact | null>(null);
  useEffect(() => { api.admin.checklist(id).then(setList).catch(() => setList([])); }, [id]);
  if (!s) return <div className="muted">Site not found.</div>;
  const team = teamOf(d, id);
  const bal = d.balances.filter((b) => b.site_id === id);
  const inStore = bal.filter((b) => b.balance > 0).length;
  const low = lowCount(d.balances, id, d.docs, day);
  const out = bal.filter((b) => b.balance <= 0).length;
  const withLevel = bal.filter((b) => b.reorder_level != null).length;
  const trainingN = team.filter((p) => !p.training_waived && (p.training_days?.length ?? 0) < TRAINING_DAYS).length;
  const conn = d.conns.filter((c) => c.site_id === id);
  const ct = d.contacts[id];
  const TABS: [SiteTab, string][] = [['overview', 'Overview'], ['list', 'Stock take list'], ['reorder', 'Reorder levels'], ['building', 'Building & week'], ['manager', 'Site manager'], ['zoho', 'Zoho']];
  const Row = ({ label, value, action, onClick }: { label: string; value: ReactNode; action: string; onClick: () => void }) => (
    <div className="adSetRow"><span>{label}</span><span>{value}</span><button className="adLinkBtn" onClick={onClick}>{action}</button></div>
  );
  return (
    <div className="adStack">
      <Head back={{ label: 'Sites', onClick: back }} title={s.name} lead={`${describeStructure(s)}${s.week_anchor_no ? ` · from week ${s.week_anchor_no}` : ''} · ${team.length} ${team.length === 1 ? 'person' : 'people'}`} right={<TodayPill d={d} site={id} />} />
      <nav className="adTabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</nav>

      {tab === 'overview' && (
        <>
          <div className="adStats">
            <div className="panel"><span>Items in store</span><b className="mono">{inStore}</b><small>{bal.length} ever held</small></div>
            <div className="panel"><span>Low stock</span><b className={`mono ${low ? 'red' : ''}`}>{low}</b><small>{out} finished</small></div>
            <div className="panel"><span>Entries, last 14 days</span><b className="mono">{d.docs.filter((x) => x.site_id === id && x.kind !== 'correction').length}</b><small>{d.docs.filter((x) => x.site_id === id && x.doc_date === day).length} today</small></div>
            <div className="panel"><span>Team</span><b className="mono">{team.length}</b><small>{trainingN ? `${trainingN} in training` : 'All trained'}</small></div>
          </div>
          <section className="panel adCard">
            <div className="adSetRow">
              <span>Site name</span>
              {rename == null ? <span>{s.name}</span> : <span className="adInline"><input className="input" value={rename} onChange={(e) => setRename(e.target.value)} autoFocus /><button className="adBtn dark" disabled={!rename.trim() || !!busy} onClick={() => act(`r${id}`, () => api.admin.renameSite(id, rename.trim())).then(() => setRename(null))}>Save</button></span>}
              <button className="adLinkBtn" onClick={() => setRename(rename == null ? s.name : null)}>{rename == null ? 'Rename' : 'Cancel'}</button>
            </div>
            <Row label="Building" value={describeStructure(s)} action="Edit floors" onClick={() => setTab('building')} />
            <Row label="Project week" value={s.week_anchor_no ? `Week ${s.week_anchor_no} set ${niceDate(s.week_anchor_date!)} · counts on by itself` : <span className="muted">Not set</span>} action="Set week" onClick={() => setTab('building')} />
            <Row label="Site manager (WhatsApp)" value={ct?.phone ? `${ct.name || 'Site manager'} · ${ct.phone}` : <span className="muted">Not set</span>} action={ct?.phone ? 'Change' : 'Add'} onClick={() => setTab('manager')} />
            <Row label="Zoho Project" value={d.projects[id] ? `${d.projects[id]}${conn.length ? ` · ${conn.map((c) => c.full_name).join(', ')} connected · checked ${ago(conn[0].last_sync_at)}` : ' · nobody connected yet'}` : <span className="muted">Not set</span>} action="Change" onClick={() => setTab('zoho')} />
            <Row label="Stock take list" value={list ? `${list.length} items` : '…'} action="Edit list" onClick={() => setTab('list')} />
            <Row label="Reorder levels" value={`${withLevel} of ${bal.length} items set`} action="Set levels" onClick={() => setTab('reorder')} />
          </section>
        </>
      )}

      {tab === 'list' && <section className="panel adPad">{list ? <ChecklistEditor d={d} siteId={id} ids={list} onSaved={setList} /> : <span className="muted">Loading…</span>}</section>}
      {tab === 'reorder' && <Reorder d={d} site={id} busy={busy} act={act} />}
      {tab === 'building' && (
        <section className="panel adPad">
          <b>Building</b>
          <StructureFields value={structOf(s)} busy={!!busy} saveLabel="Save floors" onSave={(st) => act(`b${id}`, () => api.admin.setStructure(id, st)).then(() => toast('Floors saved'))} />
          <div className="adDivider" />
          <b>Project week</b>
          <span className="muted">{s.week_anchor_no ? <>Week <b>{s.week_anchor_no}</b> set on {niceDate(s.week_anchor_date!)}. It counts on by itself, pausing weeks with no entries.</> : 'Not set. The first stock take asks for it.'}</span>
          <span className="adInline"><input className="input num" style={{ width: 120 }} inputMode="numeric" placeholder="This week" value={week} onChange={(e) => setWeek(e.target.value.replace(/\D/g, ''))} aria-label="Project week this week" />
            <button className="adBtn dark" disabled={!(Number(week) >= 1) || !!busy} onClick={() => act(`w${id}`, () => api.admin.setProjectWeek(id, Number(week))).then(() => { setWeek(''); toast('Week set'); })}>Set this week</button></span>
        </section>
      )}
      {tab === 'manager' && (() => {
        const c = contact ?? { name: ct?.name ?? '', phone: ct?.phone ?? '' };
        return (
          <section className="panel adPad">
            <b>Site manager (WhatsApp)</b>
            <span className="muted">Gets the stock alert when the store presses “Send to Site manager”.</span>
            <div className="adGrid2">
              <label className="field"><span>Name</span><input className="input" placeholder="e.g. Eng. Juma Otieno" value={c.name ?? ''} onChange={(e) => setContact({ ...c, name: e.target.value })} /></label>
              <label className="field"><span>WhatsApp number</span><input className="input mono" inputMode="tel" placeholder="0712 345 678" value={c.phone ?? ''} onChange={(e) => setContact({ ...c, phone: e.target.value })} /></label>
            </div>
            <button className="adBtn dark" style={{ alignSelf: 'flex-start' }} disabled={!!busy || !(c.phone ?? '').replace(/\D/g, '')} onClick={() => act(`c${id}`, () => api.admin.setAlertContact(id, { name: (c.name ?? '').trim() || null, phone: (c.phone ?? '').trim() || null })).then(() => { setContact(null); toast('Saved'); })}>Save</button>
          </section>
        );
      })()}
      {tab === 'zoho' && (
        <section className="panel adPad">
          <b>Zoho Project</b>
          <span className="muted">Goods received in Zoho with this Project come into {s.name} by themselves.</span>
          <span className="adInline"><input className="input" style={{ width: 260 }} placeholder="As written in Zoho" value={proj ?? d.projects[id] ?? ''} onChange={(e) => setProj(e.target.value)} />
            <button className="adBtn dark" disabled={proj == null || !!busy} onClick={() => act(`z${id}`, () => api.admin.setZohoProject(id, proj!)).then(() => { setProj(null); toast('Saved'); })}>Save</button></span>
          <div className="adDivider" />
          <b>Connected</b>
          {!conn.length && <span className="muted">Nobody on this site has connected Zoho yet. The store keeper connects from the Deliveries page.</span>}
          {conn.map((c) => <span key={c.user_id}>{c.full_name ?? 'Someone'} · checked {ago(c.last_sync_at)} · {c.imported} brought in {c.last_error ? <span className="stPill out">{c.last_error}</span> : <span className="stPill ok">Working</span>}</span>)}
        </section>
      )}
    </div>
  );
}

function Reorder({ d, site, busy, act }: { d: Data; site: string; busy: string; act: Act }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const s = q.trim().toLowerCase();
  const rows = d.balances.filter((b) => b.site_id === site && (!s || b.name.toLowerCase().includes(s))).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="panel adCard">
      <div className="adCardHead"><label className="adSearch"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item" /></label><span>Agreed with the site manager. At or below this level the item shows as low.</span></div>
      <div className="adTable adReorder">
        <div className="th"><span>Item</span><span className="r">In store</span><span className="r">Reorder at</span><span /></div>
        {rows.map((b) => {
          const key = `${site}:${b.item_id}`, cur = b.reorder_level == null ? '' : String(b.reorder_level), v = vals[key] ?? cur;
          const lowNow = b.reorder_level != null && b.balance <= b.reorder_level;
          return (
            <div key={key} className="tr">
              <b>{b.name}</b>
              <span className={`r mono ${lowNow ? 'red' : ''}`}>{fmt(b.balance)} <small>{b.unit}</small></span>
              <span className="r"><input className="input num" inputMode="decimal" value={v} placeholder="Not set" aria-label={`Reorder level for ${b.name}`} onChange={(e) => setVals({ ...vals, [key]: e.target.value.replace(/[^0-9.]/g, '') })} /></span>
              <span>{v !== cur && <button className="adBtn dark" disabled={!!busy} onClick={() => act(key, () => api.admin.setReorder(site, b.item_id, v === '' ? null : Number(v)))}>Save</button>}</span>
            </div>
          );
        })}
        {!rows.length && <div className="adEmpty">No items in this store yet. They appear after the opening count.</div>}
      </div>
    </section>
  );
}

/** The admin lists the items in a store (no quantities). The store prints this list for its stock take. */
function ChecklistEditor({ d, siteId, ids, onSaved }: { d: Data; siteId: string; ids: number[]; onSaved: (ids: number[]) => void }) {
  const [list, setList] = useState<number[]>(ids);
  const [q, setQ] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(d.items.map((i) => [i.id, i])), [d.items]);
  const inList = new Set(list);
  const hits = q.trim().length > 1 ? d.items.filter((i) => !inList.has(i.id) && i.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const inStore = d.balances.filter((b) => b.site_id === siteId && !inList.has(b.item_id)).map((b) => b.item_id);
  const addPaste = async () => {
    const { readPasted, matchRows } = await import('../lib/importSheet');
    const rows = matchRows(readPasted(paste.split('\n').map((l) => (/\d\s*$/.test(l) ? l : `${l} 1`)).join('\n')), d.items);
    const ok = rows.filter((r) => r.kind === 'ok' && r.item && !inList.has(r.item.id)).map((r) => r.item!.id);
    setList([...list, ...new Set(ok)]); setPaste('');
    toast(`${ok.length} added · ${rows.length - ok.length} not matched (add those one by one)`);
  };
  const save = async () => { setBusy(true); try { await api.admin.setChecklist(siteId, list); onSaved(list); toast('Stock take list saved'); } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(false); } };
  return (
    <div className="ckEditor">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '2 1 260px', position: 'relative' }}><span>Add an item</span>
          <input className="input" placeholder="Search the item list" value={q} onChange={(e) => setQ(e.target.value)} />
          {!!hits.length && <div className="drop">{hits.map((i) => <button key={i.id} onClick={() => { setList([...list, i.id]); setQ(''); }}><span>{i.name}</span><span className="unit">{i.unit}</span></button>)}</div>}
        </div>
        {!!inStore.length && <button className="adBtn" style={{ alignSelf: 'flex-end' }} onClick={() => setList([...list, ...inStore])}>+ Add the {inStore.length} items now in this store</button>}
      </div>
      <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Paste a list of item names</summary>
        <textarea className="input" style={{ minHeight: 90, padding: 10 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="One item per line, e.g.&#10;Cement&#10;T12 Bars" />
        <button className="btn link" disabled={!paste.trim()} onClick={addPaste}>Add matching items</button>
      </details>
      <div className="ckChips">
        {list.map((id) => <span key={id} className="ckChip">{byId.get(id)?.name ?? id}<button aria-label="Remove" onClick={() => setList(list.filter((x) => x !== id))}>×</button></span>)}
        {!list.length && <span className="muted small">No items yet.</span>}
      </div>
      <div className="row"><button className="adBtn dark" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save list (${list.length})`}</button><span className="small muted">The store prints this list, counts, then types the quantities.</span></div>
    </div>
  );
}

/* ───────── People ───────── */

function People({ d, me, busy, act }: { d: Data; me: User; busy: string; act: Act }) {
  const [f, setF] = useState<'all' | 'store' | 'admin' | 'off'>('all');
  const [edit, setEdit] = useState<{ id: string; full_name: string; phone: string; site_id: string; role: Role } | null>(null);
  const name = (id: string | null | undefined) => d.sites.find((s) => s.id === id)?.name ?? '';
  const active = d.profiles.filter((p) => p.status === 'approved');
  const off = d.profiles.filter((p) => p.status === 'declined' || p.status === 'removed');
  const rows = f === 'off' ? off : active.filter((p) => f === 'all' || (f === 'admin' ? p.role === 'admin' : p.role !== 'admin'));
  const lastSeen = (id: string) => d.docs.filter((x) => x.created_by === id).reduce<string | null>((m, x) => (!m || x.created_at > m ? x.created_at : m), null);
  return (
    <div className="adStack">
      <Head title="People" lead="Everyone with access. ··· on a row: edit, skip training, remove access." right={<Seg opts={[['all', `All ${active.length}`], ['store', 'Store'], ['admin', 'Admin'], ['off', `Removed ${off.length}`]]} value={f} onPick={setF} />} />
      <section className="panel adCard enter">
        <div className="adTable adPeople">
          <div className="th"><span>Name</span><span>Site</span><span>Role</span><span>Training</span><span>Last entry</span><span /></div>
          {rows.map((p) => {
            const done = p.training_days?.length ?? 0;
            return edit?.id === p.id ? (
              <div key={p.id} className="tr adEditRow">
                <label className="field"><span>Full name</span><input className="input" value={edit.full_name} autoFocus onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></label>
                <label className="field"><span>Phone</span><input className="input" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
                <label className="field"><span>Site</span><select className="select input" value={edit.site_id} onChange={(e) => setEdit({ ...edit, site_id: e.target.value })}>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="field"><span>Role</span><select className="select input" value={edit.role} disabled={p.email === me.email} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>{(['store', 'assistant', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
                <span className="adActs">
                  <button className="adBtn" onClick={() => setEdit(null)}>Cancel</button>
                  <button className="adBtn dark" disabled={!!busy || !edit.full_name.trim()} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { full_name: edit.full_name.trim(), phone: edit.phone.trim() || null, site_id: edit.site_id, ...(p.email === me.email ? {} : { role: edit.role }) })).then(() => setEdit(null))}>Save</button>
                </span>
              </div>
            ) : (
              <div key={p.id} className="tr">
                <span className="adWhoS"><Av name={p.full_name} /><span><b>{p.full_name}</b><small>{p.email}{p.phone ? ` · ${p.phone}` : ''}</small></span></span>
                <span>{p.role === 'admin' ? 'All sites' : name(p.site_id) || '—'}</span>
                <span><span className={`adRole ${p.role}`}>{ROLE_LABEL[p.role]}</span></span>
                <span>{f === 'off' ? <span className="stPill idle">{p.status === 'removed' ? 'Removed' : 'Declined'}</span> : p.role === 'admin' ? '—' : p.training_waived ? <span className="muted">Skipped</span> : done >= TRAINING_DAYS ? <span className="stPill ok">Trained</span>
                  : <span className="adTrain"><i><b style={{ width: `${(done / TRAINING_DAYS) * 100}%` }} /></i>{done}/{TRAINING_DAYS} days</span>}</span>
                <span className="muted">{ago(lastSeen(p.id))}</span>
                <Dots items={f === 'off' ? [{ label: 'Give access back', onClick: () => act(p.id, () => api.admin.setProfile(p.id, { status: 'approved' })) }] : [
                  { label: 'Edit', onClick: () => setEdit({ id: p.id, full_name: p.full_name, phone: p.phone ?? '', site_id: p.site_id ?? d.sites[0]?.id ?? '', role: p.role }) },
                  ...(p.role !== 'admin' && done < TRAINING_DAYS ? [p.training_waived
                    ? { label: 'Undo skip training', onClick: () => act(p.id, () => api.admin.setProfile(p.id, { training_waived: false })) }
                    : { label: 'Skip training', onClick: async () => { if (await ask({ title: `Let ${p.full_name} skip training?`, body: <p>Their store opens now (or the first stock take unlocks, if the store has no stock yet).</p>, yes: 'Skip training' })) act(p.id, () => api.admin.setProfile(p.id, { training_waived: true })); } }] : []),
                  ...(p.email !== me.email ? [{ label: 'Remove access', danger: true, onClick: async () => { if (await ask({ title: `Remove ${p.full_name}’s access?`, body: <p>They will no longer be able to sign in. You can give access back later.</p>, yes: 'Remove access', tone: 'danger' })) act(p.id, () => api.admin.setProfile(p.id, { status: 'removed' })); } }] : []),
                ]} />
              </div>
            );
          })}
          {!rows.length && <div className="adEmpty">Nobody here.</div>}
        </div>
      </section>
      <small className="muted">New people sign up themselves at sitestock.co.ke; they appear in Approvals.</small>
    </div>
  );
}

/* ───────── Items ───────── */

function Items({ d, busy, act }: { d: Data; busy: string; act: Act }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'store' | 'never' | 'nozoho'>('all');
  const [dupOpen, setDupOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState<{ id: number; name: string; unit: string } | null>(null);
  const [newItem, setNewItem] = useState({ name: '', unit: 'Pcs' });
  const [limit, setLimit] = useState(60);
  const units = useMemo(() => [...new Set(d.items.map((i) => i.unit))].sort(), [d.items]);
  const siteName = new Map(d.sites.map((s) => [s.id, s.name]));
  const where = useMemo(() => {
    const m = new Map<number, string[]>();
    d.balances.forEach((b) => m.set(b.item_id, [...(m.get(b.item_id) ?? []), siteName.get(b.site_id ?? '') ?? ''].filter(Boolean)));
    return m;
  }, [d.balances]); // eslint-disable-line react-hooks/exhaustive-deps
  const linked = useMemo(() => { const m = new Map<number, number>(); d.zitems.forEach((z) => z.item_id && m.set(z.item_id, (m.get(z.item_id) ?? 0) + 1)); return m; }, [d.zitems]);
  const dupes = useMemo(() => {
    const g = new Map<string, Item[]>();
    d.items.forEach((i) => { const k = norm(i.name); g.set(k, [...(g.get(k) ?? []), i]); });
    return [...g.values()].filter((x) => x.length > 1);
  }, [d.items]);
  const notInZoho = d.items.filter((i) => i.in_zoho === false).length;
  const s = q.trim().toLowerCase();
  const all = d.items.filter((i) => (!s || i.name.toLowerCase().includes(s)) && (f === 'all' || (f === 'store' ? where.has(i.id) : f === 'never' ? !where.has(i.id) : i.in_zoho === false)));
  const shown = all.slice(0, limit);
  return (
    <div className="adStack">
      <Head title="Items" lead={`The one shared item list for every site: ${d.items.length.toLocaleString()} items.`} right={<button className="adBtn acc" onClick={() => setAdding((v) => !v)}><Icon name="plus" size={16} />Add item</button>} />
      {adding && (
        <section className="panel adPad enter">
          <b>Add an item</b>
          <span className="adInline">
            <input className="input" style={{ flex: 1 }} placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} autoFocus />
            <select className="select input" style={{ width: 120 }} value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>
            <button className="adBtn dark" disabled={!newItem.name.trim() || !!busy} onClick={() => act('newitem', async () => { await api.addItem(newItem.name.trim(), newItem.unit); setNewItem({ name: '', unit: 'Pcs' }); setAdding(false); toast('Item added · marked “not in Zoho” until Zoho has it'); })}>Add</button>
          </span>
        </section>
      )}
      {!!dupes.length && (
        <section className="adWarn enter">
          <span className="adWarnIc">!</span>
          <span><b>{dupes.length} possible duplicate{dupes.length === 1 ? '' : 's'}</b> e.g. “{dupes[0][0].name}” and “{dupes[0][1].name}”. Merging keeps one name and moves all history to it.</span>
          <button className="adBtn dark" onClick={() => setDupOpen((v) => !v)}>{dupOpen ? 'Hide' : 'Review duplicates'}</button>
        </section>
      )}
      {dupOpen && (
        <section className="panel adCard">
          {dupes.slice(0, 30).map((g) => (
            <div key={g[0].id} className="adDupRow">
              <span>{g.map((i) => `“${i.name}” (${i.unit})`).join(' and ')}</span>
              {g.slice(0, 2).map((keep, k) => {
                const drop = g[1 - k];
                return <button key={keep.id} className="adBtn" disabled={!!busy} onClick={async () => { if (await ask({ title: `Merge into “${keep.name}”?`, body: <p>All history of “{drop.name}” moves to “{keep.name}”, and “{drop.name}” disappears from the list.</p>, yes: 'Merge' })) act(`m${keep.id}`, () => api.admin.mergeItems(keep.id, drop.id)); }}>Keep “{keep.name}”</button>;
              })}
            </div>
          ))}
        </section>
      )}
      <div className="adBar">
        <label className="adSearch big"><Icon name="search" size={16} /><input value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder={`Search ${d.items.length.toLocaleString()} items`} /></label>
        <Seg opts={[['all', 'All'], ['store', 'In a store'], ['never', 'Never used'], ['nozoho', `Not in Zoho ${notInZoho}`]]} value={f} onPick={(v) => { setF(v); setLimit(60); }} />
      </div>
      <section className="panel adCard">
        <div className="adTable adItems">
          <div className="th"><span>Item</span><span>Unit</span><span>In stores</span><span>Zoho</span><span /></div>
          {shown.map((i) => edit?.id === i.id ? (
            <div key={i.id} className="tr">
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Item name" autoFocus />
              <select className="select input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>
              <span />
              <span className="adActs" style={{ gridColumn: 'span 2' }}>
                <button className="adBtn" onClick={() => setEdit(null)}>Cancel</button>
                <button className="adBtn dark" disabled={!!busy || !edit.name.trim()} onClick={() => act(`i${i.id}`, () => api.admin.updateItem(i.id, edit.name.trim(), edit.unit)).then(() => setEdit(null))}>Save</button>
              </span>
            </div>
          ) : (
            <div key={i.id} className="tr">
              <b>{i.name}</b><span className="mono">{i.unit}</span>
              <span className="muted">{where.get(i.id)?.join(' · ') || '—'}</span>
              <span>{i.in_zoho === false ? <span className="stPill out">Not in Zoho</span> : linked.get(i.id) ? <span className="mono">{linked.get(i.id)} linked</span> : <span className="muted">In Zoho list</span>}</span>
              <Dots items={[{ label: 'Edit name or unit', onClick: () => setEdit({ id: i.id, name: i.name, unit: i.unit }) }]} />
            </div>
          ))}
          {!shown.length && <div className="adEmpty">No items match.</div>}
        </div>
        {all.length > shown.length && <button className="adMore" onClick={() => setLimit(limit + 100)}>Show more ({(all.length - shown.length).toLocaleString()} left)</button>}
      </section>
    </div>
  );
}

/* ───────── Zoho ───────── */

const ZSTATUS: Record<ZohoLogRow['status'], { label: string; cls: string }> = {
  imported: { label: 'Brought in', cls: 'ok' },
  linked: { label: 'Linked', cls: 'ok' },
  waiting: { label: 'Waiting', cls: 'warn' },
  no_project: { label: 'No Project', cls: 'warn' },
  other_site: { label: 'Other site', cls: 'idle' },
  before_start: { label: 'Before start', cls: 'idle' },
};

/** Everything Zoho sent, one row per goods-received note, so the admin can tick it off against Zoho. */
function ZohoLog({ d }: { d: Data }) {
  const [site, setSite] = useState<string>('all');
  const [f, setF] = useState<'mine' | 'all' | 'attn'>('mine');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const siteName = (id: string | null) => d.sites.find((s) => s.id === id)?.name ?? '';
  const s = q.trim().toLowerCase();
  const rows = d.zlog.filter((r) => (site === 'all' || r.site_id === site)
    && (f === 'all' || (f === 'attn' ? r.status === 'waiting' || r.status === 'no_project' : r.status !== 'other_site' && r.status !== 'before_start'))
    && (!s || [r.grn, r.po, r.vendor, r.project, ...(r.lines ?? []).map((l) => l.name)].some((x) => (x ?? '').toLowerCase().includes(s))));
  const attn = d.zlog.filter((r) => r.status === 'waiting' || r.status === 'no_project').length;
  // The last check per site: what Zoho listed, so "nothing came in" can be told apart from "nothing was there".
  const lastRuns = d.sites.map((x) => ({ site: x, run: d.zruns.find((r) => r.site_id === x.id) })).filter((x) => x.run);
  return (
    <div className="adStack">
      <span className="adSecT">Everything Zoho sent{d.zlog.length ? ` · ${d.zlog.length}` : ''}</span>
      <section className="panel adCard">
        {!!lastRuns.length && <div className="adZRuns">{lastRuns.map(({ site: x, run }) => (
          <span key={x.id} title={run!.note ?? ''}><b>{x.name}</b> checked {ago(run!.at)} · Zoho listed {run!.listed} · {run!.imported ? `${run!.imported} brought in` : 'nothing new'}</span>
        ))}</div>}
        <div className="adZBar">
          <Seg opts={[['mine', 'For our sites'], ['attn', `Needs you ${attn}`], ['all', 'Everything']]} value={f} onPick={setF} />
          <select className="select input" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
            <option value="all">All sites</option>{d.sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <input className="input" placeholder="Search GRN, PO, vendor, item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="adTable adZLog">
          <div className="th"><span>Date</span><span>GRN · PO</span><span>Vendor</span><span>Site</span><span>Items</span><span>Status</span></div>
          {!d.zlog.length && <div className="adEmpty">Nothing logged yet. Every goods-received note the Zoho check reads shows up here, with what happened to it.</div>}
          {!!d.zlog.length && !rows.length && <div className="adEmpty">Nothing matches.</div>}
          {rows.map((r) => {
            const st = ZSTATUS[r.status];
            const lines = r.lines ?? [];
            const isOpen = open === r.zoho_receive_id;
            return (
              <div key={r.zoho_receive_id} className={`adZItem ${isOpen ? 'open' : ''}`}>
                <button className="tr" onClick={() => setOpen(isOpen ? null : r.zoho_receive_id)} aria-expanded={isOpen}>
                  <span className="mono">{r.receive_date ? niceDate(r.receive_date).split(' ').slice(1).join(' ') : '—'}</span>
                  <span><b className="mono">{r.grn || '—'}</b>{r.po && <small className="muted mono"> · {r.po}</small>}</span>
                  <span>{r.vendor ?? <span className="muted">—</span>}</span>
                  <span>{siteName(r.site_id) || <span className="muted">{r.project ?? '—'}</span>}</span>
                  <span className="muted">{lines.length ? `${lines[0].name}${lines.length > 1 ? ` +${lines.length - 1}` : ''}` : '—'}</span>
                  <span><span className={`stPill ${st.cls}`}>{st.label}</span></span>
                </button>
                {isOpen && (
                  <div className="adZDetail">
                    {lines.map((l, i) => <div key={i} className="ln"><span>{l.name}</span><span className="mono">{fmt(l.qty)} {l.unit ?? ''}</span></div>)}
                    <small className="muted">{[r.project && `Zoho Project: ${r.project}`, r.detail].filter(Boolean).join(' · ')}</small>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ZohoPage({ d, busy, act, go }: { d: Data; busy: string; act: Act; go: (n: Nav) => void }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const items = useMemo(() => [...d.items].sort((a, b) => a.name.localeCompare(b.name)), [d.items]);
  const byNorm = useMemo(() => new Map(d.items.map((i) => [norm(i.name), i])), [d.items]);
  const toMatch = d.zitems.filter((z) => !z.item_id);
  const noSite = d.pending.filter((p) => !p.site_id);
  const waiting = d.pending.filter((p) => p.site_id);
  const siteName = (id: string | null) => d.sites.find((s) => s.id === id)?.name ?? '';
  /** A Bohari item whose name looks the same, to suggest. */
  const suggest = (z: ZohoItemMatch) => {
    const n = norm(z.zoho_name ?? '');
    return byNorm.get(n) ?? d.items.find((i) => { const m = norm(i.name); return m.length > 3 && (n.startsWith(m) || m.startsWith(n)); });
  };
  return (
    <div className="adStack">
      <Head title="Zoho Books" lead="Goods received in Zoho come into each site by themselves. Nothing is changed in Zoho." />
      <ZohoLog d={d} />
      <div className="adZoho">
        <div className="adStack">
          <span className="adSecT">Each site’s connection</span>
          <section className="panel adCard">
            <div className="adTable adConn">
              <div className="th"><span>Site</span><span>Zoho Project</span><span>Connected by · last check</span><span>Status</span></div>
              {d.sites.map((s) => {
                const c = d.conns.filter((x) => x.site_id === s.id);
                const bad = c.find((x) => x.last_error);
                return (
                  <button key={s.id} className="tr" onClick={() => go({ sec: 'sites', site: s.id, tab: 'zoho' })} title="Open the site’s Zoho settings">
                    <b>{s.name}</b><span>{d.projects[s.id] || <span className="muted">Not set</span>}</span>
                    <span className="muted">{c.length ? c.map((x) => `${(x.full_name ?? 'Someone').split(' ')[0]} · ${ago(x.last_sync_at)}`).join(', ') : 'Nobody yet'}</span>
                    <span>{bad ? <span className="stPill out" title={bad.last_error ?? ''}>Reconnect</span> : c.length ? <span className="stPill ok">Working</span> : <span className="stPill idle">Not connected</span>}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {!!waiting.length && <>
            <span className="adSecT">Waiting to come in · {waiting.length}</span>
            <section className="panel adCard">{waiting.map((p) => <div key={p.zoho_receive_id} className="adZRow"><b className="mono">{p.grn}</b><span>{siteName(p.site_id)}</span><span className="muted">{p.reason}</span></div>)}</section>
          </>}
        </div>
        <div className="adStack">
          <span className={`adSecT ${toMatch.length ? 'acc' : ''}`}>{toMatch.length} Zoho item{toMatch.length === 1 ? '' : 's'} to match</span>
          <section className="panel adCard">
            {!toMatch.length && <div className="adEmpty">Nothing to match. New Zoho items appear here the first time they’re received.</div>}
            {toMatch.map((z) => {
              const sg = suggest(z);
              const v = pick[z.zoho_item_id] ?? (sg ? String(sg.id) : '');
              return (
                <div key={z.zoho_item_id} className="adMatch">
                  <span><span className="zohoTag"><b>ZOHO</b></span> {z.zoho_name} <small className="muted">{z.zoho_unit ?? ''}</small></span>
                  <select className="select input" value={v} onChange={(e) => setPick({ ...pick, [z.zoho_item_id]: e.target.value })} aria-label={`Bohari item for ${z.zoho_name}`}>
                    <option value="">Choose the Bohari item…</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name} · {i.unit}{sg?.id === i.id ? ' (suggested)' : ''}</option>)}
                  </select>
                  <span className="adActs">
                    <button className="adBtn" disabled={!!busy} title="Add it to Bohari's list under Zoho's name" onClick={() => act(`zn${z.zoho_item_id}`, async () => { const it = await api.addItem((z.zoho_name ?? 'Item').trim(), (z.zoho_unit ?? 'Pcs').trim() || 'Pcs'); await api.admin.matchZohoItem(z.zoho_item_id, it.id); })}>New</button>
                    <button className="adBtn dark" disabled={!v || !!busy} onClick={() => act(`zm${z.zoho_item_id}`, () => api.admin.matchZohoItem(z.zoho_item_id, Number(v)))}>Match</button>
                  </span>
                </div>
              );
            })}
            {!!toMatch.length && <div className="adFoot">Match once; the waiting deliveries come in on the next check.</div>}
          </section>
          <span className="adSecT">Receives with no Project · {noSite.length}</span>
          <section className="panel adCard">
            {!noSite.length && <div className="adEmpty">None. When a receive has no Project in Zoho, you choose its site here.</div>}
            {noSite.map((p) => (
              <div key={p.zoho_receive_id} className="adMatch">
                <span><b className="mono">{p.grn}</b> · {p.vendor ?? '—'} <small className="muted">{p.receive_date ? niceDate(p.receive_date) : ''}{p.reason && p.reason !== 'No Project in Zoho' ? ` · ${p.reason}` : ''}</small></span>
                <select className="select input" value={pick[p.zoho_receive_id] ?? ''} onChange={(e) => setPick({ ...pick, [p.zoho_receive_id]: e.target.value })} aria-label={`Site for ${p.grn}`}>
                  <option value="">Which site?</option>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="adBtn dark" disabled={!pick[p.zoho_receive_id] || !!busy} onClick={() => act(`za${p.zoho_receive_id}`, () => api.admin.assignPending(p.zoho_receive_id, pick[p.zoho_receive_id]))}>Place</button>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ───────── Activity ───────── */

interface Event { at: string; site: string; dot: string; text: string; who: string }
function events(d: Data): Event[] {
  const siteName = new Map(d.sites.map((s) => [s.id, s.name]));
  const person = new Map(d.profiles.map((p) => [p.id, p]));
  const itemById = new Map(d.items.map((i) => [i.id, i]));
  const ev: Event[] = [];
  d.docs.forEach((doc) => {
    const lines = doc.lines.slice(0, 2).map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)} ${itemById.get(l.item_id)?.unit ?? ''}`.trim()).join(', ');
    const zoho = doc.source === 'zoho';
    ev.push({ at: doc.created_at, site: siteName.get(doc.site_id) ?? '', dot: KIND_DOT[doc.kind] ?? '#75807C',
      text: `${KIND_LABEL[doc.kind] ?? doc.kind}${zoho ? ' from Zoho' : ''}${doc.ref_no ? ` · ${doc.ref_no}` : ''}${doc.party ? ` · ${doc.party}` : ''} · ${lines}${doc.lines.length > 2 ? ` +${doc.lines.length - 2} more` : ''}`,
      who: zoho ? 'Zoho' : person.get(doc.created_by)?.full_name ?? '' });
  });
  d.subs.forEach((s) => ev.push({ at: s.submitted_at, site: siteName.get(s.site_id) ?? '', dot: '#145236', text: 'Submitted the day', who: '' }));
  d.corr.forEach((c) => {
    const it = itemById.get(c.item_id);
    ev.push({ at: c.created_at, site: siteName.get(c.site_id) ?? '', dot: '#2E5AAC', text: `Asked: ${c.kind === 'fix' ? 'fix' : 'recount'} ${it?.name} ${fmt(c.from_qty)} → ${fmt(c.to_qty)} · ${c.reason}`, who: person.get(c.created_by)?.full_name ?? '' });
    if (c.decided_at) ev.push({ at: c.decided_at, site: siteName.get(c.site_id) ?? '', dot: c.status === 'approved' ? '#1F7A4D' : '#B42318', text: `${c.status === 'approved' ? 'Approved' : 'Rejected'}: ${it?.name} ${fmt(c.from_qty)} → ${fmt(c.to_qty)}`, who: 'Admin' });
  });
  d.profiles.forEach((p) => ev.push({ at: p.created_at, site: siteName.get(p.site_id ?? '') ?? '', dot: '#8A5000', text: `${p.full_name} asked to join as ${ROLE_LABEL[p.role]}`, who: p.full_name }));
  const from = addDays(today(), -13);
  return ev.filter((e) => dayOf(e.at) >= from).sort((a, b) => b.at.localeCompare(a.at));
}

function Activity({ d }: { d: Data }) {
  const [f, setF] = useState('All');
  const all = useMemo(() => events(d), [d]);
  const list = (f === 'All' ? all : all.filter((e) => e.site === f)).slice(0, 400);
  const groups: [string, Event[]][] = [];
  list.forEach((e) => { const k = dayOf(e.at); const g = groups[groups.length - 1]; if (g && g[0] === k) g[1].push(e); else groups.push([k, [e]]); });
  const excel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Date', 'Time', 'Site', 'What happened', 'Who'], ...list.map((e) => [dayOf(e.at), time(e.at), e.site, e.text, e.who])]);
    ws['!cols'] = [12, 7, 16, 80, 20].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Activity');
    XLSX.writeFile(wb, `Bohari activity ${today()}.xlsx`);
  };
  return (
    <div className="adStack">
      <Head title="Activity" lead="Everything that happened, newest first. Last 14 days." right={<><Seg opts={[['All', 'All sites'], ...d.sites.map((s) => [s.name, s.name] as [string, string])]} value={f} onPick={setF} /><button className="adBtn" onClick={excel}><Icon name="download" size={16} />Excel</button></>} />
      {!groups.length && <section className="panel adEmpty">Nothing yet.</section>}
      {groups.map(([day, evs]) => (
        <div key={day} className="adStack" style={{ gap: 8 }}>
          <span className="adSecT">{day === today() ? 'Today · ' : day === addDays(today(), -1) ? 'Yesterday · ' : ''}{niceDate(day)}</span>
          <section className="panel adCard">
            {evs.map((e, i) => (
              <div key={i} className="adEv"><span className="mono muted">{time(e.at)}</span><b>{e.site}</b><span className="adEvT"><i style={{ background: e.dot, boxShadow: `0 0 0 4px ${e.dot}22` }} />{e.text}</span><span className="muted">{e.who}</span></div>
            ))}
          </section>
        </div>
      ))}
    </div>
  );
}

/* ───────── building questions ───────── */

const structOf = (s: SiteInfo): Structure => ({ basements: s.basements ?? 0, has_ground: s.has_ground ?? true, floors: s.floors ?? null, roof_name: s.roof_name ?? null });

/** How the project is built: basements, ground floor, floors above ground, and the roof. Decides the floors on every form. */
function StructureFields({ value, onSave, onChange, busy, saveLabel }: { value: Structure; onSave: (s: Structure) => void; onChange?: (s: Structure) => void; busy: boolean; saveLabel: string }) {
  const [v, setV] = useState<Structure>(value);
  const set = (p: Partial<Structure>) => { const n = { ...v, ...p }; setV(n); onChange?.(n); };
  const list = subphasesFor(v.floors ? v : null);
  return (
    <div className="structBox">
      <div className="structQs">
        <label className="field"><span>How many basements?</span>
          <input className="input num" inputMode="numeric" value={String(v.basements)} onChange={(e) => set({ basements: Number(e.target.value.replace(/\D/g, '') || 0) })} /></label>
        <label className="field"><span>Is there a ground floor?</span>
          <select className="select input" value={v.has_ground ? 'yes' : 'no'} onChange={(e) => set({ has_ground: e.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className="field"><span>Floors above ground</span>
          <input className="input num" inputMode="numeric" placeholder="e.g. 16" value={v.floors ?? ''} onChange={(e) => set({ floors: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></label>
        <label className="field"><span>Top of the building</span>
          <input className="input" placeholder="e.g. Rooftop terrace (or leave empty)" value={v.roof_name ?? ''} onChange={(e) => set({ roof_name: e.target.value || null })} /></label>
      </div>
      <div className="small muted">{v.floors ? <>Forms will offer <b>{list.length - 1}</b> levels: {list[1]} up to {list[list.length - 1]}.</> : 'Enter the floors to see the levels the forms will offer.'}</div>
      <button className="adBtn dark" style={{ alignSelf: 'flex-start' }} disabled={busy || !v.floors} onClick={() => onSave(v)}>{saveLabel}</button>
    </div>
  );
}
