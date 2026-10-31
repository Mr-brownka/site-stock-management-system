import { useEffect, useState } from 'react';

export const GOLD = '#FCA72D';
const INK = '#121315';
const LIGHT = '#F2F3F1';

/** The Site Stock mark: a crate with a tick (stock, checked). */
export function CrateMark({ size = 40, tile = 'dark', animate = false }: { size?: number; tile?: 'dark' | 'light' | 'none'; animate?: boolean }) {
  const left = tile === 'light' ? INK : LIGHT;
  const tick = tile === 'light' ? LIGHT : INK;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={animate ? 'crate play' : 'crate'} role="img" aria-label="Site Stock">
      {tile !== 'none' && <rect width="64" height="64" rx="15" fill={tile === 'dark' ? '#1E2322' : '#FFFFFF'} />}
      <polygon className="c-l" points="11,21 32,32 32,55 11,44" fill={left} />
      <polygon className="c-r" points="32,32 53,21 53,44 32,55" fill="#9AA3A0" />
      <polygon className="c-t" points="32,10 53,21 32,32 11,21" fill={GOLD} />
      <polyline className="c-k" points="17,36 22,41 28,33" fill="none" stroke={tick} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Comex Builders Ltd logo, redrawn as a vector from the company's file (sharp at any size).
 *  `dark` turns "COMEX" white for the dark menu. `hatOnly` shows just the hard hat (collapsed menu).
 *  The hat settles in and the crane hook swings when it first appears and on hover. */
export function ComexLogo({ dark = false, width = 176, hatOnly = false }: { dark?: boolean; width?: number; hatOnly?: boolean }) {
  const ink = dark ? '#FFFFFF' : '#2B2B2B';
  return (
    <svg className="comexLogo" viewBox={hatOnly ? '36 4 104 60' : '22 4 144 76'} width={width} role="img" aria-label="Comex Builders Ltd">
      <g className="clHat">
        <path d="M40 48 C48 44 56 41 62 38 C64 20 80 9 102 9 C122 9 134 22 135 44 L135 48 Z" fill="#FBB03B" />
        <path className="clShine" d="M66 31 C80 17 112 13 128 25" fill="none" stroke="#FDCB7A" strokeWidth="3" strokeLinecap="round" />
        <circle cx="92.5" cy="20.8" r="1.1" fill="#E58227" /><circle cx="86" cy="24.5" r="1.1" fill="#E58227" />
        <circle cx="92.5" cy="24.5" r="1.1" fill="#E58227" /><circle cx="99" cy="24.5" r="1.1" fill="#E58227" />
        <circle cx="92.5" cy="28.2" r="1.1" fill="#E58227" />
        <rect x="86" y="37" width="13" height="9" rx="1" fill="#E58227" />
      </g>
      <g className="clHook">
        <line x1="133.5" y1="48" x2="133.5" y2="53" stroke={dark ? '#C9D0CD' : '#6B6B6B'} strokeWidth="1" />
        <path d="M131.5 53 h4 v3.5 a2 2 0 0 1 -4 0 z" fill="#E58227" />
      </g>
      {!hatOnly && <>
        <text className="clT1" x="90" y="61" textAnchor="middle" fontFamily="Montserrat, 'Segoe UI', sans-serif" fontSize="9" fontWeight="700" fill={ink} textLength="68" lengthAdjust="spacing">COMEX</text>
        <text className="clT2" x="93" y="75" textAnchor="middle" fontFamily="Montserrat, 'Segoe UI', sans-serif" fontSize="10" fontWeight="700" fill="#FBB03B" textLength="134" lengthAdjust="spacing">BUILDERS LTD</text>
      </>}
    </svg>
  );
}

/** Mark + "Site Stock" + company name, for headers. */
export function Wordmark({ company = 'Comex Builders', dark = true, size = 36 }: { company?: string; dark?: boolean; size?: number }) {
  return (
    <div className={`wordmark ${dark ? '' : 'onLight'}`}>
      <CrateMark size={size} tile={dark ? 'dark' : 'none'} />
      <div><b>SITE STOCK</b><small>{company.toUpperCase()}</small></div>
    </div>
  );
}

const MESSAGES = ['Getting today’s stock ready…', 'Loading balances…', 'Almost there…'];

/** Full-screen animated loading page. `intro` plays the build animation; otherwise the mark is already built. */
export function Loader({ intro = true, message }: { intro?: boolean; message?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 1600); return () => clearInterval(t); }, []);
  return (
    <div className={`loader ${intro ? 'intro' : ''}`} role="status" aria-live="polite">
      <div className="loaderGlow" aria-hidden />
      <CrateMark size={128} animate={intro} />
      <div className="loaderName"><b>SITE STOCK</b><span>COMEX BUILDERS</span></div>
      <div className="loaderBar" aria-hidden><i /></div>
      <div className="loaderMsg">{message ?? MESSAGES[i]}</div>
    </div>
  );
}

