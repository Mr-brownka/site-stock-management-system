import { CrateMark, SiteLogo } from '../components/Brand';
import { Icon } from '../components/fx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate, today, weekday } from '../lib/dates';
import type { AlertContact, Balance, CorrectionRequest, Item, Profile, Role, SiteDoc, SiteInfo, Structure, User } from '../lib/types';
import { ask, toast } from '../components/feedback';
import { StartTraining } from '../components/Training';
import { TRAINING_DAYS } from '../lib/trainingPlan';
import { describeStructure, subphasesFor } from '../lib/structure';

type Sec = 'overview' | 'people' | 'corr' | 'sites' | 'items' | 'reorder' | 'log';
const ROLE_LABEL: Record<Role, string> = { store: 'Store', assistant: 'Assistant', admin: 'Admin' };
const KIND_LABEL: Record<string, string> = { opening: 'Opening count', delivery: 'Delivery', issue: 'Card', return: 'Return', transfer_in: 'Received', transfer_out: 'Sent', correction: 'Correction' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(iso));
const norm = (n: string) => n.toLowerCase().replace(/["'’]/g, '').replace(/[^a-z0-9]+/g, '').replace(/s$/, '');

interface Data {
  profiles: Profile[]; sites: SiteInfo[]; corr: CorrectionRequest[]; balances: Balance[];
  subs: { site_id: string; submitted_at: string }[]; docs: SiteDoc[]; items: Item[];
}

export function Admin({ user, onExit, onSignOut }: { user: User; onExit: () => void; onSignOut: () => void }) {
  const [sec, setSec] = useState<Sec>('overview');
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const day = today();

  const load = useCallback(async () => {
    try {
      const [profiles, sites, corr, balances, subs, docs, items] = await Promise.all([
        api.admin.profiles(), api.admin.sites(), api.admin.corrections(), api.admin.balances(), api.admin.submissions(day), api.admin.documents(addDays(day, -13), day), api.items(),
      ]);
      setD({ profiles, sites, corr, balances, subs, docs, items });
    } catch (e) { setErr((e as Error).message); }
  }, [day]);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr('');
    try { await fn(); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  const siteName = useMemo(() => new Map((d?.sites ?? []).map((s) => [s.id, s.name])), [d]);
  const person = useMemo(() => new Map((d?.profiles ?? []).map((p) => [p.id, p])), [d]);
  const itemById = useMemo(() => new Map((d?.items ?? []).map((i) => [i.id, i])), [d]);
  const pendingPeople = d?.profiles.filter((p) => p.status === 'pending') ?? [];
  const pendingCorr = d?.corr.filter((c) => c.status === 'pending') ?? [];

  const NAV: [Sec, string, string, number?][] = [
    ['overview', 'chart', 'Overview'], ['people', 'user', 'People', pendingPeople.length], ['corr', 'fix', 'Corrections', pendingCorr.length],
    ['sites', 'box', 'Sites'], ['items', 'list', 'Items'], ['reorder', 'alert', 'Reorder levels'], ['log', 'clock', 'Activity log'],
  ];
  const TITLE: Record<Sec, string> = { overview: 'Overview', people: 'People', corr: 'Corrections', sites: 'Sites', items: 'Items', reorder: 'Reorder levels', log: 'Activity log' };
  const company = d?.sites[0]?.company ?? '';

  return (
    <div className="adm">
      <nav className="admNav" aria-label="Admin sections">
        <div className="admBrand railBrand"><CrateMark size={34} tile="dark" /><div className="railName"><b>COMEX BUILDERS</b><span>Admin</span></div></div>
        <span className="railSec">Manage</span>
        {NAV.map(([k, icon, label, badge]) => (
          <button key={k} className="admLink" aria-current={sec === k ? 'page' : undefined} onClick={() => setSec(k)}>
            <Icon name={icon} /><span style={{ flex: 1 }}>{label}</span>
            {!!badge && <span className="admBadge">{badge}</span>}
          </button>
        ))}
        <div className="admFoot">
          <div>Signed in as <b style={{ color: '#fff' }}>{user.name}</b></div>
          <button className="admLink" onClick={onExit}><Icon name="checkin" />Check-in app</button>
          <button className="admLink" onClick={onSignOut}><Icon name="out" />Sign out</button>
        </div>
      </nav>
      <main className="admMain">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div><div className="label">{sec === 'overview' ? `${company} · all sites` : 'Admin'}</div><h1 className="admH1">{TITLE[sec]}</h1></div>
          <span className="row"><StartTraining user={user} className="btn ghost admSm trainStart" label="Training mode" /><button className="btn link" onClick={load}>Refresh</button></span>
        </div>
        {err && <div className="note err" role="alert">{err}</div>}
        {!d ? <div className="muted">Loading…</div> : (
          <>
            {sec === 'overview' && <Overview d={d} day={day} siteName={siteName} person={person} itemById={itemById} pendingPeople={pendingPeople.length} pendingCorr={pendingCorr.length} go={setSec} />}
            {sec === 'people' && <People d={d} me={user} siteName={siteName} busy={busy} act={act} />}
            {sec === 'corr' && <Corr d={d} siteName={siteName} person={person} itemById={itemById} busy={busy} act={act} />}
            {sec === 'sites' && <Sites d={d} busy={busy} act={act} />}
            {sec === 'items' && <Items d={d} busy={busy} act={act} />}
            {sec === 'reorder' && <Reorder d={d} busy={busy} act={act} />}
            {sec === 'log' && <Log d={d} siteName={siteName} person={person} itemById={itemById} />}
          </>
        )}
      </main>
    </div>
  );
}

type Act = (key: string, fn: () => Promise<unknown>) => Promise<void>;

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

interface Event { at: string; site: string; kind: string; cls: string; text: string; who: string }
function events(d: Data, siteName: Map<string, string>, person: Map<string, Profile>, itemById: Map<number, Item>): Event[] {
  const ev: Event[] = [];
  d.docs.forEach((doc) => {
    const lines = doc.lines.slice(0, 2).map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)} ${itemById.get(l.item_id)?.unit ?? ''}`).join(', ');
    const sub = doc.doc_date === dayOf(new Date().toISOString()) ? d.subs.find((x) => x.site_id === doc.site_id) : undefined;
    const late = !!sub && doc.kind !== 'correction' && doc.created_at > sub.submitted_at;
    ev.push({ at: doc.created_at, site: siteName.get(doc.site_id) ?? '', kind: (KIND_LABEL[doc.kind] ?? doc.kind) + (late ? ' · added' : ''), cls: doc.kind === 'correction' ? 'acc' : late ? 'late' : '',
      text: `${doc.ref_no ? doc.ref_no + ' · ' : ''}${doc.party ? doc.party + ' · ' : ''}${lines}${doc.lines.length > 2 ? '…' : ''}`, who: person.get(doc.created_by)?.full_name ?? '' });
  });
  d.corr.forEach((c) => {
    const it = itemById.get(c.item_id);
    ev.push({ at: c.created_at, site: siteName.get(c.site_id) ?? '', kind: 'Asked', cls: 'acc', text: `${c.kind === 'fix' ? 'Fix' : 'Recount'} · ${it?.name} ${fmt(c.from_qty)} → ${fmt(c.to_qty)} · ${c.reason}`, who: person.get(c.created_by)?.full_name ?? '' });
    if (c.decided_at) ev.push({ at: c.decided_at, site: siteName.get(c.site_id) ?? '', kind: c.status === 'approved' ? 'Approved' : 'Rejected', cls: c.status === 'approved' ? 'done' : 'err', text: `${it?.name} ${fmt(c.from_qty)} → ${fmt(c.to_qty)}`, who: 'Admin' });
  });
  d.profiles.forEach((p) => {
    ev.push({ at: p.created_at, site: siteName.get(p.site_id ?? '') ?? '', kind: 'Sign-up', cls: 'acc', text: `${p.full_name} asked to join as ${ROLE_LABEL[p.role]}`, who: p.full_name });
  });
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}

function EventRows({ list }: { list: Event[] }) {
  if (!list.length) return <div className="pad muted">Nothing yet.</div>;
  return <>{list.map((e, i) => (
    <div key={i} className="admRow small">
      <span className="mono muted" style={{ width: 118 }}>{niceDate(dayOf(e.at)).slice(0, 6)} {time(e.at)}</span>
      <span style={{ width: 110, fontWeight: 600 }}>{e.site}</span>
      <span style={{ width: 104 }}><span className={`pill ${e.cls}`}>{e.kind}</span></span>
      <span style={{ flex: 1, minWidth: 0 }}>{e.text}</span>
      <span className="muted">{e.who}</span>
    </div>
  ))}</>;
}

function Overview({ d, day, siteName, person, itemById, pendingPeople, pendingCorr, go }: { d: Data; day: string; siteName: Map<string, string>; person: Map<string, Profile>; itemById: Map<number, Item>; pendingPeople: number; pendingCorr: number; go: (s: Sec) => void }) {
  const team = (site: string) => d.profiles.filter((p) => p.site_id === site && p.status === 'approved' && p.role !== 'admin').length;
  const withTeam = d.sites.filter((s) => team(s.id) > 0 || d.balances.some((b) => b.site_id === s.id));
  const submitted = (site: string) => d.subs.find((x) => x.site_id === site);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="admCards">
        <button className="card pad admStat" style={{ borderLeft: '5px solid var(--accent)' }} onClick={() => go('people')}><div className="label">People waiting</div><div className="admBig">{pendingPeople}</div><div className="small muted">Sign-ups to approve</div></button>
        <button className="card pad admStat" style={{ borderLeft: '5px solid var(--accent)' }} onClick={() => go('corr')}><div className="label">Corrections waiting</div><div className="admBig">{pendingCorr}</div><div className="small muted">Changes to submitted days</div></button>
        <div className="card pad admStat" style={{ borderLeft: '5px solid var(--ok)' }}><div className="label">Submitted today</div><div className="admBig">{withTeam.filter((s) => submitted(s.id)).length} / {withTeam.length}</div><div className="small muted">{niceDate(day)}</div></div>
      </div>
      <div className="label">Sites today</div>
      <div className="admSites">
        {d.sites.map((s) => {
          const sub = submitted(s.id), t = team(s.id), active = t > 0 || d.balances.some((b) => b.site_id === s.id), low = lowCount(d.balances, s.id, d.docs, day);
          return (
            <div key={s.id} className="card pad stack" style={{ gap: 8 }}>
              <div className="siteLogo" style={{ background: '#F6F5F1', height: 64 }}><SiteLogo name={s.name} height={48} /></div>
              <div className="between"><b style={{ fontSize: 18 }}>{s.name}</b>
                <span className={`pill ${sub ? 'done' : active ? '' : 'grey'}`}>{sub ? `Submitted ${time(sub.submitted_at)}` : active ? 'Not submitted' : 'Not set up'}</span></div>
              <div className="between small"><span>Low stock</span><b className={`mono ${low ? 'low' : ''}`}>{low}</b></div>
              <div className="between small"><span>Items in store</span><b className="mono">{d.balances.filter((b) => b.site_id === s.id && b.balance > 0).length}</b></div>
              <div className="between small"><span>Store team</span><b className="mono">{t}</b></div>
            </div>
          );
        })}
      </div>
      <div className="label">Latest activity</div>
      <div className="card" style={{ overflow: 'hidden' }}><EventRows list={events(d, siteName, person, itemById).slice(0, 6)} /></div>
    </div>
  );
}

function People({ d, me, siteName, busy, act }: { d: Data; me: User; siteName: Map<string, string>; busy: string; act: Act }) {
  const [choice, setChoice] = useState<Record<string, { site: string; role: Role }>>({});
  const [edit, setEdit] = useState<{ id: string; full_name: string; phone: string; site_id: string; role: Role } | null>(null);
  const pending = d.profiles.filter((p) => p.status === 'pending');
  const active = d.profiles.filter((p) => p.status === 'approved');
  const off = d.profiles.filter((p) => p.status === 'declined' || p.status === 'removed');
  const pick = (p: Profile) => choice[p.id] ?? { site: p.site_id ?? d.sites[0]?.id ?? '', role: p.role };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="label">Waiting for approval ({pending.length})</div>
      {!pending.length && <div className="note ok">No one is waiting. New sign-ups appear here.</div>}
      {pending.map((p) => {
        const c = pick(p);
        return (
          <div key={p.id} className="card pad admPerson enter" style={{ borderLeft: '5px solid var(--accent)' }}>
            <div className="admAvatar">{p.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 180 }}><b style={{ fontSize: 17 }}>{p.full_name}</b><div className="small muted">{p.email}{p.phone ? ` · ${p.phone}` : ''} · asked {niceDate(dayOf(p.created_at))} {time(p.created_at)}</div></div>
            <label className="field" style={{ width: 160 }}><span>Site</span>
              <select className="select" style={{ minHeight: 42 }} value={c.site} onChange={(e) => setChoice({ ...choice, [p.id]: { ...c, site: e.target.value } })}>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field" style={{ width: 150 }}><span>Role</span>
              <select className="select" style={{ minHeight: 42 }} value={c.role} onChange={(e) => setChoice({ ...choice, [p.id]: { ...c, role: e.target.value as Role } })}>{(['store', 'assistant', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
            <div className="row">
              <button className="btn ok admSm" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { status: 'approved', site_id: c.site, role: c.role }))}>Approve</button>
              <button className="btn ghost admSm" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { status: 'declined' }))}>Decline</button>
            </div>
          </div>
        );
      })}
      <div className="label" style={{ marginTop: 6 }}>Has access ({active.length})</div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {active.map((p) => edit?.id === p.id ? (
          <div key={p.id} className="admRow admEdit">
            <label className="field" style={{ flex: '2 1 200px' }}><span>Full name</span><input className="input" value={edit.full_name} autoFocus onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></label>
            <label className="field" style={{ flex: '1 1 150px' }}><span>Phone (optional)</span><input className="input" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="field" style={{ flex: '1 1 150px' }}><span>Site</span><select className="select" value={edit.site_id} onChange={(e) => setEdit({ ...edit, site_id: e.target.value })}>{d.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label className="field" style={{ flex: '1 1 150px' }}><span>Role</span><select className="select" value={edit.role} disabled={p.email === me.email} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>{(['store', 'assistant', 'admin'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
            <div className="row" style={{ alignSelf: 'flex-end' }}>
              <button className="btn ok admSm" disabled={!!busy || !edit.full_name.trim()} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { full_name: edit.full_name.trim(), phone: edit.phone.trim() || null, site_id: edit.site_id, ...(p.email === me.email ? {} : { role: edit.role }) })).then(() => setEdit(null))}>Save</button>
              <button className="btn ghost admSm" onClick={() => setEdit(null)}>Cancel</button>
            </div>
            <div className="small muted" style={{ flexBasis: '100%' }}>Email: {p.email} (the sign-in email cannot be changed here).</div>
          </div>
        ) : (
          <div key={p.id} className="admRow">
            <b style={{ flex: 1 }}>{p.full_name}<div className="small muted" style={{ fontWeight: 400 }}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></b>
            <span style={{ width: 140 }}>{p.role === 'admin' ? 'All sites' : siteName.get(p.site_id ?? '') ?? '–'}</span>
            <span style={{ width: 120 }}><span className={`pill ${p.role === 'admin' ? '' : 'done'}`}>{ROLE_LABEL[p.role]}</span></span>
            <span style={{ width: 170 }} className="small">{p.role === 'admin' ? '' : p.training_waived ? <>Training skipped · <button className="btn link small" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { training_waived: false }))}>Undo</button></>
              : (p.training_days?.length ?? 0) >= TRAINING_DAYS ? <span className="pill done">Trained</span>
                : <>Training {p.training_days?.length ?? 0}/{TRAINING_DAYS} · <button className="btn link small" disabled={!!busy} onClick={async () => { if (await ask({ title: `Let ${p.full_name} skip training?`, body: <p>Their store opens now (or the first stock take unlocks, if the store has no stock yet).</p>, yes: 'Skip training' })) act(p.id, () => api.admin.setProfile(p.id, { training_waived: true })); }}>Skip</button></>}</span>
            <button className="btn link" onClick={() => setEdit({ id: p.id, full_name: p.full_name, phone: p.phone ?? '', site_id: p.site_id ?? d.sites[0]?.id ?? '', role: p.role })}>Edit</button>
            <span style={{ width: 130, textAlign: 'right' }}>{p.email !== me.email && <button className="btn link" disabled={!!busy} onClick={async () => { if (await ask({ title: `Remove ${p.full_name}’s access?`, body: <p>They will no longer be able to sign in to Site Stock. You can give access back later.</p>, yes: 'Remove access', tone: 'danger' })) act(p.id, () => api.admin.setProfile(p.id, { status: 'removed' })); }}>Remove access</button>}</span>
          </div>
        ))}
      </div>
      {!!off.length && <>
        <div className="label">Declined or removed ({off.length})</div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {off.map((p) => (
            <div key={p.id} className="admRow"><span style={{ flex: 1 }}>{p.full_name} <span className="small muted">{p.email}</span></span><span className="pill grey">{p.status}</span>
              <button className="btn link" disabled={!!busy} onClick={() => act(p.id, () => api.admin.setProfile(p.id, { status: 'approved' }))}>Give access</button></div>
          ))}
        </div>
      </>}
    </div>
  );
}

function Corr({ d, siteName, person, itemById, busy, act }: { d: Data; siteName: Map<string, string>; person: Map<string, Profile>; itemById: Map<number, Item>; busy: string; act: Act }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = d.corr.filter((c) => c.status === 'pending');
  const decided = d.corr.filter((c) => c.status !== 'pending').slice(0, 30);
  const balOf = (c: CorrectionRequest) => d.balances.find((b) => b.site_id === c.site_id && b.item_id === c.item_id)?.balance;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="note info">Nothing is deleted. An approved correction is added as its own entry, so the original and the change both stay in the record.</div>
      {!pending.length && <div className="note ok">All caught up. No corrections waiting.</div>}
      {pending.map((c) => {
        const it = itemById.get(c.item_id), bal = balOf(c);
        const effect = c.kind === 'recount' ? c.to_qty - c.from_qty : (() => {
          const line = d.docs.flatMap((x) => x.lines).find((l) => l.id === c.movement_id);
          return line && (line.kind === 'issue' || line.kind === 'transfer_out') ? c.from_qty - c.to_qty : c.to_qty - c.from_qty;
        })();
        return (
          <div key={c.id} className="card pad stack enter" style={{ borderLeft: '5px solid var(--accent)', gap: 10 }}>
            <div className="between"><div><span className="pill grey">{siteName.get(c.site_id)}</span> <b style={{ fontSize: 17 }}>{c.kind === 'fix' ? 'Fix an entry' : 'Recount'}</b></div>
              <span className="small muted">{person.get(c.created_by)?.full_name} · {niceDate(dayOf(c.created_at))} {time(c.created_at)}</span></div>
            <div className="row" style={{ gap: 14, fontSize: 17, flexWrap: 'wrap' }}>
              <span>{it?.name}</span><span className="mono muted" style={{ textDecoration: 'line-through' }}>{fmt(c.from_qty)} {it?.unit}</span><span aria-hidden>→</span>
              <b className="mono low">{fmt(c.to_qty)} {it?.unit}</b>
              {bal != null && <span className="small muted">Balance {fmt(bal)} → {fmt(bal + effect)}</span>}
            </div>
            <div className="small muted">Reason: <b style={{ color: 'var(--ink)' }}>{c.reason}</b>{c.note ? ` · ${c.note}` : ''}</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn ok admSm" disabled={!!busy} onClick={() => act(c.id, () => api.admin.decide(c.id, true, notes[c.id]))}>Approve</button>
              <button className="btn ghost admSm" disabled={!!busy} onClick={() => { if (!notes[c.id]) { setNotes({ ...notes, [c.id]: '' }); } act(c.id, () => api.admin.decide(c.id, false, notes[c.id] || 'Rejected by the admin')); }}>Reject</button>
              <input className="input" style={{ flex: 1, minWidth: 200, minHeight: 42 }} placeholder="Note to the store (optional)" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
            </div>
          </div>
        );
      })}
      {!!decided.length && <>
        <div className="label">Decided</div>
        <div className="card" style={{ overflow: 'hidden' }}>
          {decided.map((c) => {
            const it = itemById.get(c.item_id);
            return <div key={c.id} className="admRow small"><span className={`pill ${c.status === 'approved' ? 'done' : 'err'}`}>{c.status === 'approved' ? 'Approved' : 'Rejected'}</span>
              <span style={{ flex: 1 }}>{siteName.get(c.site_id)} · {c.kind === 'fix' ? 'Fix' : 'Recount'} · {it?.name} {fmt(c.from_qty)} → {fmt(c.to_qty)}{c.decision_note ? ` · “${c.decision_note}”` : ''}</span>
              <span className="muted">{c.decided_at ? niceDate(dayOf(c.decided_at)) : ''}</span></div>;
          })}
        </div>
      </>}
    </div>
  );
}

function Sites({ d, busy, act }: { d: Data; busy: string; act: Act }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [add, setAdd] = useState('');
  const [lists, setLists] = useState<Record<string, number[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<Record<string, string>>({});
  const [build, setBuild] = useState<string | null>(null);
  const [newSt, setNewSt] = useState<Structure>({ basements: 0, has_ground: true, floors: null, roof_name: null });
  const [contacts, setContacts] = useState<Record<string, AlertContact>>({});
  const [editC, setEditC] = useState<string | null>(null);
  const [cDraft, setCDraft] = useState<AlertContact>({ name: '', phone: '' });
  useEffect(() => { api.admin.alertContacts().then(setContacts).catch(() => setContacts({})); }, [d.sites]);
  useEffect(() => { Promise.all(d.sites.map((s) => api.admin.checklist(s.id).then((ids) => [s.id, ids] as const))).then((x) => setLists(Object.fromEntries(x))); }, [d.sites]);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        {d.sites.map((s) => {
          const v = names[s.id] ?? s.name;
          const people = d.profiles.filter((p) => p.site_id === s.id && p.status === 'approved').length;
          const items = d.balances.filter((b) => b.site_id === s.id).length;
          return (
            <div key={s.id} className="admRow" style={{ minHeight: 62 }}>
              <input className="input" style={{ width: 260, minHeight: 42 }} value={v} onChange={(e) => setNames({ ...names, [s.id]: e.target.value })} aria-label="Site name" />
              {v.trim() && v !== s.name && <button className="btn link" disabled={!!busy} onClick={() => act(s.id, () => api.admin.renameSite(s.id, v.trim()))}>Save</button>}
              <span className="small muted" style={{ flex: 1 }}>{people} {people === 1 ? 'person' : 'people'} · {items} items in store</span>
              <span className={`pill ${items || people ? 'done' : ''}`}>{items || people ? 'Active' : 'Set up'}</span>
              <div className="siteExtra">
                <div className="siteWeek">
                  <span className="label">Project week</span>
                  <span>{s.week_anchor_no ? <>Week <b>{s.week_anchor_no}</b> set on {niceDate(s.week_anchor_date!)} · counts on by itself, pausing weeks with no entries</> : <span className="muted">Not set. The first stock take asks for it.</span>}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <input className="input num" style={{ width: 90, minHeight: 40 }} inputMode="numeric" placeholder="This week" value={weeks[s.id] ?? ''} onChange={(e) => setWeeks({ ...weeks, [s.id]: e.target.value.replace(/\D/g, '') })} aria-label="Project week this week" />
                    <button className="btn link" disabled={!(Number(weeks[s.id]) >= 1) || !!busy} onClick={() => act(`w${s.id}`, async () => { await api.admin.setProjectWeek(s.id, Number(weeks[s.id])); setWeeks({ ...weeks, [s.id]: '' }); })}>Set this week</button>
                  </span>
                </div>
                <div className="siteWeek">
                  <span className="label">Building</span>
                  <span>{describeStructure(s)}</span>
                  <button className="btn link" onClick={() => setBuild(build === s.id ? null : s.id)}>{build === s.id ? 'Close' : 'Edit floors'}</button>
                </div>
                {build === s.id && (
                  <StructureFields value={structOf(s)} busy={!!busy} saveLabel="Save floors"
                    onSave={(st) => act(`b${s.id}`, async () => { await api.admin.setStructure(s.id, st); setBuild(null); })} />
                )}
                <div className="siteWeek">
                  <span className="label">Site admin (WhatsApp)</span>
                  <span>{contacts[s.id]?.phone ? <><b>{contacts[s.id].name || 'Site admin'}</b> · {contacts[s.id].phone}</> : <span className="muted">Not set. Stock alerts open WhatsApp without a contact.</span>}</span>
                  <button className="btn link" onClick={() => { setEditC(editC === s.id ? null : s.id); setCDraft({ name: contacts[s.id]?.name ?? '', phone: contacts[s.id]?.phone ?? '' }); }}>{editC === s.id ? 'Close' : contacts[s.id]?.phone ? 'Change' : 'Add'}</button>
                </div>
                {editC === s.id && (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', padding: '4px 0 8px' }}>
                    <input className="input" style={{ flex: '1 1 200px', minHeight: 42 }} placeholder="Name, e.g. Eng. Juma Otieno" value={cDraft.name ?? ''} onChange={(e) => setCDraft({ ...cDraft, name: e.target.value })} aria-label="Site admin name" />
                    <input className="input mono" style={{ flex: '1 1 160px', minHeight: 42 }} inputMode="tel" placeholder="WhatsApp number, e.g. 0712 345 678" value={cDraft.phone ?? ''} onChange={(e) => setCDraft({ ...cDraft, phone: e.target.value })} aria-label="Site admin WhatsApp number" />
                    <button className="btn sm" disabled={!!busy || !(cDraft.phone ?? '').replace(/\D/g, '')} onClick={() => act(`c${s.id}`, async () => { const c = { name: (cDraft.name ?? '').trim() || null, phone: (cDraft.phone ?? '').trim() || null }; await api.admin.setAlertContact(s.id, c); setContacts({ ...contacts, [s.id]: c }); setEditC(null); })}>Save</button>
                  </div>
                )}
                <div className="siteWeek">
                  <span className="label">Stock take list</span>
                  <span>{lists[s.id] ? <><b>{lists[s.id].length}</b> items listed (no quantities)</> : '…'}</span>
                  <button className="btn link" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? 'Close' : 'Edit list'}</button>
                </div>
                {open === s.id && <ChecklistEditor d={d} siteId={s.id} ids={lists[s.id] ?? []} onSaved={(ids) => setLists({ ...lists, [s.id]: ids })} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card pad stack" style={{ gap: 12 }}>
        <b>Register a new site</b>
        <input className="input" style={{ maxWidth: 360 }} placeholder="Site name" value={add} onChange={(e) => setAdd(e.target.value)} aria-label="New site name" />
        <StructureFields value={newSt} busy={!!busy || !add.trim()} saveLabel="+ Add site" onChange={setNewSt}
          onSave={(st) => act('add', async () => { await api.admin.addSite(add.trim(), st); setAdd(''); setNewSt({ basements: 0, has_ground: true, floors: null, roof_name: null }); })} />
      </div>
      <div className="small muted">Each site has its own store, balances and team. The company name shows above the site name everywhere.</div>
    </div>
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
        {!!inStore.length && <button className="btn ghost admSm" onClick={() => setList([...list, ...inStore])}>+ Add the {inStore.length} items now in this store</button>}
      </div>
      <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Paste a list of item names</summary>
        <textarea className="input" style={{ minHeight: 90, padding: 10 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="One item per line, e.g.&#10;Cement&#10;T12 Bars" />
        <button className="btn link" disabled={!paste.trim()} onClick={addPaste}>Add matching items</button>
      </details>
      <div className="ckChips">
        {list.map((id) => <span key={id} className="ckChip">{byId.get(id)?.name ?? id}<button aria-label="Remove" onClick={() => setList(list.filter((x) => x !== id))}>×</button></span>)}
        {!list.length && <span className="muted small">No items yet.</span>}
      </div>
      <div className="row"><button className="btn ok admSm" disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save list (${list.length})`}</button><span className="small muted">The store prints this list, counts, then types the quantities.</span></div>
    </div>
  );
}

function Items({ d, busy, act }: { d: Data; busy: string; act: Act }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id: number; name: string; unit: string } | null>(null);
  const [newItem, setNewItem] = useState({ name: '', unit: 'Pcs' });
  const units = useMemo(() => [...new Set(d.items.map((i) => i.unit))].sort(), [d.items]);
  const where = useMemo(() => {
    const m = new Map<number, number>();
    d.balances.forEach((b) => m.set(b.item_id, (m.get(b.item_id) ?? 0) + 1));
    return m;
  }, [d.balances]);
  const dupes = useMemo(() => {
    const g = new Map<string, Item[]>();
    d.items.forEach((i) => { const k = norm(i.name); g.set(k, [...(g.get(k) ?? []), i]); });
    return [...g.values()].filter((x) => x.length > 1).slice(0, 20);
  }, [d.items]);
  const s = q.trim().toLowerCase();
  const shown = s ? d.items.filter((i) => i.name.toLowerCase().includes(s)).slice(0, 80) : d.items.slice(0, 40);
  return (
    <div className="stack" style={{ gap: 14 }}>
      {!!dupes.length && <div className="note"><b>{dupes.length} possible duplicate{dupes.length === 1 ? '' : 's'} found.</b> Merging keeps one name and moves all history to it.</div>}
      {dupes.map((g) => (
        <div key={g[0].id} className="card pad row" style={{ flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 220 }}>{g.map((i) => `“${i.name}” (${i.unit})`).join(' and ')}</span>
          {g.slice(0, 2).map((keep, k) => {
            const drop = g[1 - k];
            return <button key={keep.id} className="btn ghost admSm" disabled={!!busy} onClick={async () => { if (await ask({ title: `Merge into “${keep.name}”?`, body: <p>All history of “{drop.name}” moves to “{keep.name}”, and “{drop.name}” disappears from the list.</p>, yes: 'Merge' })) act(`m${keep.id}`, () => api.admin.mergeItems(keep.id, drop.id)); }}>Keep “{keep.name}”</button>;
          })}
        </div>
      ))}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input className="search" style={{ flex: 1, minWidth: 220 }} type="search" placeholder={`Search ${d.items.length.toLocaleString()} items`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="admRow admHead"><span style={{ flex: 1 }}>Item</span><span style={{ width: 120 }}>Unit</span><span style={{ width: 110 }}>In stores</span><span style={{ width: 90 }}></span></div>
        {shown.map((i) => edit?.id === i.id ? (
          <div key={i.id} className="admRow">
            <input className="input" style={{ flex: 1, minHeight: 40 }} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Item name" />
            <select className="select" style={{ width: 120, minHeight: 40 }} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>
            <span style={{ width: 200, textAlign: 'right' }}>
              <button className="btn link" disabled={!!busy || !edit.name.trim()} onClick={() => act(`i${i.id}`, async () => { await api.admin.updateItem(i.id, edit.name.trim(), edit.unit); setEdit(null); })}>Save</button>
              <button className="btn link" onClick={() => setEdit(null)}>Cancel</button></span>
          </div>
        ) : (
          <div key={i.id} className="admRow"><b style={{ flex: 1 }}>{i.name}</b><span className="mono" style={{ width: 120 }}>{i.unit}</span><span className="small muted" style={{ width: 110 }}>{where.get(i.id) ? `${where.get(i.id)} site${where.get(i.id) === 1 ? '' : 's'}` : '–'}</span>
            <span style={{ width: 90, textAlign: 'right' }}><button className="btn link" onClick={() => setEdit({ id: i.id, name: i.name, unit: i.unit })}>Edit</button></span></div>
        ))}
        {!shown.length && <div className="pad muted">No items match.</div>}
      </div>
      {!s && <div className="small muted">Showing the first 40. Search to find any item.</div>}
      <div className="card pad row" style={{ flexWrap: 'wrap' }}>
        <b>Add an item</b>
        <input className="input" style={{ flex: 1, minWidth: 220, minHeight: 42 }} placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
        <select className="select" style={{ width: 120, minHeight: 42 }} value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>
        <button className="btn accent admSm" disabled={!newItem.name.trim() || !!busy} onClick={() => act('newitem', async () => { await api.addItem(newItem.name.trim(), newItem.unit); setNewItem({ name: '', unit: 'Pcs' }); })}>Add</button>
      </div>
    </div>
  );
}

function Reorder({ d, busy, act }: { d: Data; busy: string; act: Act }) {
  const [site, setSite] = useState(d.sites[0]?.id ?? '');
  const [vals, setVals] = useState<Record<string, string>>({});
  const rows = d.balances.filter((b) => b.site_id === site).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="seg" role="group" aria-label="Site" style={{ display: 'flex', flexWrap: 'wrap' }}>
        {d.sites.map((s) => <button key={s.id} aria-pressed={site === s.id} onClick={() => setSite(s.id)}>{s.name}</button>)}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="admRow admHead"><span style={{ flex: 1 }}>Item</span><span style={{ width: 130, textAlign: 'right' }}>In store</span><span style={{ width: 200, textAlign: 'right' }}>Reorder at</span><span style={{ width: 60 }}></span></div>
        {rows.map((b) => {
          const key = `${site}:${b.item_id}`, cur = b.reorder_level == null ? '' : String(b.reorder_level), v = vals[key] ?? cur;
          const low = b.reorder_level != null && b.balance <= b.reorder_level;
          return (
            <div key={key} className="admRow">
              <b style={{ flex: 1 }}>{b.name}</b>
              <span className={`mono ${low ? 'low' : ''}`} style={{ width: 130, textAlign: 'right' }}>{fmt(b.balance)} {b.unit}</span>
              <span style={{ width: 200, display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                <input className="input num" style={{ width: 90, minHeight: 38 }} inputMode="decimal" value={v} placeholder="Not set" aria-label={`Reorder level for ${b.name}`} onChange={(e) => setVals({ ...vals, [key]: e.target.value.replace(/[^0-9.]/g, '') })} />
                {v !== cur && <button className="btn link" disabled={!!busy} onClick={() => act(key, () => api.admin.setReorder(site, b.item_id, v === '' ? null : Number(v)))}>Save</button>}
              </span>
              <span style={{ width: 60, textAlign: 'right' }}>{low && <span className="lowTag">Low</span>}</span>
            </div>
          );
        })}
        {!rows.length && <div className="pad muted">No items in this store yet. They appear after the opening count.</div>}
      </div>
      <div className="small muted">Agreed with each site manager. When stock falls to this level, the item shows LOW on that store’s dashboard.</div>
    </div>
  );
}

function Log({ d, siteName, person, itemById }: { d: Data; siteName: Map<string, string>; person: Map<string, Profile>; itemById: Map<number, Item> }) {
  const [f, setF] = useState('All');
  const all = events(d, siteName, person, itemById);
  const list = f === 'All' ? all : all.filter((e) => e.site === f);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="seg" role="group" aria-label="Site" style={{ display: 'flex', flexWrap: 'wrap' }}>
        {['All', ...d.sites.map((s) => s.name)].map((n) => <button key={n} aria-pressed={f === n} onClick={() => setF(n)}>{n}</button>)}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}><EventRows list={list.slice(0, 200)} /></div>
      <div className="small muted">Last 14 days of entries, plus every sign-up and correction.</div>
    </div>
  );
}

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
      <button className="btn accent admSm" style={{ alignSelf: 'flex-start' }} disabled={busy || !v.floors} onClick={() => onSave(v)}>{saveLabel}</button>
    </div>
  );
}
