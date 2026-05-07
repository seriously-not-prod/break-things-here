/**
 * Workload Service (#451)
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

export async function getWorkload(eventId: number | string): Promise<WorkloadEntry[]> {
  const data = await api.get<{ workload: WorkloadEntry[] }>(`/api/events/${eventId}/workload`);
  return data.workload;
}
