// Sub-phases (floors) of a project, built from how the site is structured.
import { SUBPHASES, type Structure } from './types';

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** e.g. Preliminaries, Basement, Ground floor, 1st floor … 16th floor, Rooftop terrace. */
export function subphasesFor(s?: Structure | null): string[] {
  if (!s?.floors) return SUBPHASES;
  const out = ['Preliminaries'];
  for (let b = s.basements; b >= 1; b--) out.push(s.basements === 1 ? 'Basement' : `Basement ${b}`);
  if (s.has_ground) out.push('Ground floor');
  for (let f = 1; f <= s.floors; f++) out.push(`${ord(f)} floor`);
  if (s.roof_name?.trim()) out.push(s.roof_name.trim());
  return out;
}

/** Sorts sub-phases bottom to top, whatever list they came from. */
export function subphaseRank(name: string): number {
  const n = name.toLowerCase();
  if (n.startsWith('prelim')) return 0;
  const b = n.match(/^basement\s*(\d+)?/);
  if (b) return 50 - Number(b[1] ?? 1);
  if (n.startsWith('ground')) return 100;
  const f = n.match(/^(\d+)/);
  if (f) return 100 + Number(f[1]);
  if (n.includes('roof')) return 900;
  return 999;
}

export const describeStructure = (s?: Partial<Structure> | null) => !s?.floors ? 'Not set' :
  [s.basements ? `${s.basements} basement${s.basements === 1 ? '' : 's'}` : null, s.has_ground ? 'ground floor' : null, `${s.floors} floors`, s.roof_name || null].filter(Boolean).join(' · ');
