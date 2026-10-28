export type Kind = 'opening' | 'delivery' | 'issue' | 'return' | 'transfer_in' | 'transfer_out' | 'correction';

export interface Item {
  id: number;
  name: string;
  unit: string;
  /** False for items added by hand that Zoho doesn't have (yet). Missing = treat as in Zoho. */
  in_zoho?: boolean;
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
  card_no?: string | null;
  reason?: string | null;
  /** Details left out on purpose, to fill in later (e.g. 'subphase', 'ref_no'). */
  to_confirm?: string[];
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
  /** Bohari's own number for the entry, per project and kind (DLV/ISS/RET/TRF). Set by the database. */
  sys_no?: number | null;
  /** 'zoho' when it was brought in from Zoho Books, with Zoho's numbers. */
  source?: string | null;
  zoho_grn?: string | null;
  zoho_po?: string | null;
  zoho_receive_id?: string | null;
  checked_at?: string | null;
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
  /** Set when the day was marked closed (holiday, no work). */
  closed_reason?: string | null;
}

export interface NewPerson { full_name: string; password: string; role: Role; site_id: string | null; access: Access; pages: string[] | null; phone: string | null }
export type Role = 'store' | 'assistant' | 'admin' | 'procurement';
/** Edit: can enter and change. Read: can only look. */
export type Access = 'edit' | 'read';
export type Status = 'pending' | 'approved' | 'declined' | 'removed';

export interface User {
  email: string;
  name: string;
  role: Role;
  status: Status;
  siteId: string | null;
  /** Working days (Mon–Sat) on which a practice evening was submitted. */
  trainingDays?: string[];
  /** The admin let this person skip training. */
  trainingWaived?: boolean;
  access?: Access;
  /** Pages the admin allows (null: every page). */
  pages?: string[] | null;
}

/** How a project is built: decides the sub-phases (floors) offered on forms. */
export interface Structure { basements: number; has_ground: boolean; floors: number | null; roof_name: string | null }

/** An unfinished entry: kept, but not counted in stock until finished. */
export interface Draft { id: string; step: StepKey; doc_date: string; label: string; payload: Record<string, unknown>; created_at: string }

export interface ZohoStatus { connected: boolean; zoho_email: string | null; last_sync_at: string | null; last_error: string | null; imported: number }
export interface ZohoSyncResult { connected: boolean; more?: boolean; imported?: number; pending?: number; seen?: number; projects?: string[]; error?: string }
export interface ZohoPending { zoho_receive_id: string; site_id: string | null; project: string | null; grn: string | null; receive_date: string | null; vendor: string | null; reason: string | null }
/** One goods-received note the Zoho check looked at, and what became of it (admin log). */
export interface ZohoLogRow { zoho_receive_id: string; site_id: string | null; project: string | null; grn: string | null; po: string | null; vendor: string | null; receive_date: string | null;
  status: 'imported' | 'linked' | 'waiting' | 'no_project' | 'other_site' | 'before_start'; detail: string | null; lines: { name: string; unit: string | null; qty: number }[] | null; updated_at: string }
/** One Zoho check: how many receives Zoho listed, and what came of them. */
export interface ZohoRun { site_id: string | null; at: string; listed: number; recent: number; imported: number; waiting: number; linked: number; other_site: number; note: string | null }
/** Incoming deliveries (Zoho purchase orders) for the dashboard. */
export interface IncomingLine { name: string; unit: string | null; ordered: number; received: number }
export interface ZohoRef { po?: string | null; po_id?: string | null; receive_id?: string | null; grn?: string | null; site_id?: string | null }
export interface IncomingOrder { id: string; po: string; vendor: string | null; /** Zoho's Sub-phase on the order (where it is for). */ subphase?: string | null; date: string; expected: string | null; status: string; lines: IncomingLine[]; lastIn?: string | null; /** First part in (part-delivered only). */ firstIn?: string | null; grns?: { id?: string; grn: string; date: string; lines: string }[] }
export interface IncomingDismissed { po_id: string; po: string | null; vendor: string | null; reason: string; dismissed_at: string }
export interface Incoming { connected: boolean; error?: string; /** Zoho Books web address for this org, e.g. https://books.zoho.com/app/838… */ web?: string; checked_at?: string; today?: string; week?: { from: string; to: string }; next?: { from: string; to: string }; thisWeek?: IncomingOrder[]; nextWeek?: IncomingOrder[]; part?: IncomingOrder[] }
export interface ZohoItemMatch { zoho_item_id: string; item_id: number | null; zoho_name: string | null; zoho_unit: string | null }
export interface ZohoConnection { user_id: string; full_name: string | null; site_id: string | null; zoho_email: string | null; last_sync_at: string | null; last_error: string | null; imported: number }

