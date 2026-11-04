import { useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './fx';
import { toast } from './feedback';

/** 31 · design C: subscribe once. The person's calendar then shows every expected delivery by itself and keeps it up to date. */
export function CalendarFeed({ compact = false }: { compact?: boolean }) {
  const dev = api.device;
  const [link, setLink] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!dev || api.mode !== 'live') return null;
  const get = async () => {
    if (link) return link;
    setBusy(true);
    try { const l = await dev.calendarLink(); setLink(l); return l; } catch (e) { toast((e as Error).message, 'warn'); return null; } finally { setBusy(false); }
  };
  const webcal = (l: string) => l.replace(/^https:/, 'webcal:');
  const copy = async () => {
    const l = await get(); if (!l) return;
    try { await navigator.clipboard.writeText(l); toast('Calendar link copied. In Outlook or another calendar, choose “Add from internet / subscribe” and paste it.', 'ok'); }
    catch { window.prompt?.('Copy this calendar link', l); }
  };
  return (
    <section className={`calFeed ${compact ? 'compact' : ''}`} aria-label="Deliveries in your calendar">
      <span className="calIc" aria-hidden="true"><Icon name="calendar" size={18} /></span>
      <span className="calT"><b>Deliveries in your calendar</b><small>Every delivery Zoho expects here, added and kept up to date by itself. Late or cancelled ones drop off.</small></span>
      <div className="calActs">
        <button type="button" className="btn sm calAdd" aria-expanded={open} disabled={busy} onClick={async () => { if (await get()) setOpen(!open); }}>{busy ? 'Getting your link…' : 'Add to my calendar'}<Icon name="sort" size={13} /></button>
        {open && link && (
          <div className="calMenu" role="menu">
            <a role="menuitem" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal(link))}`} target="_blank" rel="noopener">Google Calendar<small>Android phones and Gmail</small></a>
            <a role="menuitem" href={webcal(link)}>iPhone, Mac or Outlook<small>Opens your calendar app to subscribe</small></a>
            <button role="menuitem" type="button" onClick={copy}>Copy the link<small>For any other calendar</small></button>
            <button role="menuitem" type="button" className="calReset" onClick={async () => { setBusy(true); try { setLink(await dev.calendarLink(true)); toast('New link made. The old one stops working; add the new one to your calendar.', 'ok'); } catch (e) { toast((e as Error).message, 'warn'); } finally { setBusy(false); } }}>Make a new link<small>If the old one was shared by mistake</small></button>
          </div>
        )}
      </div>
    </section>
  );
}
