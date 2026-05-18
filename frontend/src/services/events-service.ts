/**
 * Events Service
 * Typed API adapter for events, activity feed, and cover image.
 * BRD 3.2.1, 3.2.2, 3.12
 */

import { api } from '../lib/api-client';

// BRD v2 (#575) — full event lifecycle status set.
export type EventStatus =
  | 'Draft'
  | 'Planning'
  | 'Confirmed'
  | 'Active'
  | 'Completed'
  | 'Cancelled';

export const EVENT_STATUSES: readonly EventStatus[] = [
  'Draft',
  'Planning',
  'Confirmed',
  'Active',
  'Completed',
  'Cancelled',
] as const;

export type EventView = 'list' | 'grid' | 'calendar' | 'timeline';

export interface Event {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  /** Raw date column from the events table */
  date: string;
  /** Compatibility alias returned by some endpoints/tests */
  event_date?: string;
  capacity: number | null;
  status: EventStatus;
  cover_image_url: string | null;
  event_type: string | null;
  is_public: boolean;
  rsvp_deadline: string | null;
  tags: string | null;
  /** Story #414 — map-backed location */
  latitude?: number | null;
  longitude?: number | null;
  /** Story #414 — capacity / waitlist surface */
  waitlist_enabled?: boolean | null;
  /** Aggregated counts populated by GET /api/events */
  going_count?: number | null;
  pending_count?: number | null;
  created_by: number;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  /** BRD v2 (#540, #578) — true archive metadata */
  archived_at?: string | null;
  archived_by?: number | null;
  archive_reason?: string | null;
  /** BRD v2 (#622) — storage quota visibility */
  storage_quota_bytes?: number | null;
  storage_used_bytes?: number | null;
  /** BRD v2 (#618, #621) — gallery permission toggles */
  gallery_comments_enabled?: boolean | null;
  gallery_guest_uploads?: boolean | null;
  gallery_public?: boolean | null;
  /** BRD v2 (#541, #576) — derived cover image sizes */
  cover_image_sizes?: Record<string, unknown> | null;
}

export interface ActivityFeedEntry {
  id: number;
  event_id: number;
  user_id: number | null;
  action_type: string;
  description: string;
  link: string | null;
  created_at: string;
  actor_name: string | null;
}

export type CreateEventPayload = Partial<
  Omit<Event, 'id' | 'created_by' | 'creator_name' | 'created_at' | 'updated_at'>
>;

type EventApiRecord = Omit<Event, 'date'> & {
  date?: string;
  event_date?: string;
};

function normalizeEvent(event: EventApiRecord): Event {
  const normalizedDate = event.date ?? event.event_date ?? '';
  return {
    ...event,
    date: normalizedDate,
    event_date: normalizedDate,
  };
}

// ── Events CRUD ───────────────────────────────────────────────────────────────

export interface EventListFilters {
  owner?: 'me';
  tags?: string[];
  status?: string | string[];
  q?: string;
  // Advanced search — story #416, task #455
  title_q?: string;
  location_q?: string;
  date_from?: string;
  date_to?: string;
  capacity_min?: number | string;
  capacity_max?: number | string;
  event_type?: string;
  has_waitlist?: boolean;
  // BRD v2 (#578, #580, #581)
  archived?: 'true' | 'false' | 'only';
  created_by?: number;
  sort?: 'date_asc' | 'date_desc' | 'title_asc' | 'title_desc' | 'created_desc' | 'created_asc';
}

export function buildEventQuery(filters?: EventListFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.owner) params.set('owner', filters.owner);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.status) {
    params.set('status', Array.isArray(filters.status) ? filters.status.join(',') : filters.status);
  }
  if (filters.q) params.set('q', filters.q);
  if (filters.title_q) params.set('title_q', filters.title_q);
  if (filters.location_q) params.set('location_q', filters.location_q);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.capacity_min !== undefined && filters.capacity_min !== '') {
    params.set('capacity_min', String(filters.capacity_min));
  }
  if (filters.capacity_max !== undefined && filters.capacity_max !== '') {
    params.set('capacity_max', String(filters.capacity_max));
  }
  if (filters.event_type) params.set('event_type', filters.event_type);
  if (filters.has_waitlist !== undefined) {
    params.set('has_waitlist', filters.has_waitlist ? 'true' : 'false');
  }
  if (filters.archived) params.set('archived', filters.archived);
  if (filters.created_by !== undefined) params.set('created_by', String(filters.created_by));
  if (filters.sort) params.set('sort', filters.sort);
  return params.toString() ? `?${params.toString()}` : '';
}

