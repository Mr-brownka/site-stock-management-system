import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { HistoryRow } from '../lib/types';
import { Icon } from './fx';

const WORD: Record<string, string> = {
  created: 'Entered', changed: 'Changed', 'line added': 'Line added', 'line removed': 'Line removed', 'qty changed': 'Quantity changed',
  'fix asked': 'Fix asked for', 'fix approved': 'Fix approved', 'fix turned down': 'Fix turned down', deleted: 'Deleted',
};
const ICON: Record<string, string> = { created: 'plus', 'fix asked': 'fix', 'fix approved': 'check', 'fix turned down': 'close', deleted: 'trash' };
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });

/** 26 · Who changed what on this entry, oldest first. Written by the database on every change, so nothing is missed. */
export function EntryHistory({ docId, phone = false }: { docId: string; phone?: boolean }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { setRows(null); api.entryHistory(docId).then(setRows).catch(() => setRows([])); }, [docId]);
  if (rows && !rows.length) return null;
  const shown = rows && !all && rows.length > 5 ? [rows[0], ...rows.slice(-3)] : rows;
  return (
    <section className={`hist ${phone ? 'ph' : ''}`} aria-label="History of this entry">
      <h3>History <small>who changed what</small></h3>
      {!rows ? <div className="stack" aria-busy="true" aria-label="Loading">{[0, 1].map((i) => <i key={i} className="skel" style={{ width: `${70 - i * 20}%` }} />)}</div> : (
        <ol>
          {shown!.map((r, i) => (
            <li key={i} className={r.action.replace(/\s+/g, '-')}>
              <span className="histDot" aria-hidden="true"><Icon name={ICON[r.action] ?? 'fix'} size={12} /></span>
              <div>
                <b>{WORD[r.action] ?? r.action}</b>{r.detail && <span className="histDet"> · {r.detail}</span>}
                <small>{r.by_name || 'Someone'} · {when(r.at)}</small>
              </div>
              {i === 0 && rows.length > 5 && !all && <button type="button" className="histMore" onClick={() => setAll(true)}>Show all {rows.length}</button>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
