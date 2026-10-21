import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { longDate, niceDate } from '../lib/dates';
import { useData } from '../lib/store';
import type { AlertInfo, Balance } from '../lib/types';
import { fmt } from './ui';
import { toast } from './feedback';
import { Icon } from './fx';

type Style = 'quick' | 'detailed' | 'order';
const STYLES: [Style, string][] = [['quick', 'Quick alert'], ['detailed', 'Detailed'], ['order', 'Order request']];

/** The chat-bubble mark used on the WhatsApp buttons (a generic speech bubble, not WhatsApp's logo). */
export const ChatMark = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M8.8 8.6c.3-.6.6-.6.9-.6h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.5.9 1.3 1.7 2.3 2.2.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.2.3.4 0 .5-.2 1.2-.8 1.5-.6.4-1.5.5-3.3-.3a9 9 0 0 1-3.9-3.9c-.6-1.3-.4-2.4.1-3Z" fill="currentColor" /></svg>
);

const readSign = (fallback: string) => { try { return localStorage.getItem('ssms-alert-sign') || fallback; } catch { return fallback; } };
const keepSign = (v: string) => { try { localStorage.setItem('ssms-alert-sign', v); } catch { /* ignore */ } };
/** Kenyan numbers typed as 07…, 7…, +254… or 254… all become 2547…, the form WhatsApp links want. */
export const waNumber = (p: string | null | undefined) => {
  const d = (p ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('254')) return d;
  if (d.startsWith('0')) return '254' + d.slice(1);
  if (d.length === 9) return '254' + d;
  return d;
};

/** The "Last sent" line and the green button under Needs attention. */
export function AlertButton() {
  const { lowItems } = useData();
  const [info, setInfo] = useState<AlertInfo | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api.alertInfo().then(setInfo).catch(() => setInfo(null));
  useEffect(() => { load(); }, []);
  if (!lowItems.length) return null;
  const sent = info?.sent_at ? new Date(info.sent_at) : null;
  return (
    <>
      <button className="alertBtn" onClick={() => setOpen(true)}><ChatMark />Send to Site manager</button>
      {sent && <div className="alertLast">Last sent: {sent.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}{info?.sent_by ? ` · by ${info.sent_by.split(' ')[0]}` : ''}</div>}
      {open && createPortal(<AlertSheet info={info} onClose={() => setOpen(false)} onSent={load} />, document.body)}
    </>
  );
}

