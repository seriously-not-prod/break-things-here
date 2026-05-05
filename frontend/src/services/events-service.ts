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

export async function listEvents(): Promise<Event[]> {
  const data = await api.get<EventApiRecord[] | { events: EventApiRecord[] }>('/api/events');
  const events = Array.isArray(data) ? data : data.events ?? [];
  return events.map(normalizeEvent);
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
