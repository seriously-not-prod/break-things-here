/**
 * Typed service functions for Guest Check-in, Seating Chart,
 * Guest List Enhancements and Guest Communication (BRD 3.3.1, 3.3.3).
 * All requests go through the shared api client (credentials: 'include',
 * automatic XSRF header injection, Bearer token attachment).
 *
 * Issues #387 (check-in) and #386 (seating).
 */
import { api, apiFetch } from '../lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Canonical RSVP taxonomy (#770) — single source of truth for RSVP status. */
export type CanonicalRsvpStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'maybe'
  | 'waitlist'
  | 'cancelled'
  | 'checked_in'
  | 'no_show';

/** @deprecated Use CanonicalRsvpStatus. Kept for backward-compat imports. */
export type RsvpStatus = CanonicalRsvpStatus;
export type DietaryRestriction =
  | 'None'
  | 'Vegetarian'
  | 'Vegan'
  | 'Gluten-Free'
  | 'Halal'
  | 'Kosher'
  | 'Nut-Free'
  | 'Other';
export type GuestGroup = 'Family' | 'Friends' | 'Colleagues' | 'VIPs' | 'Custom';
export type CommunicationType = 'invitation' | 'reminder' | 'announcement' | 'thank_you';

/** Full RSVP guest record including all enhanced fields (BRD 3.3.1 + v2) */
export interface RsvpGuest {
  id: number;
  event_id: number;
  name: string;
  email: string;
  phone: string | null;
  guests: number;
  canonical_status: CanonicalRsvpStatus;
  notes: string | null;
  source: string;
  checked_in: boolean;
  checked_in_at: string | null;
  late_arrival: boolean | null;
  arrival_delay_minutes: number | null;
  dietary_restriction: DietaryRestriction;
  accessibility_needs: string | null;
  plus_one: boolean;
  plus_one_name: string | null;
  guest_group: GuestGroup | null;
  rsvp_deadline: string | null;
  // BRD v2 guest profile expansion (#582, #543)
  company: string | null;
  title: string | null;
  relation_type: string | null;
  age_group: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_completeness: number | null;
  meal_choice: string | null;
  unsubscribed_at: string | null;
  seating_group_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RsvpGuestInput {
  name: string;
  email: string;
  phone?: string;
  guests?: number;
  notes?: string;
  dietary_restriction?: DietaryRestriction;
  accessibility_needs?: string;
  plus_one?: boolean;
  plus_one_name?: string;
  guest_group?: GuestGroup;
  rsvp_deadline?: string;
  company?: string;
  title?: string;
  relation_type?: string;
  age_group?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_region?: string;
  postal_code?: string;
  country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  meal_choice?: string;
}

export interface CommunicationLogEntry {
  id: number;
  event_id: number;
  rsvp_id: number | null;
  type: CommunicationType;
  subject: string;
  body: string;
  sent_by: number | null;
  sent_by_name: string | null;
  sent_at: string;
  recipient_count?: number;
}

export interface BulkSendPayload {
  rsvpIds?: number[];
  subject: string;
  body: string;
}

export interface BulkSendResult {
  sent: number;
  failed: number;
  suppressed?: number;
}

export interface FailedImportRow {
  /** 1-based row number in the uploaded file (counting from the first data row). */
  rowNumber: number;
  /** Raw cell values for the row, keyed by header name. */
  data: Record<string, string>;
  /** Human-readable reason the row was not imported. */
  reason: string;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  /** Rows that were explicitly rejected with a structured reason (missing name/email, duplicate, etc.). */
  failedRows?: FailedImportRow[];
}

/** Legacy flat interface kept for backward compat with check-in / seating code */
export interface Rsvp {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  canonical_status: CanonicalRsvpStatus;
  notes: string | null;
  source: string;
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignedRsvp {
  rsvp_id: number;
  name: string;
  email: string;
  canonical_status: CanonicalRsvpStatus;
}

export interface SeatingTable {
  id: number;
  event_id: number;
  name: string;
  capacity: number;
  layout_x: number | null;
  layout_y: number | null;
  created_at: string;
  guests: AssignedRsvp[];
}

// ─── RSVP CRUD (enhanced) ────────────────────────────────────────────────────

/** GET /api/events/:eventId/rsvps — returns full enhanced guest records */
export async function listRsvpGuests(eventId: number | string): Promise<RsvpGuest[]> {
  const data = await api.get<{ rsvps: RsvpGuest[] }>(`/api/events/${eventId}/rsvps`);
  return data.rsvps;
}

export interface GuestEmailLookupMatch {
  id: number;
  name: string;
  email: string;
  canonical_status: CanonicalRsvpStatus;
  guests: number;
  created_at: string;
  updated_at: string;
}

export interface GuestEmailLookupResult {
  email: string;
  matches: GuestEmailLookupMatch[];
  mergeSuggestion: {
    recommendedPrimaryId: number;
    sourceRsvpIds: number[];
  } | null;
}

/** GET /api/events/:eventId/rsvps/lookup?email=person@example.com */
export async function lookupRsvpsByEmail(
  eventId: number | string,
  email: string,
): Promise<GuestEmailLookupResult> {
  const query = new URLSearchParams({ email: email.trim().toLowerCase() }).toString();
  return api.get<GuestEmailLookupResult>(`/api/events/${eventId}/rsvps/lookup?${query}`);
}

/** POST /api/events/:eventId/rsvps */
export async function createRsvp(
  eventId: number | string,
  input: RsvpGuestInput,
): Promise<RsvpGuest> {
  const data = await api.post<{ rsvp: RsvpGuest }>(`/api/events/${eventId}/rsvps`, input);
  return data.rsvp;
}

/** PATCH /api/events/:eventId/rsvps/:id */
export async function updateRsvp(
  eventId: number | string,
  rsvpId: number | string,
  input: Partial<RsvpGuestInput>,
): Promise<RsvpGuest> {
  const data = await api.patch<{ rsvp: RsvpGuest }>(
    `/api/events/${eventId}/rsvps/${rsvpId}`,
    input,
  );
  return data.rsvp;
}

/** DELETE /api/events/:eventId/rsvps/:id */
export async function deleteRsvp(eventId: number | string, rsvpId: number | string): Promise<void> {
  await api.delete(`/api/events/${eventId}/rsvps/${rsvpId}`);
}

// ─── Check-in ────────────────────────────────────────────────────────────────

/** GET /api/events/:eventId/rsvps */
export async function listRsvps(eventId: number | string): Promise<Rsvp[]> {
  const data = await api.get<{ rsvps: Rsvp[] }>(`/api/events/${eventId}/rsvps`);
  return data.rsvps;
}

/** PATCH /api/events/:eventId/rsvps/:id/checkin */
export async function checkInGuest(
  eventId: number | string,
  rsvpId: number | string,
): Promise<Rsvp> {
  const data = await api.patch<{ rsvp: Rsvp }>(`/api/events/${eventId}/rsvps/${rsvpId}/checkin`);
  return data.rsvp;
}

// ─── CSV Import / Export ─────────────────────────────────────────────────────

/** POST /api/events/:eventId/rsvps/import — multipart CSV upload with optional field mapping */
export async function importCsv(
  eventId: number | string,
  file: File,
  columnMap?: Record<string, string>,
): Promise<CsvImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (columnMap) {
    // Only send explicit (non-empty) mappings so the backend can still fall
    // back to normalised header names for columns the wizard left unmapped.
    // A '' value means "wizard found no match" — omitting it lets the backend
    // handle the column through its default normalisation path.
    const explicitMappings = Object.fromEntries(
      Object.entries(columnMap).filter(([, v]) => v !== ''),
    );
    if (Object.keys(explicitMappings).length > 0) {
      formData.append('column_map', JSON.stringify(explicitMappings));
    }
  }
  const res = await apiFetch(`/api/events/${eventId}/rsvps/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<CsvImportResult>;
}

/** Returns URL for the CSV import template download. */
export function importCsvTemplateUrl(eventId: number | string): string {
  return `/api/events/${eventId}/rsvps/import/template.csv`;
}

/** Returns URL for CSV download — caller can set window.location.href */
export function exportCsvUrl(eventId: number | string): string {
  return `/api/events/${eventId}/rsvps/export?format=csv`;
}

// ─── Communication (BRD 3.3.3) ───────────────────────────────────────────────

/** POST /api/events/:eventId/communication/invite */
export async function sendInvitation(
  eventId: number | string,
  payload: BulkSendPayload,
): Promise<BulkSendResult> {
  return api.post<BulkSendResult>(`/api/events/${eventId}/communication/invite`, payload);
}

/** POST /api/events/:eventId/communication/reminder */
export async function sendReminder(
  eventId: number | string,
  payload: BulkSendPayload,
): Promise<BulkSendResult> {
  return api.post<BulkSendResult>(`/api/events/${eventId}/communication/reminder`, payload);
}

/**
 * POST /api/events/:eventId/communication/thank-you (#444)
 *
 * Sends a post-event thank-you to confirmed attendees (status=Going by default).
 * Unsubscribed guests are automatically suppressed.
 */
export async function sendThankYou(
  eventId: number | string,
  payload: BulkSendPayload,
): Promise<BulkSendResult> {
  return api.post<BulkSendResult>(`/api/events/${eventId}/communication/thank-you`, payload);
}

/**
 * PATCH /api/events/:eventId/rsvps/:rsvpId/unsubscribe (#444)
 *
 * Planner-side unsubscribe toggle. Pass `unsubscribed=true` to suppress future
 * bulk sends to this guest; `false` to re-opt them in.
 */
export async function setGuestUnsubscribed(
  eventId: number | string,
  rsvpId: number | string,
  unsubscribed: boolean,
): Promise<{ rsvp: { id: number; email: string; unsubscribed_at: string | null } }> {
  return api.patch(`/api/events/${eventId}/rsvps/${rsvpId}/unsubscribe`, { unsubscribed });
}

/** GET /api/events/:eventId/communication */
export async function listCommunicationLog(
  eventId: number | string,
): Promise<CommunicationLogEntry[]> {
  const data = await api.get<{ log: CommunicationLogEntry[] }>(
    `/api/events/${eventId}/communication`,
  );
  return data.log;
}

// ─── Seating ────────────────────────────────────────────────────────────────

/** GET /api/events/:eventId/seating/tables */
export async function listTables(eventId: number | string): Promise<SeatingTable[]> {
  const data = await api.get<{ tables: SeatingTable[] }>(`/api/events/${eventId}/seating/tables`);
  return data.tables;
}

/** POST /api/events/:eventId/seating/tables */
export async function createTable(
  eventId: number | string,
  payload: { name: string; capacity: number },
): Promise<SeatingTable> {
  const data = await api.post<{ table: SeatingTable }>(
    `/api/events/${eventId}/seating/tables`,
    payload,
  );
  return data.table;
}

/** PATCH /api/events/:eventId/seating/tables/:tableId/layout */
export async function updateTableLayout(
  eventId: number | string,
  tableId: number | string,
  payload: { layout_x: number; layout_y: number },
): Promise<SeatingTable> {
  const data = await api.patch<{ table: SeatingTable }>(
    `/api/events/${eventId}/seating/tables/${tableId}/layout`,
    payload,
  );
  return data.table;
}

/** DELETE /api/events/:eventId/seating/tables/:tableId */
export async function deleteTable(
  eventId: number | string,
  tableId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/seating/tables/${tableId}`);
}

/** POST /api/events/:eventId/seating/tables/:tableId/assign/:rsvpId */
export async function assignGuest(
  eventId: number | string,
  tableId: number | string,
  rsvpId: number | string,
): Promise<void> {
  await api.post(`/api/events/${eventId}/seating/tables/${tableId}/assign/${rsvpId}`);
}

/** DELETE /api/events/:eventId/seating/tables/:tableId/assign/:rsvpId */
export async function unassignGuest(
  eventId: number | string,
  tableId: number | string,
  rsvpId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/seating/tables/${tableId}/assign/${rsvpId}`);
}

// ─── Duplicate detection & merge (#411, #435) ───────────────────────────────

export interface DuplicateClusterEntry {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  guests: number;
  created_at: string;
  updated_at: string;
}

export interface DuplicateCluster {
  reason: 'same_phone' | 'same_name_and_email_domain' | 'same_normalized_name';
  rsvps: DuplicateClusterEntry[];
  recommendedPrimaryId: number;
}

export async function listDuplicates(eventId: number | string): Promise<DuplicateCluster[]> {
  const data = await api.get<{ clusters: DuplicateCluster[] }>(
    `/api/events/${eventId}/rsvps/duplicates`,
  );
  return data.clusters;
}

export interface MergeResult {
  rsvp: RsvpGuest;
  mergedSourceIds: number[];
}

export async function mergeRsvps(
  eventId: number | string,
  survivorId: number,
  sourceRsvpIds: number[],
  notes?: string,
): Promise<MergeResult> {
  return api.post<MergeResult>(`/api/events/${eventId}/rsvps/${survivorId}/merge`, {
    sourceRsvpIds,
    notes,
  });
}

// ─── RSVP confirmation, QR, token (#436, #437) ──────────────────────────────

export async function sendRsvpConfirmation(
  eventId: number | string,
  rsvpId: number | string,
): Promise<{ sent: boolean; accessToken: string; rsvpLink: string }> {
  return api.post(`/api/events/${eventId}/rsvps/${rsvpId}/send-confirmation`);
}

export function rsvpIcsUrl(eventId: number | string, rsvpId: number | string): string {
  return `/api/events/${eventId}/rsvps/${rsvpId}/ics`;
}

export function rsvpQrUrl(eventId: number | string, rsvpId: number | string): string {
  return `/api/events/${eventId}/rsvps/${rsvpId}/qr.svg`;
}

export async function issueRsvpToken(
  eventId: number | string,
  rsvpId: number | string,
  rotate = false,
): Promise<{ token: string }> {
  return api.post<{ token: string }>(`/api/events/${eventId}/rsvps/${rsvpId}/token`, { rotate });
}

// ─── Waitlist (#442) ────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  guests: number;
  status: string;
  waitlist_position: number;
  waitlisted_at: string;
  created_at: string;
}

export interface WaitlistSummary {
  waitlist: WaitlistEntry[];
  capacity: number | null;
  confirmedGuests: number;
  remainingCapacity: number | null;
}

export async function listWaitlist(eventId: number | string): Promise<WaitlistSummary> {
  return api.get<WaitlistSummary>(`/api/events/${eventId}/waitlist`);
}

export async function addRsvpToWaitlist(
  eventId: number | string,
  rsvpId: number,
): Promise<{ position: number }> {
  return api.post<{ position: number }>(`/api/events/${eventId}/waitlist`, { rsvpId });
}

export async function promoteWaitlist(eventId: number | string): Promise<{
  promoted: Array<{ id: number; name: string; email: string; guests: number }>;
  remainingCapacity: number | null;
  waitlistSize: number;
}> {
  return api.post(`/api/events/${eventId}/waitlist/promote`);
}

export async function removeFromWaitlist(
  eventId: number | string,
  rsvpId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/waitlist/${rsvpId}`);
}

