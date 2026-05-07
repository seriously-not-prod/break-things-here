import { api } from '../lib/api-client';

export interface TimelineActivity {
  id: number;
  event_id: number;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  vendor_id: number | null;
  sort_order: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityInput {
  title: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  vendor_id?: number;
  sort_order?: number;
}

export interface UpdateActivityInput extends Partial<CreateActivityInput> {}

export async function listActivities(eventId: number): Promise<TimelineActivity[]> {
  const data = await api.get<{ activities: TimelineActivity[] }>(`/api/events/${eventId}/timeline`);
  return data.activities ?? [];
}

export async function createActivity(eventId: number, input: CreateActivityInput): Promise<TimelineActivity> {
  const data = await api.post<{ activity: TimelineActivity }>(`/api/events/${eventId}/timeline`, input);
  return data.activity;
}

export async function updateActivity(
  eventId: number,
  activityId: number,
  input: UpdateActivityInput,
): Promise<TimelineActivity> {
  const data = await api.put<{ activity: TimelineActivity }>(
    `/api/events/${eventId}/timeline/${activityId}`,
    input,
  );
  return data.activity;
}

export async function deleteActivity(eventId: number, activityId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/timeline/${activityId}`);
}
