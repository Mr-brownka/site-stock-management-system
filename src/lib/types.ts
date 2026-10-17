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
  /** For correction lines: the kind of line it fixes (issue, return, …) or 'recount'. */
  corrects_kind?: string | null;
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
  site_id?: string;
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

export type Role = 'store' | 'assistant' | 'admin';
export type Status = 'pending' | 'approved' | 'declined' | 'removed';

export interface User {
  email: string;
  name: string;
  role: Role;
  status: Status;
  siteId: string | null;
}

export interface SiteInfo {
  id: string;
  name: string;
  company: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: Status;
  site_id: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  site_id: string;
  role: 'store' | 'assistant';
}

export interface CorrectionInput {
  kind: 'fix' | 'recount';
  movement_id?: number | null;
  item_id: number;
  from_qty: number;
  to_qty: number;
  reason: string;
  note?: string | null;
}

export interface CorrectionRequest extends CorrectionInput {
  id: string;
  site_id: string;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  created_by: string;
  created_at: string;
  decided_at: string | null;
}

export interface SiteDoc extends Doc {
  site_id: string;
  created_by: string;
}

/** Admin-only reads and actions across all sites. */
export interface AdminApi {
  profiles(): Promise<Profile[]>;
  setProfile(id: string, patch: Partial<Pick<Profile, 'status' | 'role' | 'site_id'>>): Promise<void>;
  sites(): Promise<SiteInfo[]>;
  addSite(name: string): Promise<void>;
  renameSite(id: string, name: string): Promise<void>;
  corrections(): Promise<CorrectionRequest[]>;
  decide(id: string, approve: boolean, note?: string): Promise<void>;
  balances(): Promise<Balance[]>;
  submissions(day: string): Promise<{ site_id: string; day: string; submitted_at: string }[]>;
  documents(from: string, to: string): Promise<SiteDoc[]>;
  updateItem(id: number, name: string, unit: string): Promise<void>;
  mergeItems(keepId: number, dropId: number): Promise<void>;
  setReorder(siteId: string, itemId: number, level: number | null): Promise<void>;
}

export interface Backend {
  mode: 'live' | 'demo';
  currentUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Email a link for setting a new password. */
  sendPasswordReset(email: string): Promise<void>;
  /** True when the page was opened from a password-reset email. */
  isRecovery(): boolean;
  setPassword(password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<void>;
  signupSites(): Promise<SiteInfo[]>;
  requestCorrection(input: CorrectionInput): Promise<void>;
  myCorrections(): Promise<CorrectionRequest[]>;
  admin: AdminApi;
  /** The signed-in person's company and site, e.g. Comex Builders / Reveal. */
  siteName(): Promise<{ company: string; site: string }>;
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