// ─── Custom RSVP questions (#443) ───────────────────────────────────────────

export type RsvpQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multi_choice'
  | 'number'
  | 'boolean';

export interface RsvpQuestion {
  id: number;
  event_id: number;
  prompt: string;
  question_type: RsvpQuestionType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface RsvpQuestionInput {
  prompt: string;
  question_type: RsvpQuestionType;
  options?: string[];
  required?: boolean;
  sort_order?: number;
}

export async function listRsvpQuestions(eventId: number | string): Promise<RsvpQuestion[]> {
  const data = await api.get<{ questions: RsvpQuestion[] }>(
    `/api/events/${eventId}/rsvp-questions`,
  );
  return data.questions;
}

export async function createRsvpQuestion(
  eventId: number | string,
  input: RsvpQuestionInput,
): Promise<RsvpQuestion> {
  const data = await api.post<{ question: RsvpQuestion }>(
    `/api/events/${eventId}/rsvp-questions`,
    input,
  );
  return data.question;
}

export async function updateRsvpQuestion(
  eventId: number | string,
  questionId: number,
  input: Partial<RsvpQuestionInput>,
): Promise<RsvpQuestion> {
  const data = await api.patch<{ question: RsvpQuestion }>(
    `/api/events/${eventId}/rsvp-questions/${questionId}`,
    input,
  );
  return data.question;
}

export async function deleteRsvpQuestion(
  eventId: number | string,
  questionId: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/rsvp-questions/${questionId}`);
}

export interface RsvpResponseRow {
  id: number;
  rsvp_id: number;
  question_id: number;
  response: string | null;
  prompt: string;
  question_type: RsvpQuestionType;
  guest_name: string;
  guest_email: string;
  updated_at: string;
}

export async function listRsvpQuestionResponses(
  eventId: number | string,
): Promise<RsvpResponseRow[]> {
  const data = await api.get<{ responses: RsvpResponseRow[] }>(
    `/api/events/${eventId}/rsvp-questions/responses`,
  );
  return data.responses;
}

// ─── BRD v2 additions: export, meals, templates, QR scan, attendance, groups ─

/** Excel export — returns a URL that triggers attachment download. */
export function exportXlsxUrl(eventId: number | string): string {
  return `/api/events/${eventId}/rsvps/export.xlsx`;
}

export interface PdfExportPayload {
  event: { title: string; date: string; location: string | null } | null;
  columns: { key: string; label: string }[];
  rows: Array<Record<string, unknown>>;
}
export async function fetchPdfExportData(eventId: number | string): Promise<PdfExportPayload> {
  return api.get<PdfExportPayload>(`/api/events/${eventId}/rsvps/export.pdf`);
}

// ─── Meal options (#591) ────────────────────────────────────────────────────

export interface MealOption {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function listMealOptions(eventId: number | string): Promise<MealOption[]> {
  const data = await api.get<{ options: MealOption[] }>(`/api/events/${eventId}/meal-options`);
  return data.options;
}
export async function createMealOption(
  eventId: number | string,
  input: { name: string; description?: string; is_active?: boolean; sort_order?: number },
): Promise<MealOption> {
  const data = await api.post<{ option: MealOption }>(`/api/events/${eventId}/meal-options`, input);
  return data.option;
}
export async function updateMealOption(
  eventId: number | string,
  id: number,
  input: Partial<{ name: string; description: string; is_active: boolean; sort_order: number }>,
): Promise<MealOption> {
  const data = await api.patch<{ option: MealOption }>(
    `/api/events/${eventId}/meal-options/${id}`,
    input,
  );
  return data.option;
}
export async function deleteMealOption(eventId: number | string, id: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/meal-options/${id}`);
}

