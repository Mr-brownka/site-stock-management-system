import { niceDate } from './dates';
import type { CorrectionRequest, Doc, DocField, EditChanges } from './types';

/** What each box is called on each kind of paper. */
export function fieldLabel(f: DocField, kind?: Doc['kind']): string {
  switch (f) {
    case 'doc_date': return 'Date';
    case 'doc_time': return 'Time';
    case 'card_no': return 'Code';
    case 'activity': return 'Activity';
    case 'gemba': return 'Gemba';
    case 'supervisor': return 'SM / Supervisor';
    case 'ref_no': return kind === 'delivery' ? 'Delivery note no.' : kind === 'transfer_in' || kind === 'transfer_out' ? 'Transfer note no.' : 'Card no.';
    case 'party': return kind === 'delivery' ? 'Vendor' : kind === 'return' ? 'Returned by' : kind === 'transfer_in' ? 'From project' : kind === 'transfer_out' ? 'To project' : 'Issued to';
    case 'authorised_by': return kind === 'issue' ? 'Store' : 'Authorised by';
  }
}
const show = (f: DocField, v: string | null) => (!v ? '(empty)' : f === 'doc_date' ? niceDate(v) : f === 'doc_time' ? v.slice(0, 5) : v);

/** One line per change, e.g. "Date: Sat 24 Oct → Thu 22 Oct", "Cement: 10 → 12 Bags". */
export function describeEdit(c: EditChanges | null | undefined, item: (id: number) => { name: string; unit: string } | undefined, kind?: Doc['kind']): string[] {
  if (!c) return [];
  const out: string[] = [];
  for (const [f, v] of Object.entries(c.doc ?? {}) as [DocField, [string | null, string | null]][]) out.push(`${fieldLabel(f, kind)}: ${show(f, v[0])} → ${show(f, v[1])}`);
  for (const l of c.lines ?? []) {
    const a = item(l.from_item), b = l.to_item ? item(l.to_item) : undefined;
    if (b && l.to_item !== l.from_item) out.push(`Item: ${a?.name ?? 'Item'} → ${b.name}`);
    if (l.to_qty != null && l.to_qty !== l.from_qty) out.push(`${(b ?? a)?.name ?? 'Item'}: ${l.from_qty} → ${l.to_qty} ${(b ?? a)?.unit ?? ''}`.trim());
  }
  return out;
}

/** Short title for a request in a list. */
export function requestTitle(r: CorrectionRequest, item: (id: number) => { name: string; unit: string } | undefined, doc?: Doc): string {
  if (r.kind === 'edit') {
    const paper = doc ? `${doc.kind === 'issue' ? 'Card' : doc.kind === 'delivery' ? 'Delivery' : doc.kind === 'return' ? 'Return' : 'Transfer'}${doc.ref_no ? ` ${doc.ref_no}` : ''}` : 'Entry';
    const d = describeEdit(r.changes, item, doc?.kind);
    return `${paper} · ${d[0] ?? 'changes'}${d.length > 1 ? ` +${d.length - 1} more` : ''}`;
  }
  const it = item(r.item_id);
  return `${r.kind === 'fix' ? 'Fix' : 'Recount'}: ${it?.name ?? 'Item'} ${r.from_qty} → ${r.to_qty} ${it?.unit ?? ''}`.trim();
}
