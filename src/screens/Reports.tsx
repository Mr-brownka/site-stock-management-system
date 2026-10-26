import { useEffect, useMemo, useState } from 'react';
import { DateRange } from '../components/DateRange';
import { toast } from '../components/feedback';
import { Icon, Num } from '../components/fx';
import { fmt, ItemPicker } from '../components/ui';
import { api } from '../lib/api';
import { addDays } from '../lib/dates';
import { REPORTS, type Ctx, type Def, type Report } from '../lib/reports';
import { useData } from '../lib/store';
import { BackPill } from '../components/BackPill';
import type { CorrectionRequest, Doc, Item, Submission } from '../lib/types';

const D = (d: string) => new Date(d + 'T00:00:00Z');
const nice = (d: string) => D(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekStart = (d: string) => addDays(d, -((D(d).getUTCDay() + 6) % 7));
const monthStart = (d: string) => `${d.slice(0, 8)}01`;
const prevMonthEnd = (d: string) => addDays(monthStart(d), -1);

function presets(today: string) {
  return [
    { k: 'today', label: 'Today', from: today, to: today },
    { k: 'yday', label: 'Yesterday', from: addDays(today, -1), to: addDays(today, -1) },
    { k: 'week', label: 'This week', from: weekStart(today), to: today },
    { k: 'lweek', label: 'Last week', from: addDays(weekStart(today), -7), to: addDays(weekStart(today), -1) },
    { k: 'month', label: 'This month', from: monthStart(today), to: today },
    { k: 'lmonth', label: 'Last month', from: monthStart(prevMonthEnd(today)), to: prevMonthEnd(today) },
    { k: '30', label: 'Last 30 days', from: addDays(today, -29), to: today },
    { k: 'year', label: 'This year', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}
const GROUPS = ['Stock', 'Consumption', 'Registers', 'Planning', 'Discipline'];
const GROUP_NOTE: Record<string, string> = {
  Stock: 'What is in the store and how it got there',
  Consumption: 'Where the materials went',
  Registers: 'Every paper, entered and searchable',
  Planning: 'What to order, what to move',
  Discipline: 'How well the store is run',
};

export function Reports() {
  const { siteLabel } = useData();
  const [key, setKey] = useState<string | null>(() => { try { return sessionStorage.getItem('ssms-report'); } catch { return null; } });
  const def = REPORTS.find((r) => r.key === key) ?? null;
  const open = (k: string | null) => { setKey(k); try { if (k) sessionStorage.setItem('ssms-report', k); else sessionStorage.removeItem('ssms-report'); } catch { /* ignore */ } window.scrollTo(0, 0); };

  if (def) return <ReportView def={def} onBack={() => open(null)} />;
  return (
    <div className="phone reports">
      <header className="top">
        <BackPill />
        <div className="kicker"><span>{siteLabel}</span></div>
        <h1>Reports</h1>
        <div className="sub">{REPORTS.length} reports from the store’s entries. Pick one, choose the dates, then download to Excel or print.</div>
      </header>
      <main className="body">
        {GROUPS.map((g, gi) => (
          <section key={g} className="stack">
            <div className="repGroupHead"><h2>{g}</h2><span className="small muted">{GROUP_NOTE[g]}</span></div>
            <div className="repGrid">
              {REPORTS.filter((r) => r.group === g).map((r, i) => (
                <button key={r.key} className="repCard enter" style={{ animationDelay: `${gi * 0.05 + i * 0.03}s` }} onClick={() => open(r.key)}>
                  <span className="repIcon"><Icon name={r.icon} size={22} /></span>
                  <span className="repText"><b>{r.title}</b><span>{r.desc}</span></span>
                  <span className="repGo"><Icon name="arrow" size={18} /></span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

function ReportView({ def, onBack }: { def: Def; onBack: () => void }) {
  const { day, balances, itemById, avgUse, isLow, siteLabel, company, site } = useData();
  const P = useMemo(() => presets(day), [day]);
  const range = def.needs.includes('range');
  const asOf = def.needs.includes('asOf');
  const [from, setFrom] = useState(range ? P[4].from : day);
  const [to, setTo] = useState(day);
  const [item, setItem] = useState<Item | null>(null);
  const [idle, setIdle] = useState(30);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [subs, setSubs] = useState<Map<string, Submission | null>>(new Map());
  const [corr, setCorr] = useState<CorrectionRequest[]>([]);
  const [q, setQ] = useState('');

  // How far back the entries are needed.
  const fetchFrom = def.key === 'opening' ? '2000-01-01' : def.key === 'idle' ? addDays(day, -Math.max(idle, 90)) : def.key === 'reorder' ? addDays(day, -14) : asOf ? to : from;
  useEffect(() => {
    let live = true; setDocs(null);
    api.documents(fetchFrom, day).then((d) => { if (live) setDocs(d); }).catch((e) => toast(String(e.message ?? e), 'warn'));
    return () => { live = false; };
  }, [fetchFrom, day]);
  useEffect(() => {
    if (!def.needs.includes('subs')) return;
    const days: string[] = [];
    for (let d = from; d <= to && d <= day && days.length < 120; d = addDays(d, 1)) days.push(d);
    Promise.all(days.map((d) => api.submission(d).then((s) => [d, s] as const))).then((x) => setSubs(new Map(x)));
  }, [def, from, to, day]);
  useEffect(() => { if (def.needs.includes('corr')) api.myCorrections().then(setCorr); }, [def]);

  const report: Report | null = useMemo(() => {
    if (!docs) return null;
    const ctx: Ctx = { from: asOf ? to : from, to, today: day, docs, balances, itemById, avgUse, isLow, subs, corrections: corr, itemId: item?.id ?? null, idleDays: idle };
    return def.build(ctx);
  }, [docs, def, from, to, day, balances, itemById, avgUse, isLow, subs, corr, item, idle, asOf]);

  const s = q.trim().toLowerCase();
  const rows = useMemo(() => (report?.rows ?? []).filter((r) => !s || Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(s))), [report, s]);
  const periodText = asOf ? `As of ${nice(to)}` : range ? (from === to ? nice(from) : `${nice(from)} – ${nice(to)}`) : `As of ${nice(day)}`;
  const totals = report?.cols.some((c) => c.total) ? Object.fromEntries(report.cols.filter((c) => c.total).map((c) => [c.key, rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0)])) : null;

  const download = async () => {
    if (!report) return;
    const XLSX = await import('xlsx');
    const head = [[`${company || 'Comex Builders'} · ${site}`], [def.title], [periodText], [`Generated ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}`], []];
    const body = [report.cols.map((c) => c.label), ...rows.map((r) => report.cols.map((c) => r[c.key] ?? ''))];
    if (totals) body.push(report.cols.map((c, i) => (i === 0 ? 'Total' : c.key in totals ? totals[c.key] : '')));
    const ws = XLSX.utils.aoa_to_sheet([...head, ...body, ...(report.note ? [[], [report.note]] : [])]);
    ws['!cols'] = report.cols.map((c) => ({ wch: c.num ? 12 : Math.min(48, Math.max(c.label.length + 2, ...rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length + 2))) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, def.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
    const fname = `${site || 'Site'} - ${def.title} - ${asOf ? to : from === to ? from : `${from} to ${to}`}.xlsx`.replace(/[\\/:*?"<>|]/g, '-');
    XLSX.writeFile(wb, fname);
    toast('Excel file downloaded');
  };

  let lastGroup: string | null = null;
  return (
    <div className="phone reports">
      <header className="top">
        <BackPill label="All reports" onClick={onBack} />
        <div className="kicker"><span>{siteLabel} · REPORT</span></div>
        <h1>{def.title}</h1>
        <div className="sub">{def.desc}</div>
      </header>
      <main className="body">
        <div className="repControls card pad">
          {range && (
            <>
              <div className="label">Period</div>
              <div className="ppStrip">
                {P.map((p) => <button key={p.k} className="ppChip" aria-pressed={from === p.from && to === p.to} onClick={() => { setFrom(p.from); setTo(p.to); }}><span>{p.label}</span><b>{p.from === p.to ? nice(p.from).slice(0, -5) : `${nice(p.from).slice(0, -5)} – ${nice(p.to).slice(0, -5)}`}</b></button>)}
              </div>
              <div className="repDates"><DateRange allLabel="" value={P.some((p) => from === p.from && to === p.to) ? null : { from, to }} max={day} onChange={(r) => { if (r) { setFrom(r.from); setTo(r.to); } }} /></div>
            </>
          )}
          {asOf && (
            <>
              <div className="label">Stock at the end of</div>
              <div className="ppStrip">
                {[['Today', day], ['Yesterday', addDays(day, -1)], ['End of last week', addDays(weekStart(day), -1)], ['End of last month', prevMonthEnd(day)]].map(([l, d]) => (
                  <button key={l} className="ppChip" aria-pressed={to === d} onClick={() => setTo(d)}><span>{l}</span><b>{nice(d).slice(0, -5)}</b></button>
                ))}
                <DateRange single value={{ from: to, to }} max={day} onChange={(r) => { if (r) setTo(r.to); }} />
              </div>
            </>
          )}
          {def.needs.includes('item') && <div className="field"><span>Item</span><ItemPicker item={item} onPick={setItem} /></div>}
          {def.needs.includes('idle') && (
            <>
              <div className="label">Not issued for at least</div>
              <div className="seg">{[14, 30, 60, 90].map((n) => <button key={n} aria-pressed={idle === n} onClick={() => setIdle(n)}>{n} days</button>)}</div>
            </>
          )}
          <div className="ppSentence"><Icon name="search" size={16} />{def.title} · {periodText}{item ? ` · ${item.name}` : ''}</div>
        </div>

        {report?.tiles && (
          <div className="repTiles">
            {report.tiles.map((t) => <div key={t.label} className={`statTile ${t.tone === 'red' && Number(t.value) > 0 ? 'alert' : ''}`}><span className="label">{t.label}</span>{typeof t.value === 'number' ? <Num value={t.value} className="statBig" /> : <span className="statBig">{t.value}</span>}</div>)}
          </div>
        )}

        <div className="repBar">
          <div className="searchWrap" style={{ flex: 1 }}>
            <Icon name="search" size={18} />
            <input className="search" type="search" placeholder="Filter this report" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter this report" />
          </div>
          <button className="btn accent repBtn" disabled={!report || !rows.length} onClick={download}><Icon name="box" />Excel</button>
          <button className="btn ghost repBtn" disabled={!report || !rows.length} onClick={() => window.print()}><Icon name="card" />Print / PDF</button>
        </div>

        <div className="printHead"><b>{company || 'Comex Builders'} · {site}</b><h2>{def.title}</h2><span>{periodText}{item ? ` · ${item.name}` : ''}</span></div>

        {!report ? (
          <div className="list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skelRow"><i className="skel" style={{ width: `${40 + ((i * 17) % 40)}%` }} /><i className="skel" style={{ width: 60 }} /></div>)}</div>
        ) : !rows.length ? (
          <div className="card pad muted empty"><Icon name="chart" size={28} />{report.note && !report.cols.length ? report.note : s ? `Nothing matches “${q}”.` : 'Nothing to show for this period.'}</div>
        ) : (
          <div className="repTableWrap">
            <table className="repTable">
              <thead><tr>{report.cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const g = report.group ? String(r[report.group]) : null;
                  const head = g != null && g !== lastGroup;
                  lastGroup = g;
                  return [
                    head ? <tr key={`g${i}`} className="repGroupRow"><td colSpan={report.cols.length}>{g}</td></tr> : null,
                    <tr key={i} className={r.status === 'Low' || r.status === 'Finished' || r.status === 'Missed' ? 'flag' : ''}>
                      {report.cols.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.num ? (r[c.key] == null ? '' : fmt(Number(r[c.key]))) : String(r[c.key] ?? '')}</td>)}
                    </tr>,
                  ];
                })}
              </tbody>
              {totals && <tfoot><tr>{report.cols.map((c, i) => <td key={c.key} className={c.num ? 'num' : ''}>{i === 0 ? 'Total' : c.key in totals ? fmt(totals[c.key]) : ''}</td>)}</tr></tfoot>}
            </table>
          </div>
        )}
        {report?.note && report.cols.length > 0 && <div className="small muted">{report.note}</div>}
        <div className="small muted">{rows.length} row{rows.length === 1 ? '' : 's'}{s ? ` matching “${q}”` : ''}.</div>
      </main>
    </div>
  );
}
