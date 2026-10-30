import { Icon } from '../components/fx';
import { AlertButton } from '../components/StockAlert';
import { fmt } from '../components/ui';
import { useData } from '../lib/store';
import type { Balance } from '../lib/types';
import { Pill, PTop } from './PhoneUI';

/** Running low (design B): each item a card with a ring of days left, coloured by how soon. */
export function PhoneLow() {
  const { lowItems, daysLeft, go } = useData();
  const days = (b: Balance) => (b.balance <= 0 ? 0 : (() => { const d = daysLeft(b); return d == null ? null : Math.max(0, Math.round(d)); })());
  const list = [...lowItems].sort((a, b) => (days(a) ?? 1e9) - (days(b) ?? 1e9));
  const fin = list.filter((b) => b.balance <= 0).length;
  const soon = list.filter((b) => b.balance > 0 && (days(b) ?? 99) <= 3).length;
  const later = list.length - fin - soon;
  const open = (b: Balance) => { try { sessionStorage.setItem('ssms-bal-item', String(b.item_id)); } catch { /* ignore */ } go('balances'); };
  return (
    <div className="pPage pGrey pLow">
      <PTop title="Running low" back="home" />
      <div className="pLowChips">{fin > 0 && <Pill tone="red">{fin} finished</Pill>}{soon > 0 && <Pill tone="amb">{soon} within 3 days</Pill>}{later > 0 && <Pill tone="grey">{later} later</Pill>}</div>
      {!list.length && <div className="pEmpty">Nothing is running low. All good.</div>}
      <div className="pLowList">
        {list.map((b, i) => {
          const d = days(b);
          const tone = b.balance <= 0 || (d != null && d <= 1) ? 'red' : d != null && d <= 3 ? 'amb' : 'ink';
          const r = 26, c = 2 * Math.PI * r;
          const pct = b.balance <= 0 ? 0 : d == null ? 0.5 : Math.min(1, d / 14);
          return (
            <button key={b.item_id} className={`pLowCard ${tone}`} style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }} onClick={() => open(b)}>
              <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F3F2" strokeWidth="7" />
                <circle className="pRing" cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 32 32)" />
                <text x="32" y="37" textAnchor="middle">{b.balance <= 0 ? '0' : d == null ? '–' : `${d}d`}</text>
              </svg>
              <span className="pLowT"><b>{b.name}</b><small>{fmt(b.balance)} {b.unit}{b.reorder_level != null ? ` · reorder at ${fmt(b.reorder_level)}` : ''}</small>
                <em>{b.balance <= 0 ? 'Finished' : d == null ? 'Low' : d === 0 ? 'Runs out today' : `${d} day${d === 1 ? '' : 's'} left`}</em></span>
              <Icon name="chevR" size={18} />
            </button>
          );
        })}
      </div>
      {list.length > 0 && <footer className="pFoot pLowFoot"><AlertButton /></footer>}
    </div>
  );
}
