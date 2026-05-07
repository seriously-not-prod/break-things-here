import { api } from '../lib/api-client';

export type ActivityStatus = 'planned' | 'in-progress' | 'completed' | 'skipped';

export interface TimelineActivity {
  id: number;
  event_id: number;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: ActivityStatus;
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
  planned_start_time?: string;
  planned_end_time?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  status?: ActivityStatus;
  location?: string;
  vendor_id?: number;
  sort_order?: number;
}

export interface UpdateActivityInput extends Partial<CreateActivityInput> {}

export interface TimelineComparisonItem {
  id: number;
  title: string;
  status: ActivityStatus;
  location: string | null;
  vendor_id: number | null;
  sort_order: number;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  start_variance_minutes: number | null;
  end_variance_minutes: number | null;
  planned_duration_minutes: number | null;
  actual_duration_minutes: number | null;
}

export interface TimelineComparisonSummary {
  total: number;
  planned: number;
  in_progress: number;
  completed: number;
  skipped: number;
}

export interface TimelineComparisonResponse {
  comparison: TimelineComparisonItem[];
  summary: TimelineComparisonSummary;
}

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

export async function getTimelineComparison(eventId: number): Promise<TimelineComparisonResponse> {
  return api.get<TimelineComparisonResponse>(`/api/events/${eventId}/timeline/comparison`);
}
