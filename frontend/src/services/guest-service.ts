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

export type RsvpStatus = 'Pending' | 'Going' | 'Maybe' | 'Not Going' | 'Declined';
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

/** Full RSVP guest record including all enhanced fields (BRD 3.3.1) */
export interface RsvpGuest {
  id: number;
  event_id: number;
  name: string;
  email: string;
  phone: string | null;
  guests: number;
  status: RsvpStatus;
  notes: string | null;
  source: string;
  checked_in: boolean;
  checked_in_at: string | null;
  dietary_restriction: DietaryRestriction;
  accessibility_needs: string | null;
  plus_one: boolean;
  plus_one_name: string | null;
  guest_group: GuestGroup | null;
  rsvp_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface RsvpGuestInput {
  name: string;
  email: string;
  phone?: string;
  guests?: number;
  status?: RsvpStatus;
  notes?: string;
  dietary_restriction?: DietaryRestriction;
  accessibility_needs?: string;
  plus_one?: boolean;
  plus_one_name?: string;
  guest_group?: GuestGroup;
  rsvp_deadline?: string;
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
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
}

/** Legacy flat interface kept for backward compat with check-in / seating code */
export interface Rsvp {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  status: string;
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
  status: string;
}

export interface SeatingTable {
  id: number;
  event_id: number;
  name: string;
  capacity: number;
  created_at: string;
  guests: AssignedRsvp[];
}

// ─── RSVP CRUD (enhanced) ────────────────────────────────────────────────────

/** GET /api/events/:eventId/rsvps — returns full enhanced guest records */
export async function listRsvpGuests(eventId: number | string): Promise<RsvpGuest[]> {
  const data = await api.get<{ rsvps: RsvpGuest[] }>(`/api/events/${eventId}/rsvps`);
  return data.rsvps;
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
export async function deleteRsvp(
  eventId: number | string,
  rsvpId: number | string,
): Promise<void> {
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
  const data = await api.patch<{ rsvp: Rsvp }>(
    `/api/events/${eventId}/rsvps/${rsvpId}/checkin`,
  );
  return data.rsvp;
}

// ─── CSV Import / Export ─────────────────────────────────────────────────────

/** POST /api/events/:eventId/rsvps/import — multipart CSV upload */
export async function importCsv(
  eventId: number | string,
  file: File,
): Promise<CsvImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch(`/api/events/${eventId}/rsvps/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<CsvImportResult>;
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
  const data = await api.get<{ tables: SeatingTable[] }>(
    `/api/events/${eventId}/seating/tables`,
  );
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
  await api.post(
    `/api/events/${eventId}/seating/tables/${tableId}/assign/${rsvpId}`,
  );
}

/** DELETE /api/events/:eventId/seating/tables/:tableId/assign/:rsvpId */
export async function unassignGuest(
  eventId: number | string,
  tableId: number | string,
  rsvpId: number | string,
): Promise<void> {
  await api.delete(
    `/api/events/${eventId}/seating/tables/${tableId}/assign/${rsvpId}`,
  );
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
  return api.post<{ token: string }>(
    `/api/events/${eventId}/rsvps/${rsvpId}/token`,
    { rotate },
  );
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
