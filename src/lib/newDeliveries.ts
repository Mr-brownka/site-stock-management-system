import { useEffect, useState } from 'react';
import { useData } from './store';

// New deliveries from Zoho: brought in since the store last opened Deliveries (per browser).
const KEY = 'ssms-deliveries-seen';
const EV = 'ssms-deliveries-seen';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

export function markDeliveriesSeen() {
  try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* blocked */ }
  window.dispatchEvent(new Event(EV));
}

/** How many deliveries came in from Zoho that haven't been looked at yet. */
export function useNewZohoDeliveries(): number {
  const { recent } = useData();
  const [seen, setSeen] = useState(read);
  useEffect(() => {
    // First time on this browser: start counting from now, so old deliveries don't all light up.
    if (!seen) { markDeliveriesSeen(); }
    const on = () => setSeen(read());
    window.addEventListener(EV, on); window.addEventListener('storage', on);
    return () => { window.removeEventListener(EV, on); window.removeEventListener('storage', on); };
  }, [seen]);
  if (!seen) return 0;
  return recent.filter((d) => d.kind === 'delivery' && d.source === 'zoho' && d.created_at > seen).length;
}
