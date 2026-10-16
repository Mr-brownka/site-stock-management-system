export type Kind = 'opening' | 'delivery' | 'issue' | 'return' | 'transfer_in' | 'transfer_out' | 'correction';

export interface Item {
  id: number;
  name: string;
  unit: string;
}

export interface DocInput {
  kind: Kind;
  doc_date: string;
  doc_time?: string | null;
  ref_no?: string | null;
  party?: string | null;
  activity?: string | null;
  gemba?: string | null;
  supervisor?: string | null;
  authorised_by?: string | null;
  vehicle?: string | null;
  reason?: string | null;
}

export interface LineInput {
  item_id: number;
  qty: number;
  subphase?: string | null;
  return_of?: number | null;
}

export interface Line {
  id: number;
  document_id: string;
  kind: Kind;
  move_date: string;
  item_id: number;
  qty: number;
  subphase: string | null;
  return_of: number | null;
}

export interface Doc extends DocInput {
  id: string;
  created_at: string;
  lines: Line[];
}

export interface Balance {
  item_id: number;
  name: string;
  unit: string;
  reorder_level: number | null;
  first_seen: string;
  balance: number;
  deliveries: number;
}

/** Names the app remembers and suggests as you type. */
export type Field = 'supplier' | 'activity' | 'issued_to' | 'supervisor' | 'site' | 'authorised_by';

export type StepKey = 'deliveries' | 'issued' | 'returns' | 'transfers';
export type StepState = 'todo' | 'none' | 'done';

export interface Submission {
  day: string;
  submitted_at: string;
  steps: Partial<Record<StepKey, StepState>>;
}

export interface User {
  email: string;
  name: string;
}

export interface Backend {
  mode: 'live' | 'demo';
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  siteName(): Promise<string>;
  items(): Promise<Item[]>;
  addItem(name: string, unit: string): Promise<Item>;
  remembered(field: Field): Promise<string[]>;
  saveDocument(doc: DocInput, lines: LineInput[]): Promise<void>;
  removeDocument(id: string): Promise<void>;
  /** Documents (with their lines) dated between from and to, inclusive. */
  documents(from: string, to: string): Promise<Doc[]>;
  /** All movement lines dated between from and to, inclusive. */
  linesBetween(from: string, to: string): Promise<Line[]>;
  balances(): Promise<Balance[]>;
  submission(day: string): Promise<Submission | null>;
  submitDay(day: string, steps: Submission['steps']): Promise<void>;
  setReorder(itemId: number, level: number | null): Promise<void>;
}

export const SUBPHASES = [
  'Preliminaries', 'Basement', 'Ground floor', '1st floor', '2nd floor', '3rd floor', '4th floor', '5th floor',
  '6th floor', '7th floor', '8th floor', '9th floor', '10th floor', 'Roof',
];

/** Stock goes up for these kinds and down for issue / transfer out. */
export function delta(kind: Kind, qty: number): number {
  return kind === 'issue' || kind === 'transfer_out' ? -qty : qty;
}
