// Read a stock sheet (Excel or CSV) and match each line to the item list.
import type { Item } from './types';

export interface SheetRow { raw: string; qty: number }
export type MatchKind = 'ok' | 'check' | 'new';
export interface MatchRow extends SheetRow { key: number; kind: MatchKind; item: Item | null; options: Item[] }

const NAME_HEAD = /item|description|material|name|particular/i;
const QTY_HEAD = /qty|quantity|balance|stock|count|closing|in store|amount/i;

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export async function readSheet(file: File): Promise<SheetRow[]> {
  const XLSX = await import('xlsx'); // loaded only when someone uploads a sheet
  const buf = await file.arrayBuffer();
  const wb = /\.csv$/i.test(file.name) ? XLSX.read(new TextDecoder().decode(buf), { type: 'string' }) : XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  let nameCol = -1, qtyCol = -1, start = 0;
  // 1. A header row with an item column and a quantity column.
  for (let r = 0; r < Math.min(rows.length, 15) && nameCol < 0; r++) {
    const row = rows[r].map((c) => String(c ?? ''));
    const n = row.findIndex((c) => NAME_HEAD.test(c)), q = row.findIndex((c, i) => i !== n && QTY_HEAD.test(c));
    if (n >= 0 && q >= 0) { nameCol = n; qtyCol = q; start = r + 1; }
  }
  // 2. Otherwise: the column with most text, and the column with most numbers.
  if (nameCol < 0) {
    const width = Math.max(...rows.map((r) => r.length), 0);
    let bestText = -1, bestNum = -1;
    for (let c = 0; c < width; c++) {
      const text = rows.filter((r) => typeof r[c] === 'string' && /[a-z]{2}/i.test(r[c] as string) && toNum(r[c]) === null).length;
      const nums = rows.filter((r) => toNum(r[c]) !== null).length;
      if (text > bestText) { bestText = text; nameCol = c; }
      if (nums > bestNum && c !== nameCol) { bestNum = nums; qtyCol = c; }
    }
  }
  const out: SheetRow[] = [];
  for (const r of rows.slice(start)) {
    const raw = String(r[nameCol] ?? '').trim();
    const qty = toNum(r[qtyCol]);
    if (!raw || qty === null || qty < 0 || NAME_HEAD.test(raw) && QTY_HEAD.test(String(r[qtyCol]))) continue;
    out.push({ raw, qty });
  }
  return out;
}

/** Two-column text pasted from Excel or WhatsApp: "Cement 212" or "Cement<TAB>212". */
export function readPasted(text: string): SheetRow[] {
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    const tab = t.split(/\t|;|,(?=\s*\d+(\.\d+)?\s*$)/).filter(Boolean);
    if (tab.length >= 2) return { raw: tab[0].trim(), qty: toNum(tab[tab.length - 1]) };
    const m = t.match(/^(.*?)[\s:=-]+(\d[\d,]*(\.\d+)?)\s*[a-z.]*$/i);
    return m ? { raw: m[1].trim(), qty: toNum(m[2]) } : { raw: '', qty: null };
  }).filter((r): r is SheetRow => !!r.raw && r.qty !== null && r.qty >= 0);
}

const clean = (s: string) => s.toLowerCase()
  .replace(/\by\s?(\d{1,2})\b/g, 't$1 bars')        // site "Y12" = T12 bars
  .replace(/["'’]+/g, ' inch ').replace(/\binch(es)?\b/g, ' inch ')
  .replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => new Set(clean(s).split(' ').filter((t) => t.length > 0 && !['of', 'the', 'and', 'x', 'thick', 'pcs', 'bags', 'ton'].includes(t)));

export function matchRows(rows: SheetRow[], items: Item[]): MatchRow[] {
  const index = items.map((it) => ({ it, key: clean(it.name).replace(/ /g, ''), tok: tokens(it.name) }));
  return rows.map((r, key) => {
    const k = clean(r.raw).replace(/ /g, ''), t = tokens(r.raw);
    const exact = index.find((x) => x.key === k) ?? index.find((x) => x.key === k.replace(/s$/, ''));
    if (exact) return { ...r, key, kind: 'ok', item: exact.it, options: [] };
    const scored = index.map((x) => {
      let inter = 0; t.forEach((w) => { if (x.tok.has(w) || [...x.tok].some((y) => y.length > 3 && (y.startsWith(w) || w.startsWith(y)))) inter++; });
      const score = inter / Math.max(t.size, 1) * 0.7 + inter / Math.max(x.tok.size, 1) * 0.3;
      return { it: x.it, score };
    }).filter((x) => x.score >= 0.34).sort((a, b) => b.score - a.score).slice(0, 4);
    if (!scored.length) return { ...r, key, kind: 'new', item: null, options: [] };
    if (scored[0].score >= 0.95 && (scored.length === 1 || scored[1].score < 0.8)) return { ...r, key, kind: 'ok', item: scored[0].it, options: scored.map((s) => s.it) };
    return { ...r, key, kind: 'check', item: null, options: scored.map((s) => s.it) };
  });
}