export interface AlertContact { name: string | null; phone: string | null }
export interface AlertInfo extends AlertContact { sent_at: string | null; sent_by: string | null }

export interface SiteInfo extends Partial<Structure> {
  id: string;
  name: string;
  company: string;
  /** Project week the admin set, and the date it was set (the app counts on from there). */
  week_anchor_no?: number | null;
  week_anchor_date?: string | null;
  /** WhatsApp stock alert: the site admin, and the last time it was sent. */
  alert_name?: string | null;
  alert_phone?: string | null;
  alert_sent_at?: string | null;
  alert_sent_by?: string | null;
}

/** One physical count of the store. The first one becomes the opening balances. */
export interface StockTake {
  id: string;
  count_date: string;
  start_time: string | null;
  end_time: string | null;
  counted_by: string | null;
  checked_by: string | null;
  is_first: boolean;
  status: 'recorded' | 'confirmed';
  created_at: string;
  lines: { item_id: number; qty: number }[];
}
export type StockTakeInput = Pick<StockTake, 'count_date' | 'start_time' | 'end_time' | 'counted_by' | 'checked_by' | 'lines'>;
export interface WeekInfo { anchorNo: number | null; anchorDate: string | null }

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
  training_days?: string[];
  training_waived?: boolean;
  access?: Access;
  pages?: string[] | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  site_id: string;
  role: 'store' | 'assistant';
}

