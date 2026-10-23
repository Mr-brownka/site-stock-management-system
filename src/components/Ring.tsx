import { useEffect, useState } from 'react';

const TONES = { red: ['#D92D20', '#FBE3E1'], green: ['#1F7A4D', '#E2F1E8'], amber: ['#FCA72D', '#34403D'] } as const;

/** A ring that fills to p (0–1), with a label in the middle. Animates in. */
export function Ring({ p, label, tone = 'green', size = 56, stroke = 7, dark }: { p: number; label: string; tone?: keyof typeof TONES; size?: number; stroke?: number; dark?: boolean }) {
  const r = (size - stroke) / 2, L = 2 * Math.PI * r;
  const [c, t] = TONES[tone];
  const v = Math.max(0, Math.min(1, p));
  return (
    <span className={`ring ${dark ? 'dark' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t} strokeWidth={stroke} />
        <circle className="ringArc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${Math.max(v * L, v > 0 ? 2 : 0)} ${L}`} style={{ ['--L' as string]: L }} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{label}</b>
    </span>
  );
}

/** True on phone-sized screens (the layout puts the evening process first there). */
export function useIsPhone() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}
