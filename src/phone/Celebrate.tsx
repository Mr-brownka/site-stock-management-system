import { useState } from 'react';
import { createPortal } from 'react-dom';
import { buzz } from '../components/feedback';
import { useSignal } from '../lib/signals';

const BITS = [['#FCA72D', -120, -170], ['#1F7A4D', 110, -180], ['#2D5BD0', -150, -50], ['#E0731A', 140, -70], ['#7A4FD6', -60, -210], ['#FCA72D', 80, -220], ['#1F7A4D', -130, -120], ['#E0731A', 40, -190], ['#2D5BD0', 150, -150], ['#7A4FD6', -20, -160]] as const;

/** Day submitted: the tick draws itself and confetti in the app colours, then it clears by itself. */
export function Celebrate() {
  const [on, setOn] = useState<string | null>(null);
  useSignal<string>('celebrate', (t) => { setOn(typeof t === 'string' ? t : 'Day submitted'); buzz(20); setTimeout(() => setOn(null), 1900); });
  if (!on) return null;
  return createPortal(
    <div className="celeb" onClick={() => setOn(null)} role="status" aria-live="polite">
      {BITS.map(([c, x, y], i) => <i key={i} style={{ background: c, ['--x' as string]: `${x}px`, ['--y' as string]: `${y}px`, animationDelay: `${i * 18}ms` }} />)}
      <span className="celebTick"><svg width="52" height="52" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" pathLength={1} /></svg></span>
      <b>{on}</b>
    </div>, document.body);
}