/** The boxes on a paper that can be fixed. */
export type DocField = 'doc_date' | 'doc_time' | 'ref_no' | 'card_no' | 'party' | 'activity' | 'gemba' | 'supervisor' | 'authorised_by';
/** A whole-paper fix: before and after of each changed box, and each changed line. */
export interface EditChanges {
  doc?: Partial<Record<DocField, [string | null, string | null]>>;
  /** A changed line; or add: a line that was missed (movement_id 0); or remove: a line that wasn't issued. */
  lines?: { movement_id: number; from_item: number; to_item?: number; from_qty: number; to_qty?: number; add?: boolean; remove?: boolean }[];
}
/** delete: a copy of the deleted entry, kept on the request (the entry itself is gone). */
export interface DeleteSnap { doc: Partial<Doc> & { kind: Kind; doc_date: string }; lines: { item_id: number; qty: number; subphase: string | null }[] }
export interface CorrectionInput {
  kind: 'fix' | 'recount' | 'edit' | 'delete';
  /** edit: the entry being fixed. */ document_id?: string | null;
  /** edit: what changes. */ changes?: EditChanges | null;
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
  /** Add a person: they sign in with their first and last name and this password. */
  createPerson(p: NewPerson): Promise<void>;
  /** Set a new password for someone (the admin shares it). */
  setPersonPassword(userId: string, password: string): Promise<void>;
  setProfile(id: string, patch: Partial<Pick<Profile, 'status' | 'role' | 'site_id' | 'full_name' | 'phone' | 'training_waived' | 'access' | 'pages'>>): Promise<void>;
  /** Item ids on a site's stock take list. */
  checklist(siteId: string): Promise<number[]>;
  setChecklist(siteId: string, itemIds: number[]): Promise<void>;
  setProjectWeek(siteId: string, week: number): Promise<void>;
  sites(): Promise<SiteInfo[]>;
  addSite(name: string, structure?: Structure): Promise<void>;
  setStructure(id: string, structure: Structure): Promise<void>;
  renameSite(id: string, name: string): Promise<void>;
  /** Site admins who receive the WhatsApp stock alert, by site id. */
  alertContacts(): Promise<Record<string, AlertContact>>;
  setAlertContact(siteId: string, c: AlertContact): Promise<void>;
  /** Zoho: which Zoho Project each site is, who is connected, and what waits for the admin. */
  zohoProjects(): Promise<Record<string, string | null>>;
  setZohoProject(siteId: string, project: string): Promise<void>;
  zohoConnections(): Promise<ZohoConnection[]>;
  zohoPending(): Promise<ZohoPending[]>;
  assignPending(receiveId: string, siteId: string): Promise<void>;
  zohoItems(): Promise<ZohoItemMatch[]>;
  /** Everything the Zoho check has looked at (newest first), and the last checks per site. */
  zohoLog(): Promise<ZohoLogRow[]>;
  zohoRuns(): Promise<ZohoRun[]>;
  matchZohoItem(zohoItemId: string, itemId: number): Promise<void>;
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
  mode: 'live' | 'demo' | 'training';
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
  /** The day's Material Issuance Register: adds to the one already there (same item adds up), or starts it. */
  saveRegister(day: string, store: string | null, lines: { item_id: number; qty: number }[]): Promise<'new' | 'added'>;
  /** Delete an entry entirely (its lines go too, so balances go back). The admin deletes now; others ask. */
  deleteEntry(docId: string, why: string, note?: string | null): Promise<'deleted' | 'asked'>;
  admin: AdminApi;
  /** The signed-in person's company and site, e.g. Comex Builders / Reveal. */
  siteName(): Promise<{ company: string; site: string; structure?: Structure | null }>;
  /** Who gets the WhatsApp stock alert for my site, and when it was last sent. Null if not set up. */
  alertInfo(): Promise<AlertInfo | null>;
  markAlertSent(): Promise<void>;
  /** My own Zoho connection (never the key itself). Null when not connected or not set up. */
  zohoStatus(): Promise<ZohoStatus | null>;
  /** Sends the browser to Zoho's sign-in page. */
  /** Starts Zoho's sign-in. mail: also allow sending email from the person's Zoho Mail. */
  zohoConnect(mail?: boolean): Promise<void>;
  /** Sends an email from the signed-in person's Zoho Mail. */
  sendMail(m: { to: string[]; cc?: string[]; subject: string; html?: string; text?: string; attachment?: { name: string; base64: string } }): Promise<{ ok?: boolean; error?: string; reconnect?: boolean; from?: string }>;
  zohoSync(): Promise<ZohoSyncResult>;
  /** What is expected this week and next, and what is still owed on part deliveries (from Zoho). */
  incoming(): Promise<Incoming>;
  /** The exact record's page in Zoho Books (falls back to the list). */
  zohoOpen(q: ZohoRef): Promise<{ url?: string; error?: string }>;
  /** Part deliveries marked "Not coming" (hidden from Incoming). */
  dismissedIncoming(): Promise<IncomingDismissed[]>;
  dismissIncoming(o: { po_id: string; po: string; vendor: string | null; reason: string }): Promise<void>;
  restoreIncoming(poId: string): Promise<void>;
  zohoDisconnect(): Promise<void>;
  checkDelivery(docId: string): Promise<void>;
  /** Entries saved with details still to confirm, newest first. */
  unconfirmed(): Promise<Doc[]>;
  confirmDetails(docId: string, fields: Record<string, string>): Promise<void>;
  drafts(): Promise<Draft[]>;
  saveDraft(d: Omit<Draft, 'id' | 'created_at'>): Promise<void>;
  deleteDraft(id: string): Promise<void>;
  items(): Promise<Item[]>;
  addItem(name: string, unit: string): Promise<Item>;
  remembered(field: Field): Promise<string[]>;
  /** Everyone approved on my site (the store team), by name. */
  siteTeam(): Promise<string[]>;
  saveDocument(doc: DocInput, lines: LineInput[]): Promise<void>;
  removeDocument(id: string): Promise<void>;
  /** Documents (with their lines) dated between from and to, inclusive. */
  documents(from: string, to: string): Promise<Doc[]>;
  /** All movement lines dated between from and to, inclusive. */
  linesBetween(from: string, to: string): Promise<Line[]>;
  balances(): Promise<Balance[]>;
  submission(day: string): Promise<Submission | null>;
  /** Days already submitted at this site, between two dates. */
  submittedDays(from: string, to: string): Promise<string[]>;
  submitDay(day: string, steps: Submission['steps'], closedReason?: string | null): Promise<void>;
  /** The latest submitted day before the given day (null if none yet). */
  lastSubmittedDay(before: string): Promise<string | null>;
  /** Counts a training day for the signed-in person (Sundays don't count). Returns days done. */
  recordTrainingDay(day: string): Promise<number>;
  setReorder(itemId: number, level: number | null): Promise<void>;
  /** The items the admin listed for this store's stock take (no quantities). */
  checklist(): Promise<Item[]>;
  stockTakes(): Promise<StockTake[]>;
  /** Records a stock take. The first one for a store also becomes its opening balances. */
  saveStockTake(input: StockTakeInput): Promise<void>;
  projectWeek(): Promise<WeekInfo>;
  /** Store members can set it once (onboarding); after that only the admin. */
  setProjectWeek(week: number): Promise<void>;
  /** Dates (from..to) that have any entries other than stock takes, for counting project weeks. */
  entryDays(from: string, to: string): Promise<string[]>;
}

export const SUBPHASES = [
  'Preliminaries', 'Basement', 'Ground floor', '1st floor', '2nd floor', '3rd floor', '4th floor', '5th floor',
  '6th floor', '7th floor', '8th floor', '9th floor', '10th floor', 'Roof',
];

/** Stock goes up for these kinds and down for issue / transfer out. */
export function delta(kind: Kind, qty: number): number {
  return kind === 'issue' || kind === 'transfer_out' ? -qty : qty;
}
