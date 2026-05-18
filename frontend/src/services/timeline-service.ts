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
  buffer_before_mins: number;
  buffer_after_mins: number;
  version: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

// #613 — Timeline templates
export interface TimelineTemplateActivity {
  id: number;
  template_id: number;
  title: string;
  description: string | null;
  offset_minutes: number;
  duration_minutes: number;
  buffer_before_mins: number;
  buffer_after_mins: number;
  location: string | null;
  sort_order: number;
}

export interface TimelineTemplate {
  id: number;
  name: string;
  description: string | null;
  event_type: string | null;
  is_global: boolean;
  created_by: number | null;
  created_at: string;
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
  buffer_before_mins?: number;
  buffer_after_mins?: number;
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

// ── #612: Drag-and-drop reorder ───────────────────────────────────────────────

export async function reorderTimeline(
  eventId: number,
  order: Array<{ id: number; sort_order: number }>,
): Promise<TimelineActivity[]> {
  const data = await api.patch<{ activities: TimelineActivity[] }>(
    `/api/events/${eventId}/timeline/reorder`,
    { order },
  );
  return data.activities;
}

// ── #613: Timeline templates ──────────────────────────────────────────────────

export async function listTimelineTemplates(event_type?: string): Promise<TimelineTemplate[]> {
  const qs = event_type ? `?event_type=${encodeURIComponent(event_type)}` : '';
  const data = await api.get<{ templates: TimelineTemplate[] }>(`/api/timeline-templates${qs}`);
  return data.templates;
}

export async function getTimelineTemplate(
  id: number,
): Promise<{ template: TimelineTemplate; activities: TimelineTemplateActivity[] }> {
  return api.get(`/api/timeline-templates/${id}`);
}

export async function createTimelineTemplate(
  payload: Partial<TimelineTemplate> & { activities?: Partial<TimelineTemplateActivity>[] },
): Promise<{ template: TimelineTemplate; activities: TimelineTemplateActivity[] }> {
  return api.post(`/api/timeline-templates`, payload);
}

export async function deleteTimelineTemplate(id: number): Promise<void> {
  await api.delete(`/api/timeline-templates/${id}`);
}

export async function applyTimelineTemplate(
  eventId: number,
  templateId: number,
  eventStartTime?: string,
): Promise<TimelineActivity[]> {
  const data = await api.post<{ activities: TimelineActivity[] }>(
    `/api/events/${eventId}/timeline/apply-template`,
    { template_id: templateId, event_start_time: eventStartTime },
  );
  return data.activities;
}

// ── #614: Buffer-time ─────────────────────────────────────────────────────────

export async function updateActivityBuffer(
  eventId: number,
  activityId: number,
  bufferBeforeMins: number,
  bufferAfterMins: number,
): Promise<TimelineActivity> {
  const data = await api.patch<{ activity: TimelineActivity }>(
    `/api/events/${eventId}/timeline/${activityId}/buffer`,
    { buffer_before_mins: bufferBeforeMins, buffer_after_mins: bufferAfterMins },
  );
  return data.activity;
}

// ── #615: Execution tracking ──────────────────────────────────────────────────

export async function updateExecutionStatus(
  eventId: number,
  activityId: number,
  update: { status?: ActivityStatus; actual_start_time?: string; actual_end_time?: string },
): Promise<TimelineActivity> {
  const data = await api.patch<{ activity: TimelineActivity }>(
    `/api/events/${eventId}/timeline/${activityId}/execution`,
    update,
  );
  return data.activity;
}
