/**
 * Service functions for the first-class Guest Records entity (Task #771).
 *
 * Guest profiles store identity information independently of RSVP status.
 * The backend exposes full CRUD at:
 *   GET    /api/events/:eventId/guest-records
 *   GET    /api/events/:eventId/guest-records/:id
 *   POST   /api/events/:eventId/guest-records
 *   PUT    /api/events/:eventId/guest-records/:id
 *   DELETE /api/events/:eventId/guest-records/:id
 *
 * Issue #910 — wire this service into the frontend Guests page.
 */
import { api } from '../lib/api-client';

export interface GuestRecord {
  id: number;
  event_id: number;
  name: string;
  email: string;
  phone: string | null;
  dietary_restriction: string | null;
  accessibility_needs: string | null;
  rsvp_id: number | null;
  canonical_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuestRecordInput {
  name: string;
  email: string;
  phone?: string;
  dietary_restriction?: string;
  accessibility_needs?: string;
}

export async function listGuestRecords(eventId: string): Promise<GuestRecord[]> {
  const data = await api.get<{ guests: GuestRecord[] }>(
    `/api/events/${eventId}/guest-records`,
  );
  return data.guests ?? [];
}

export async function getGuestRecord(eventId: string, id: number): Promise<GuestRecord> {
  return api.get<GuestRecord>(`/api/events/${eventId}/guest-records/${id}`);
}

export async function createGuestRecord(
  eventId: string,
  input: GuestRecordInput,
): Promise<GuestRecord> {
  return api.post<GuestRecord>(`/api/events/${eventId}/guest-records`, input);
}

export async function updateGuestRecord(
  eventId: string,
  id: number,
  input: Partial<GuestRecordInput>,
): Promise<GuestRecord> {
  return api.put<GuestRecord>(`/api/events/${eventId}/guest-records/${id}`, input);
}

export async function deleteGuestRecord(eventId: string, id: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/guest-records/${id}`);
}