// ─── Communication templates (#590) ─────────────────────────────────────────

export interface CommunicationTemplate {
  id: number;
  event_id: number | null;
  slug: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
}

export async function listCommunicationTemplates(
  eventId: number | string,
): Promise<CommunicationTemplate[]> {
  const data = await api.get<{ templates: CommunicationTemplate[] }>(
    `/api/events/${eventId}/communication/templates`,
  );
  return data.templates;
}
export async function createCommunicationTemplate(
  eventId: number | string,
  input: { slug: string; name: string; subject: string; body: string; is_default?: boolean },
): Promise<CommunicationTemplate> {
  const data = await api.post<{ template: CommunicationTemplate }>(
    `/api/events/${eventId}/communication/templates`,
    input,
  );
  return data.template;
}
export async function deleteCommunicationTemplate(
  eventId: number | string,
  id: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/communication/templates/${id}`);
}
export async function previewCommunicationTemplate(
  eventId: number | string,
  id: number,
  tokens: Record<string, string> = {},
): Promise<{ subject: string; body: string }> {
  return api.post<{ subject: string; body: string }>(
    `/api/events/${eventId}/communication/templates/${id}/preview`,
    { tokens },
  );
}

// ─── QR check-in & attendance (#546, #589, #594, #595) ──────────────────────

export interface QrScanResult {
  rsvp: RsvpGuest;
  alreadyCheckedIn: boolean;
}

export async function scanQrToken(eventId: number | string, token: string): Promise<QrScanResult> {
  return api.post<QrScanResult>(`/api/events/${eventId}/checkin/scan`, { token });
}

export async function undoCheckIn(
  eventId: number | string,
  rsvpId: number | string,
): Promise<void> {
  await api.post(`/api/events/${eventId}/checkin/${rsvpId}/undo`);
}

export async function markNoShow(eventId: number | string, rsvpIds: number[]): Promise<void> {
  await api.post(`/api/events/${eventId}/checkin/mark-no-show`, { rsvpIds });
}

export interface AttendanceStats {
  invited: number;
  confirmed: number;
  declined: number;
  pending: number;
  waitlist: number;
  checked_in: number;
  no_show: number;
  late_arrivals: number;
  attendance_rate: number;
}

export async function getAttendanceSummary(
  eventId: number | string,
): Promise<{ stats: AttendanceStats }> {
  return api.get<{ stats: AttendanceStats }>(`/api/events/${eventId}/attendance/summary`);
}

export interface AttendanceRecentEvent {
  id: number;
  action: 'checked_in' | 'undo_checkin' | 'scanned' | 'no_show';
  source: string;
  occurred_at: string;
  rsvp_id: number;
  name: string;
  email: string;
  late_arrival: boolean | null;
  arrival_delay_minutes: number | null;
}

export async function listRecentAttendance(
  eventId: number | string,
): Promise<AttendanceRecentEvent[]> {
  const data = await api.get<{ events: AttendanceRecentEvent[] }>(
    `/api/events/${eventId}/attendance/recent`,
  );
  return data.events;
}

export function attendanceStreamUrl(eventId: number | string): string {
  return `/api/events/${eventId}/attendance/stream`;
}

// ─── Seating groups (#593) ──────────────────────────────────────────────────

export interface SeatingGroup {
  id: number;
  event_id: number;
  name: string;
  seat_together: boolean;
  preferred_table_id: number | null;
  notes: string | null;
  members: Array<{ id: number; name: string; email: string; guests: number }>;
  member_count: number;
  total_guests: number;
}

export async function listSeatingGroups(eventId: number | string): Promise<SeatingGroup[]> {
  const data = await api.get<{ groups: SeatingGroup[] }>(`/api/events/${eventId}/seating/groups`);
  return data.groups;
}
export async function createSeatingGroup(
  eventId: number | string,
  input: { name: string; seat_together?: boolean; preferred_table_id?: number; notes?: string },
): Promise<SeatingGroup> {
  const data = await api.post<{ group: SeatingGroup }>(
    `/api/events/${eventId}/seating/groups`,
    input,
  );
  return data.group;
}
export async function setSeatingGroupMembers(
  eventId: number | string,
  groupId: number,
  rsvpIds: number[],
): Promise<void> {
  await api.post(`/api/events/${eventId}/seating/groups/${groupId}/members`, { rsvpIds });
}
export async function seatGroupAtTable(
  eventId: number | string,
  groupId: number,
  tableId: number,
): Promise<void> {
  await api.post(`/api/events/${eventId}/seating/groups/${groupId}/seat`, { tableId });
}
export async function deleteSeatingGroup(eventId: number | string, groupId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/seating/groups/${groupId}`);
}
