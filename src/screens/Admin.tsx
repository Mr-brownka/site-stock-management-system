import { useCallback, useEffect, useMemo, useState } from 'react';
import { fmt } from '../components/ui';
import { api } from '../lib/api';
import { addDays, niceDate, today } from '../lib/dates';
import type { Balance, CorrectionRequest, Item, Profile, Role, SiteDoc, SiteInfo, User } from '../lib/types';

type Sec = 'overview' | 'people' | 'corr' | 'sites' | 'items' | 'reorder' | 'log';
const ROLE_LABEL: Record<Role, string> = { store: 'Storekeeper', assistant: 'Assistant', admin: 'Admin' };
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
    ['overview', '◎', 'Overview'], ['people', '👤', 'People', pendingPeople.length], ['corr', '✎', 'Corrections', pendingCorr.length],
    ['sites', '⌂', 'Sites'], ['items', '▤', 'Items'], ['reorder', '⚑', 'Reorder levels'], ['log', '≡', 'Activity log'],
  ];
  const TITLE: Record<Sec, string> = { overview: 'Overview', people: 'People', corr: 'Corrections', sites: 'Sites', items: 'Items', reorder: 'Reorder levels', log: 'Activity log' };
  const company = d?.sites[0]?.company ?? '';

  return (
    <div className="adm">
      <nav className="admNav" aria-label="Admin sections">
        <div className="admBrand"><div className="mono small" style={{ color: '#B9C0BC', letterSpacing: '.08em' }}>{company.toUpperCase()}</div><div className="admTitle">Site Stock · Admin</div></div>
        {NAV.map(([k, icon, label, badge]) => (
          <button key={k} className="admLink" aria-current={sec === k ? 'page' : undefined} onClick={() => setSec(k)}>
            <span aria-hidden className="admIcon">{icon}</span><span style={{ flex: 1 }}>{label}</span>
            {!!badge && <span className="admBadge">{badge}</span>}
          </button>
        ))}
        <div className="admFoot">
          <div>Signed in as <b style={{ color: '#fff' }}>{user.name}</b></div>
          <button className="admLink" onClick={onExit}>← Check-in app</button>
          <button className="admLink" onClick={onSignOut}>Sign out</button>
        </div>
      </nav>
      <main className="admMain">
        <div className="between" style={{ alignItems: 'flex-end' }}>
          <div><div className="label">{sec === 'overview' ? `${company} · all sites` : 'Admin'}</div><h1 className="admH1">{TITLE[sec]}</h1></div>
          <button className="btn link" onClick={load}>Refresh</button>
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

function lowCount(bs: Balance[], site: string) {
  return bs.filter((b) => b.site_id === site && b.reorder_level != null && b.balance <= b.reorder_level).length;
}

interface Event { at: string; site: string; kind: string; cls: string; text: string; who: string }
function events(d: Data, siteName: Map<string, string>, person: Map<string, Profile>, itemById: Map<number, Item>): Event[] {
  const ev: Event[] = [];
  d.docs.forEach((doc) => {
    const lines = doc.lines.slice(0, 2).map((l) => `${itemById.get(l.item_id)?.name ?? 'Item'} ${fmt(l.qty)} ${itemById.get(l.item_id)?.unit ?? ''}`).join(', ');
    ev.push({ at: doc.created_at, site: siteName.get(doc.site_id) ?? '', kind: KIND_LABEL[doc.kind] ?? doc.kind, cls: doc.kind === 'correction' ? 'acc' : '',
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
          const sub = submitted(s.id), t = team(s.id), active = t > 0 || d.balances.some((b) => b.site_id === s.id), low = lowCount(d.balances, s.id);
          return (
            <div key={s.id} className="card pad stack" style={{ gap: 8 }}>
              <div className="between"><b style={{ fontSize: 18 }}>{s.name}</b>
                <span className={`pill ${sub ? 'done' : active ? '' : 'grey'}`}>{sub ? `Submitted ${time(sub.submitted_at)}` : active ? 'Not submitted' : 'Not set up'}</span></div>
              <div className="between small"><span>Low stock</span><b className={`mono ${low ? 'low' : ''}`}>{low}</b></div>
              <div className="between small"><span>Items in store</span><b className="mono">{d.balances.filter((b) => b.site_id === s.id).length}</b></div>
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
        {active.map((p) => (
          <div key={p.id} className="admRow">
            <b style={{ flex: 1 }}>{p.full_name}<div className="small muted" style={{ fontWeight: 400 }}>{p.email}</div></b>
            <span style={{ width: 140 }}>{p.role === 'admin' ? 'All sites' : siteName.get(p.site_id ?? '') ?? '–'}</span>
            <span style={{ width: 120 }}><span className={`pill ${p.role === 'admin' ? '' : 'done'}`}>{ROLE_LABEL[p.role]}</span></span>
            <span style={{ width: 130, textAlign: 'right' }}>{p.email !== me.email && <button className="btn link" disabled={!!busy} onClick={() => { if (confirm(`Remove ${p.full_name}'s access?`)) act(p.id, () => api.admin.setProfile(p.id, { status: 'removed' })); }}>Remove access</button>}</span>
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
              <input className="input" style={{ flex: 1, minWidth: 200, minHeight: 42 }} placeholder="Note to the storekeeper (optional)" value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} />
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
            </div>
          );
        })}
      </div>
      <div className="row"><input className="input" style={{ width: 260 }} placeholder="New site name" value={add} onChange={(e) => setAdd(e.target.value)} />
        <button className="btn accent admSm" disabled={!add.trim() || !!busy} onClick={() => act('add', async () => { await api.admin.addSite(add.trim()); setAdd(''); })}>+ Add site</button></div>
      <div className="small muted">Each site has its own store, balances and team. The company name shows above the site name everywhere.</div>
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
            return <button key={keep.id} className="btn ghost admSm" disabled={!!busy} onClick={() => { if (confirm(`Keep “${keep.name}” and merge “${drop.name}” into it?`)) act(`m${keep.id}`, () => api.admin.mergeItems(keep.id, drop.id)); }}>Keep “{keep.name}”</button>;
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
