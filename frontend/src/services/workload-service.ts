/**
 * Workload Service (#451 / #796)
 */

import { api } from '../lib/api-client';

export interface WorkloadEntry {
  user_id: number | null;
  display_name: string;
  total_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  blocked_tasks: number;
  complete_tasks: number;
  estimated_hours: number;
  actual_hours_logged: number;
  is_over_capacity: boolean;
}

export interface WorkloadMeta {
  from: string | null;
  to: string | null;
  assignee_id: number | null;
  status: string | null;
  daily_hours: number;
  window_days: number;
  capacity_threshold_hours: number;
}

export interface WorkloadFilters {
  from?: string;
  to?: string;
  assignee?: number;
  status?: string;
  dailyHours?: number;
}

export interface WorkloadResponse {
  workload: WorkloadEntry[];
  meta: WorkloadMeta;
}

function buildQuery(filters: WorkloadFilters | undefined): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.assignee !== undefined) params.set('assignee', String(filters.assignee));
  if (filters.status) params.set('status', filters.status);
  if (filters.dailyHours !== undefined) params.set('daily_hours', String(filters.dailyHours));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function getWorkload(
  eventId: number | string,
  filters?: WorkloadFilters,
): Promise<WorkloadEntry[]> {
  const data = await api.get<WorkloadResponse>(
    `/api/events/${eventId}/workload${buildQuery(filters)}`,
  );
  return data.workload;
}

export async function getWorkloadWithMeta(
  eventId: number | string,
  filters?: WorkloadFilters,
): Promise<WorkloadResponse> {
  return api.get<WorkloadResponse>(`/api/events/${eventId}/workload${buildQuery(filters)}`);
}