/* ───────── Site logos, redrawn as vectors ───────── */
function Tri({ p }: { p: string }) { return <polygon points={p} fill={GOLD} />; }

export function SiteLogo({ name, dark = false, height = 48 }: { name: string; dark?: boolean; height?: number }) {
  const ink = dark ? LIGHT : INK;
  const key = name.toLowerCase();
  if (key.includes('reveal')) {
    return (
      <svg viewBox="0 0 300 124" height={height} role="img" aria-label="The Reveal">
        <Tri p="1,1 1,39 39,39" /><Tri p="41,1 41,39 79,39" />
        <circle cx="20" cy="60" r="18.5" fill={ink} /><Tri p="41,41 41,79 79,79" />
        <Tri p="1,81 39,81 39,119" /><Tri p="41,81 41,119 79,119" />
        <text x="98" y="84" fontFamily="Cormorant Garamond, serif" fontSize="17" letterSpacing="1" fill={ink}>THE</text>
        <text x="95" y="119" fontFamily="Cormorant Garamond, serif" fontWeight="300" fontSize="46" letterSpacing="1.5" fill={GOLD}>REVEAL</text>
      </svg>
    );
  }
  if (key.includes('astana')) {
    return (
      <svg viewBox="0 30 300 80" height={height} role="img" aria-label="Astana Residence">
        <text x="150" y="70" textAnchor="middle" fontFamily="Playfair Display, serif" fontWeight="500" fontSize="46" letterSpacing="9" fill={ink}>ASTANA</text>
        <text x="152" y="100" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontSize="13" letterSpacing="9.5" fill={GOLD}>RESIDENCE</text>
      </svg>
    );
  }
  if (key.includes('balozi')) {
    return (
      <svg viewBox="60 0 180 160" height={height} role="img" aria-label="Balozi Suites">
        <g transform="translate(118,4)">
          <path fill={GOLD} fillRule="evenodd" d="M14 0 H34 A17 17 0 0 1 34 34 H14 Z M24 7 H33 A10 10 0 0 1 33 27 H24 Z" />
          <path fill="none" stroke={GOLD} strokeWidth="11" d="M15.6 39.4 A30 30 0 1 1 3.9 70.3" />
          <path fill={GOLD} d="M33 54 C33 54 42 65 42 71 A9 9 0 0 1 24 71 C24 65 33 54 33 54 Z" />
        </g>
        <text x="150" y="130" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="600" fontSize="34" letterSpacing="4" fill={ink}>BALOZI</text>
        <line x1="92" y1="139" x2="208" y2="139" stroke={GOLD} strokeWidth="1" />
        <text x="152" y="156" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="12" letterSpacing="10" fill={GOLD}>SUITES</text>
      </svg>
    );
  }
  if (key.includes('nyayo')) {
    return (
      <svg viewBox="50 30 230 80" height={height} role="img" aria-label="Nyayo View 2">
        <text x="132" y="72" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="600" fontSize="34" letterSpacing="4" fill={ink}>NYAYO</text>
        <circle cx="236" cy="60" r="20" fill={GOLD} />
        <text x="236" y="71" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="600" fontSize="28" fill={INK}>2</text>
        <text x="150" y="100" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontSize="13" letterSpacing="10" fill={GOLD}>VIEW</text>
      </svg>
    );
  }
  return <b style={{ fontFamily: 'var(--display)', fontSize: height * 0.5, color: ink }}>{name}</b>;
}