function AlertSheet({ info, onClose, onSent }: { info: AlertInfo | null; onClose: () => void; onSent: () => void }) {
  const { lowItems, daysLeft, avgUse, site, user, day, projectWeek } = useData();
  const [style, setStyle] = useState<Style>('detailed');
  const [incFin, setIncFin] = useState(true);
  const [incLow, setIncLow] = useState(true);
  const [withNote, setWithNote] = useState(false);
  const [note, setNote] = useState('');
  const [sign, setSign] = useState(() => readSign(`${user.name.split(' ')[0]}, Stores`));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const fin = lowItems.filter((b) => b.balance <= 0);
  const low = lowItems.filter((b) => b.balance > 0).sort((a, b) => (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9));
  const left = (b: Balance) => { const d = daysLeft(b); return d == null ? null : `${Math.max(0, Math.round(d))} day${Math.round(d) === 1 ? '' : 's'} left`; };
  // Order request: about two weeks of use, rounded up to a whole number.
  const order = (b: Balance) => { const a = avgUse.get(b.item_id) ?? 0; return a > 0 ? Math.ceil(a * 14) : null; };
  const site_ = (site || 'Site').toUpperCase();
  const dateLine = `${longDate(day)}${projectWeek != null ? ` · Week ${projectWeek}` : ''}`;

  /** WhatsApp formatting: *bold*, _italic_. The same text drives the preview. */
  const text = useMemo(() => {
    const L: string[] = [];
    if (style === 'order') {
      L.push(`*${site_} · MATERIAL REQUEST*`, dateLine, '', 'Please order the following:', '');
      let n = 1;
      if (incFin) fin.forEach((b) => { const o = order(b); L.push(`${n++}. ${b.name}${o ? ` — *${fmt(o)} ${b.unit}*` : ''} _(finished)_`); });
      if (incLow) low.forEach((b) => { const o = order(b); const l = left(b); L.push(`${n++}. ${b.name}${o ? ` — *${fmt(o)} ${b.unit}*` : ''} _(${fmt(b.balance)} ${b.unit} left${l ? `, ${l}` : ''})_`); });
      L.push('', 'Quantities cover about 2 weeks of use.');
    } else {
      L.push(`*${site_} · STORE ALERT*`, dateLine);
      if (incFin && fin.length) { L.push('', style === 'detailed' ? '🔴 *Finished*' : '*Finished*'); fin.forEach((b) => L.push(`• ${b.name}`)); }
      if (incLow && low.length) {
        L.push('', style === 'detailed' ? '🟠 *Running low*' : '*Running low*');
        low.forEach((b) => { const l = left(b); L.push(style === 'detailed' ? `• ${b.name} — ${fmt(b.balance)} ${b.unit}` : `• ${b.name}${l ? ` — ${l}` : ''}`); });
      }
      if (style === 'detailed') L.push('', 'Balances as at this evening’s check-in.');
      else L.push('', 'Please arrange delivery.');
    }
    if (withNote && note.trim()) L.push('', note.trim());
    L.push(`— ${sign.trim() || user.name}`, '_Sent from Bohari_');
    return L.join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, incFin, incLow, withNote, note, sign, lowItems, day, projectWeek, site]);

  const phone = waNumber(info?.phone);
  const empty = !(incFin && fin.length) && !(incLow && low.length);
  const send = () => {
    keepSign(sign);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    api.markAlertSent().then(onSent).catch(() => undefined);
    toast(phone ? `WhatsApp opened for ${info?.name || 'the Site manager'}` : 'WhatsApp opened · choose who to send it to');
    onClose();
  };
  const copy = async () => { keepSign(sign); try { await navigator.clipboard.writeText(text); toast('Message copied'); } catch { toast('Could not copy', 'warn'); } };
  // Show WhatsApp-style formatting in the preview.
  const preview = text.split('\n').map((line, i) => (
    <span key={i}>{line.split(/(\*[^*]+\*|_[^_]+_)/g).map((part, j) => part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <b key={j}>{part.slice(1, -1)}</b> : part.startsWith('_') && part.endsWith('_') && part.length > 2 ? <i key={j}>{part.slice(1, -1)}</i> : part)}<br /></span>
  ));

  return (
    <div className="sheetBack alertBack" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="alertSheet" role="dialog" aria-modal="true" aria-labelledby="alertTitle">
        <div className="asLeft">
          <div className="asHead"><div><span className="asKicker">Needs attention · {lowItems.length} item{lowItems.length === 1 ? '' : 's'}</span><h2 id="alertTitle">Send to Site manager</h2></div><button className="iconBtn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
          <div className="asField"><span>To</span>
            <div className="asTo">
              <span className="avatar">{(info?.name || 'SA').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              <div><b>{info?.name || 'Site manager'}</b><small>{phone ? `+${phone.slice(0, 3)} ${phone.slice(3, 4)}•• ••• ${phone.slice(-3)}` : 'No number saved · WhatsApp will ask who to send it to'}</small></div>
            </div>
            {!phone && user.role === 'admin' && <small className="muted">Save the Site manager’s WhatsApp number in Admin → Sites.</small>}
          </div>
          <div className="asField"><span>Message style</span>
            <div className="asTabs" role="tablist">{STYLES.map(([k, l]) => <button key={k} role="tab" aria-pressed={style === k} onClick={() => setStyle(k)}>{l}</button>)}</div>
          </div>
          <div className="asField"><span>Include</span>
            <label className="asChk"><input type="checkbox" checked={incFin} onChange={(e) => setIncFin(e.target.checked)} />Finished items ({fin.length})</label>
            <label className="asChk"><input type="checkbox" checked={incLow} onChange={(e) => setIncLow(e.target.checked)} />Running low ({low.length})</label>
            <label className="asChk"><input type="checkbox" checked={withNote} onChange={(e) => setWithNote(e.target.checked)} />Add a short note</label>
            {withNote && <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plastering on 6th floor starts Monday" />}
          </div>
          <label className="asField"><span>Signed as</span><input className="input" value={sign} onChange={(e) => setSign(e.target.value)} placeholder="e.g. Abdirahman, H.O.Stores" /></label>
          <span className="abGrow" />
          <div className="asActs">
            <button className="btn ghost" onClick={copy}>Copy message</button>
            <button className="alertBtn big" disabled={empty} onClick={send}><ChatMark />Open in WhatsApp</button>
          </div>
          <small className="asHint">Opens WhatsApp with the message ready. You press send.</small>
        </div>
        <div className="asRight">
          <span className="asKicker grey">Preview · {niceDate(day)}</span>
          <div className="asBubble">{preview}</div>
        </div>
      </section>
    </div>
  );
}