export async function listEvents(filters?: EventListFilters): Promise<Event[]> {
  const qs = buildEventQuery(filters);
  const data = await api.get<EventApiRecord[] | { events: EventApiRecord[] }>(`/api/events${qs}`);
  const events = Array.isArray(data) ? data : data.events ?? [];
  return events.map(normalizeEvent);
}

export async function listMyEvents(): Promise<Event[]> {
  return listEvents({ owner: 'me' });
}

export async function getEvent(id: number | string): Promise<Event> {
  const data = await api.get<{ event: EventApiRecord }>(`/api/events/${id}`);
  return normalizeEvent(data.event);
}

export async function createEvent(payload: CreateEventPayload): Promise<Event> {
  const data = await api.post<EventApiRecord>('/api/events', payload);
  return normalizeEvent(data);
}

export async function updateEvent(
  id: number | string,
  payload: CreateEventPayload,
): Promise<Event> {
  const data = await api.put<EventApiRecord>(`/api/events/${id}`, payload);
  return normalizeEvent(data);
}

export async function deleteEvent(id: number | string): Promise<void> {
  await api.delete<void>(`/api/events/${id}`);
}

// ── Event Enhancements ────────────────────────────────────────────────────────

export async function cloneEvent(
  id: number | string,
  includeTasks = false,
): Promise<Event> {
  const qs = includeTasks ? '?includeTasks=true' : '';
  const data = await api.post<EventApiRecord>(`/api/events/${id}/clone${qs}`);
  return normalizeEvent(data);
}

export async function setCoverImage(
  eventId: number | string,
  coverImageUrl: string,
): Promise<Event> {
  const data = await api.patch<EventApiRecord>(`/api/events/${eventId}/cover`, {
    cover_image_url: coverImageUrl,
  });
  return normalizeEvent(data);
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

export async function listFeed(eventId: number | string): Promise<ActivityFeedEntry[]> {
  const data = await api.get<{ feed: ActivityFeedEntry[] }>(
    `/api/events/${eventId}/feed`,
  );
  return data.feed;
}

// ── BRD v2 archive workflow (#540, #578) ──────────────────────────────────────

export async function archiveEvent(
  id: number | string,
  reason?: string,
): Promise<Event> {
  const data = await api.post<EventApiRecord>(`/api/events/${id}/archive`, { reason });
  return normalizeEvent(data);
}

export async function unarchiveEvent(id: number | string): Promise<Event> {
  const data = await api.post<EventApiRecord>(`/api/events/${id}/unarchive`);
  return normalizeEvent(data);
}

// ── BRD v2 custom fields (#577) ───────────────────────────────────────────────

export interface EventCustomField {
  id: number;
  event_id: number;
  field_key: string;
  label: string;
  field_type: 'text' | 'number' | 'boolean' | 'date' | 'url' | 'select';
  options?: string[] | null;
  value: string | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function listCustomFields(
  eventId: number | string,
): Promise<EventCustomField[]> {
  const data = await api.get<{ fields: EventCustomField[] }>(
    `/api/events/${eventId}/custom-fields`,
  );
  return data.fields;
}

export async function createCustomField(
  eventId: number | string,
  payload: Partial<EventCustomField>,
): Promise<EventCustomField> {
  return api.post<EventCustomField>(`/api/events/${eventId}/custom-fields`, payload);
}

export async function updateCustomField(
  eventId: number | string,
  fieldId: number,
  payload: Partial<EventCustomField>,
): Promise<EventCustomField> {
  return api.patch<EventCustomField>(
    `/api/events/${eventId}/custom-fields/${fieldId}`,
    payload,
  );
}

export async function deleteCustomField(
  eventId: number | string,
  fieldId: number,
): Promise<void> {
  await api.delete<void>(`/api/events/${eventId}/custom-fields/${fieldId}`);
}

// ── BRD v2 global search (#581) ───────────────────────────────────────────────

export interface GlobalSearchResults {
  q: string;
  types: string[];
  results: Record<string, Array<Record<string, unknown>>>;
}

export async function globalSearch(
  q: string,
  options: { types?: string[]; limit?: number; includeArchived?: boolean } = {},
): Promise<GlobalSearchResults> {
  const params = new URLSearchParams({ q });
  if (options.types?.length) params.set('types', options.types.join(','));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.includeArchived) params.set('include_archived', 'true');
  return api.get<GlobalSearchResults>(`/api/search?${params.toString()}`);
}
