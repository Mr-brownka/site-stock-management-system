// A new site's first count: read the uploaded sheet, then check every counted line against Zoho's item list.
import type { ZohoItem } from './types';

export interface NumCol { col: number; label: string; filled: number; sample: string[] }
export interface Table { name: string; rows: unknown[][]; start: number; nameCol: number; unitCol: number; numCols: NumCol[] }

const NAME_HEAD = /item|description|material|name|particular/i;
const UNIT_HEAD = /unit|uom|measure/i;
const letter = (c: number) => String.fromCharCode(65 + (c % 26)).repeat(Math.floor(c / 26) + 1);

/** Text Zoho and people write differently but mean the same: invisible marks, '' for ", spaces, case. */
export function norm(s: unknown) {
  return String(s ?? '').replace(/[​-‍⁠﻿]/g, '').replace(/''/g, '"').replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
/** Numbers in a name (sizes): two items with different sizes are never "close". */
const sizes = (s: string) => (s.match(/\d+(?:[./]\d+)?/g) ?? []).sort().join(',');
function bigrams(s: string) { const t = s.replace(/[^a-z0-9]/g, ''); const m = new Map<string, number>(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; }
function alike(a: string, b: string) {
  const x = bigrams(a), y = bigrams(b); let both = 0, n = 0;
  x.forEach((v, k) => { both += Math.min(v, y.get(k) ?? 0); n += v; }); y.forEach((v) => { n += v; });
  return n ? (2 * both) / n : 0;
}

/** Every word of the shorter name has a partner in the other (box ≈ boxes, metalic ≈ metallic, tee ≠ bush). */
function sameWords(a: string, b: string) {
  const w = (x: string) => x.replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((t) => t.length > 1 && !/^\d/.test(t));
  let [x, y] = [w(a), w(b)]; if (x.length > y.length) [x, y] = [y, x];
  return x.length > 0 && x.every((t) => y.some((u) => u.startsWith(t) || t.startsWith(u) || alike(t, u) >= 0.75));
}

export async function readTable(file: File): Promise<Table> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = /\.csv$/i.test(file.name) ? XLSX.read(new TextDecoder().decode(buf), { type: 'string' }) : XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  const width = Math.max(0, ...rows.slice(0, 400).map((r) => r.length));
  let start = 0, nameCol = -1, unitCol = -1;
  for (let r = 0; r < Math.min(rows.length, 15) && nameCol < 0; r++) {
    const row = rows[r].map((c) => String(c ?? ''));
    const n = row.findIndex((c) => NAME_HEAD.test(c));
    if (n >= 0) { nameCol = n; unitCol = row.findIndex((c, i) => i !== n && UNIT_HEAD.test(c)); start = r + 1; }
  }
  const isNum = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d[\d,]*(\.\d+)?\s*$/.test(v));
  if (nameCol < 0) {
    let best = -1;
    for (let c = 0; c < width; c++) {
      const t = rows.filter((r) => typeof r[c] === 'string' && /[a-z]{2}/i.test(r[c] as string) && !isNum(r[c])).length;
      if (t > best) { best = t; nameCol = c; }
    }
  }
  const head = start ? rows[start - 1] : [];
  const body = rows.slice(start);
  const numCols: NumCol[] = [];
  for (let c = 0; c < width; c++) {
    if (c === nameCol || c === unitCol) continue;
    const vals = body.map((r) => r[c]).filter((v) => v !== '' && v != null);
    const nums = vals.filter(isNum);
    if (!nums.length || nums.length < vals.length * 0.6) continue;
    numCols.push({ col: c, label: String(head[c] ?? '').trim() || `Column ${letter(c)}`, filled: vals.length, sample: body.filter((r) => r[c] !== '' && r[c] != null).slice(0, 3).map((r) => `${String(r[nameCol]).trim().slice(0, 18)} ${String(r[c])}`) });
  }
  return { name: file.name, rows: body, start, nameCol, unitCol, numCols };
}

export type Kind = 'ok' | 'close' | 'none';
export interface Line {
  key: number; row: number; raw: string; unit: string | null;
  qtyText: string; qty: number | null; qtyBad: string | null;
  kind: Kind; zoho: ZohoItem | null; suggest: ZohoItem[]; twin: number | null;
}

/** Lines with a number in the chosen column, each checked against Zoho. Lines with no number are left out. */
export function checkLines(t: Table, qtyCol: number, zoho: ZohoItem[]): { lines: Line[]; blank: number } {
  const byName = new Map<string, ZohoItem>();
  zoho.filter((z) => z.status !== 'inactive').forEach((z) => { if (!byName.has(norm(z.name))) byName.set(norm(z.name), z); });
  const lines: Line[] = [];
  let blank = 0;
  const first = new Map<string, number>();
  t.rows.forEach((r, i) => {
    const raw = String(r[t.nameCol] ?? '').replace(/[​-‍⁠﻿]/g, '').trim();
    if (!raw) return;
    const cell = r[qtyCol];
    if (cell === '' || cell == null) { blank++; return; }
    let qty: number | null = null, qtyBad: string | null = null;
    if (typeof cell === 'number') qty = cell;
    else if (cell instanceof Date) qtyBad = 'Excel turned it into a date';
    else { const s = String(cell).replace(/,/g, '').trim(); if (/^-?\d+(\.\d+)?$/.test(s)) qty = Number(s); else { const m = s.match(/-?\d+(\.\d+)?/); qty = m ? Number(m[0]) : null; qtyBad = `Written as “${s}”`; } }
    if (qty != null && qty < 0) qtyBad = 'Below 0';
    const n = norm(raw);
    let zoho = byName.get(n) ?? null, kind: Kind = zoho ? 'ok' : 'none';
    let suggest: ZohoItem[] = [];
    if (!zoho) {
      const sz = sizes(n);
      const all = [...byName.values()].map((z) => ({ z, s: alike(n, norm(z.name)), same: sizes(norm(z.name)) === sz })).sort((a, b) => b.s - a.s);
      suggest = all.slice(0, 5).map((x) => x.z);
      const top = all.find((x) => x.same && sameWords(n, norm(x.z.name)));
      if (top && top.s >= 0.78) { zoho = top.z; kind = 'close'; suggest = [top.z, ...suggest.filter((z) => z !== top.z)].slice(0, 5); }
    }
    const k = zoho ? `z:${zoho.zoho_item_id}` : `n:${n}`;
    const twin = first.has(k) ? first.get(k)! : null;
    if (twin == null) first.set(k, lines.length);
    lines.push({ key: lines.length, row: t.start + i + 1, raw, unit: t.unitCol >= 0 ? String(r[t.unitCol] ?? '').trim() || null : null, qtyText: cell instanceof Date ? cell.toLocaleDateString('en-GB') : String(cell), qty, qtyBad, kind, zoho, suggest, twin });
  });
  return { lines, blank };
}

/** The best Zoho items for what someone typed in a picker. */
export function searchZoho(q: string, zoho: ZohoItem[], skip: Set<string> = new Set(), n = 8) {
  const s = norm(q);
  if (!s) return [];
  const words = s.split(' ');
  return zoho.filter((z) => z.status !== 'inactive' && !skip.has(z.zoho_item_id))
    .map((z) => { const zn = norm(z.name); const hit = words.every((w) => zn.includes(w)); return { z, sc: (hit ? 1 : 0) + alike(s, zn) }; })
    .filter((x) => x.sc > 0.45).sort((a, b) => b.sc - a.sc).slice(0, n).map((x) => x.z);
}
