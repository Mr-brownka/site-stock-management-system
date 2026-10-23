import type { ReactNode } from 'react';
import { niceDate, weekdayName } from '../lib/dates';
import { Icon } from './fx';

export type DayKind = 'missing' | 'holiday' | 'today' | 'done' | 'closed' | 'current';
export interface DayCell { day: string; kind: DayKind; sub: string; label?: string; /** Buttons inside the day (the missed day asks its question here). */ actions?: ReactNode }

/** A row of recent working days with their state: missing, closed, submitted, current, today. */
export function DayStrip({ days }: { days: DayCell[] }) {
  return (
    <ol className="dayStrip" aria-label="Recent working days">
      {days.map((d) => (
        <li key={d.day} className={`dsDay ${d.kind} ${d.actions ? 'ask' : ''}`}>
          <div className="dsText">
            <span className="dsLabel">{d.label ?? weekdayName(d.day).toUpperCase()}</span>
            <b>{niceDate(d.day).split(' ').slice(1).join(' ')}</b>
            <span className="dsSub">{d.kind === 'done' && <Icon name="check" size={13} />}{d.sub}</span>
          </div>
          {d.actions && <div className="dsActs">{d.actions}</div>}
        </li>
      ))}
    </ol>
  );
}
