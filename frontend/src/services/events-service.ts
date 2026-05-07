/**
 * Events Service
 * Typed API adapter for events, activity feed, and cover image.
 * BRD 3.2.1, 3.2.2, 3.12
 */

import { api } from '../lib/api-client';

export type EventStatus = 'Draft' | 'Active' | 'Completed' | 'Cancelled';

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
  status?: string;
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
}

export function buildEventQuery(filters?: EventListFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.owner) params.set('owner', filters.owner);
  if (filters.tags?.length) params.set('tags', filters.tags.join(','));
  if (filters.status) params.set('status', filters.status);
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
