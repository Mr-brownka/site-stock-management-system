import { Icon } from '../components/fx';
import { niceDate } from '../lib/dates';
import { signal } from '../lib/signals';
import { useData, type Screen } from '../lib/store';
import type { Doc } from '../lib/types';

/** Records, as its own page (phone): one tidy list, grouped. Papers first, then stock. */
const PAPERS: { screen: Screen; label: string; tone: string; kinds: Doc['kind'][]; icon: string }[] = [
  { screen: 'rec-deliveries', label: 'Deliveries', tone: 'deliveries', kinds: ['delivery'], icon: 'M12 4v12M6 10l6 6 6-6M5 20h14' },
  { screen: 'rec-issued', label: 'Issued items', tone: 'issued', kinds: ['issue'], icon: 'M12 20V8M6 14l6-6 6 6M5 4h14' },
  { screen: 'rec-returns', label: 'Returned items', tone: 'returns', kinds: ['return'], icon: 'M9 14l-5-5 5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  { screen: 'rec-transfers', label: 'Project transfers', tone: 'transfers', kinds: ['transfer_in', 'transfer_out'], icon: 'M4 8h14l-4-4M20 16H6l4 4' },
];
const t = (d: Doc) => d.doc_time?.slice(0, 5) ?? new Date(d.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

export function RecordsHub() {
  const { go, recent, docsToday, day, balances, lowItems } = useData();
  const last = (kinds: Doc['kind'][]) => [...recent, ...docsToday].filter((d) => kinds.includes(d.kind))
    .sort((a, b) => b.doc_date.localeCompare(a.doc_date) || b.created_at.localeCompare(a.created_at))[0];
  const what = (d: Doc) => {
    const who = d.kind === 'issue' ? `Card ${d.ref_no ?? ''}` : d.kind === 'return' ? (d.ref_no ? `On card ${d.ref_no}` : 'Return') : d.party || d.ref_no || 'Entry';
    return `${who} · ${d.doc_date === day ? t(d) : niceDate(d.doc_date).split(' ').slice(0, 3).join(' ')}`;
  };
  return (
    <div className="page recHub">
      <header className="rhHead enter"><span className="phKicker">Everything entered</span><h1>Records</h1></header>
      <button className="rhSearch enter" onClick={() => signal('palette')}><Icon name="search" size={18} />Search card no., note, item…</button>
      <section className="rhGroup enter" aria-label="Papers">
        <small>Papers</small>
        <div className="rhList">
          {PAPERS.map((p) => {
            const n = docsToday.filter((d) => p.kinds.includes(d.kind)).length;
            const l = last(p.kinds);
            return (
              <button key={p.screen} className={`rhRow ${p.tone}`} onClick={() => go(p.screen)}>
                <span className="rhIc" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d={p.icon} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span className="rhT"><b>{p.label}</b><small>{l ? what(l) : 'Nothing yet'}</small></span>
                <span className={`rhN ${n ? '' : 'none'}`}>{n ? `${n} today` : 'None today'}</span>
                <Icon name="arrow" size={16} />
              </button>
            );
          })}
        </div>
      </section>
      <section className="rhGroup enter" aria-label="Stock">
        <small>Stock</small>
        <div className="rhList">
          <button className="rhRow items" onClick={() => go('dashboard')}>
            <span className="rhIc" aria-hidden="true"><Icon name="box" size={18} /></span>
            <span className="rhT"><b>Items</b><small>{lowItems.length ? <em>{lowItems.length} low</em> : 'All good'}</small></span>
            <span className="rhN">{balances.length} items</span><Icon name="arrow" size={16} />
          </button>
          <button className="rhRow reports" onClick={() => go('reports')}>
            <span className="rhIc" aria-hidden="true"><Icon name="report" size={18} /></span>
            <span className="rhT"><b>Reports</b><small>Excel or print</small></span>
            <span className="rhN none">17</span><Icon name="arrow" size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
