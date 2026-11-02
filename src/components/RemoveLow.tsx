import { api } from '../lib/api';
import { canEdit } from '../lib/access';
import { useData } from '../lib/store';
import type { Balance } from '../lib/types';
import { toast } from './feedback';

/** × on a Needs attention row: takes the item off the list by hand (Undo, or turn it back on in the item's details). */
export function RemoveLow({ b }: { b: Balance }) {
  const { user, refresh } = useData();
  if (!canEdit(user)) return null;
  const off = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    try {
      await api.setLowAlert(b.item_id, false); await refresh();
      toast(`${b.name} taken off Needs attention`, 'ok', { label: 'Undo', run: () => { api.setLowAlert(b.item_id, true).then(refresh).catch(() => undefined); } });
    } catch (err) { toast((err as Error).message, 'warn'); }
  };
  return <span role="button" tabIndex={0} className="rmLow" aria-label={`Take ${b.name} off Needs attention`} title="Take off this list"
    onClick={off} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') off(e as unknown as React.MouseEvent); }}>×</span>;
}
