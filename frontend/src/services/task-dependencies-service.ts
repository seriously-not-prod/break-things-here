/**
 * Task Dependencies Service (#440)
 * API client for task dependency management.
 */

import { api } from '../lib/api-client';

export interface TaskDependency {
  id: number;
  task_id: number;
  depends_on_id: number;
  created_by: number | null;
  created_at: string;
}

export interface TaskDependencyRef {
  id: number;
  title: string;
  status: string;
  priority: string;
  dep_id: number;
}

export interface TaskDependenciesResponse {
  blocking: TaskDependencyRef[];
  blocked_by: TaskDependencyRef[];
}

export async function listTaskDependencies(
  eventId: number | string,
  taskId: number | string,
): Promise<TaskDependenciesResponse> {
  return api.get<TaskDependenciesResponse>(`/api/events/${eventId}/tasks/${taskId}/dependencies`);
}

export async function addTaskDependency(
  eventId: number | string,
  taskId: number | string,
  dependsOnId: number,
): Promise<TaskDependency> {
  const data = await api.post<{ dependency: TaskDependency }>(
    `/api/events/${eventId}/tasks/${taskId}/dependencies`,
    { depends_on_id: dependsOnId },
  );
  return data.dependency;
}

export async function removeTaskDependency(
  eventId: number | string,
  taskId: number | string,
  depId: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/tasks/${taskId}/dependencies/${depId}`);
}
