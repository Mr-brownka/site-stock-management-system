import { niceDate, weekdayName } from '../lib/dates';
import { Icon } from './fx';

export type DayKind = 'missing' | 'holiday' | 'today' | 'done' | 'closed' | 'current';
export interface DayCell { day: string; kind: DayKind; sub: string; label?: string }

/** A row of recent working days with their state: missing, closed, submitted, current, today. */
export function DayStrip({ days }: { days: DayCell[] }) {
  return (
    <ol className="dayStrip" aria-label="Recent working days">
      {days.map((d) => (
        <li key={d.day} className={`dsDay ${d.kind}`}>
          <span className="dsLabel">{d.label ?? weekdayName(d.day).toUpperCase()}</span>
          <b>{niceDate(d.day).split(' ').slice(1).join(' ')}</b>
          <span className="dsSub">{d.kind === 'done' && <Icon name="check" size={13} />}{d.sub}</span>
        </li>
      ))}
    </ol>
  );
}
