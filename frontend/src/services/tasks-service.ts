/**
 * Tasks Service
 * Typed API adapter for tasks, comments, and subtasks.
 * Covers issues: #373 #374
 */

import { api } from '../lib/api-client';

export type TaskStatus = 'Pending' | 'In Progress' | 'Blocked' | 'Complete';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface Task {
  id: number;
  event_id: number;
  title: string;
  notes: string | null;
  description: string | null;
  assignee_name: string | null;
  assigned_user_id: number | null;
  due_date: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  body: string;
  created_at: string;
  /** Joined from users table */
  author_name?: string;
}

export interface TaskSubtask {
  id: number;
  task_id: number;
  title: string;
  completed: boolean;
  created_at: string;
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export async function listTasks(eventId: number | string): Promise<Task[]> {
  const data = await api.get<{ tasks: Task[] }>(`/api/events/${eventId}/tasks`);
  return data.tasks;
}

export async function createTask(
  eventId: number | string,
  payload: Partial<Omit<Task, 'id' | 'event_id' | 'created_by' | 'created_at' | 'updated_at'>>,
): Promise<Task> {
  const data = await api.post<{ task: Task }>(`/api/events/${eventId}/tasks`, payload);
  return data.task;
}

export async function updateTask(
  eventId: number | string,
  taskId: number | string,
  payload: Partial<Omit<Task, 'id' | 'event_id' | 'created_by' | 'created_at' | 'updated_at'>>,
): Promise<Task> {
  const data = await api.put<{ task: Task }>(`/api/events/${eventId}/tasks/${taskId}`, payload);
  return data.task;
}

export async function deleteTask(
  eventId: number | string,
  taskId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/tasks/${taskId}`);
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function listComments(
  eventId: number | string,
  taskId: number | string,
): Promise<TaskComment[]> {
  const data = await api.get<{ comments: TaskComment[] }>(
    `/api/events/${eventId}/tasks/${taskId}/comments`,
  );
  return data.comments;
}

export async function addComment(
  eventId: number | string,
  taskId: number | string,
  body: string,
): Promise<TaskComment> {
  const data = await api.post<{ comment: TaskComment }>(
    `/api/events/${eventId}/tasks/${taskId}/comments`,
    { body },
  );
  return data.comment;
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

export async function addSubtask(
  eventId: number | string,
  taskId: number | string,
  title: string,
): Promise<TaskSubtask> {
  const data = await api.post<{ subtask: TaskSubtask }>(
    `/api/events/${eventId}/tasks/${taskId}/subtasks`,
    { title },
  );
  return data.subtask;
}

export async function toggleSubtask(
  eventId: number | string,
  taskId: number | string,
  subtaskId: number | string,
): Promise<TaskSubtask> {
  const data = await api.patch<{ subtask: TaskSubtask }>(
    `/api/events/${eventId}/tasks/${taskId}/subtasks/${subtaskId}`,
  );
  return data.subtask;
}

export async function deleteSubtask(
  eventId: number | string,
  taskId: number | string,
  subtaskId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/tasks/${taskId}/subtasks/${subtaskId}`);
}
