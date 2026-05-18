/**
 * Tasks Service
 * Typed API adapter for tasks, comments, and subtasks.
 * Covers issues: #373 #374 #603 #604 #605 #606
 */

import { api } from '../lib/api-client';

// #604 — Expanded status set
export type TaskStatus =
  | 'Pending'
  | 'In Progress'
  | 'Blocked'
  | 'Verification'
  | 'Complete'
  | 'Cancelled';

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
  cancelled_reason: string | null;
  verified_by: number | null;
  verified_at: string | null;
  escalated_at: string | null;
  version: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// #603 — Multi-assignee
export interface TaskAssignee {
  id: number;
  task_id: number;
  user_id: number;
  display_name: string;
  email: string;
  assigned_by: number | null;
  assigned_at: string;
}

// #605 — Escalation policy
export interface EscalationPolicy {
  id: number;
  event_id: number;
  overdue_hours: number;
  escalate_to_user_id: number | null;
  escalate_to_role_id: number | null;
  notify_on_escalation: boolean;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  body: string;
  created_at: string;
  author_name?: string;
}

export interface TaskSubtask {
  id: number;
  task_id: number;
  title: string;
  completed: boolean;
  created_at: string;
}

// #606 — Capacity planning
export interface TaskCapacity {
  total_tasks: number;
  pending: number;
  in_progress: number;
  blocked: number;
  in_verification: number;
  overdue: number;
  total_estimated_hours: number;
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

// ── #603: Multi-assignee ──────────────────────────────────────────────────────

export async function listTaskAssignees(
  eventId: number | string,
  taskId: number | string,
): Promise<TaskAssignee[]> {
  const data = await api.get<{ assignees: TaskAssignee[] }>(
    `/api/events/${eventId}/tasks/${taskId}/assignees`,
  );
  return data.assignees;
}

export async function addTaskAssignee(
  eventId: number | string,
  taskId: number | string,
  userId: number,
): Promise<TaskAssignee[]> {
  const data = await api.post<{ assignees: TaskAssignee[] }>(
    `/api/events/${eventId}/tasks/${taskId}/assignees`,
    { user_id: userId },
  );
  return data.assignees;
}

export async function removeTaskAssignee(
  eventId: number | string,
  taskId: number | string,
  userId: number | string,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/tasks/${taskId}/assignees/${userId}`);
}

// ── #604: Status lifecycle ────────────────────────────────────────────────────

export async function updateTaskStatus(
  eventId: number | string,
  taskId: number | string,
  status: TaskStatus,
  options?: { cancelled_reason?: string; version?: number },
): Promise<Task> {
  const data = await api.patch<{ task: Task }>(
    `/api/events/${eventId}/tasks/${taskId}/status`,
    { status, ...options },
  );
  return data.task;
}

export async function verifyTaskCompletion(
  eventId: number | string,
  taskId: number | string,
): Promise<Task> {
  const data = await api.post<{ task: Task }>(
    `/api/events/${eventId}/tasks/${taskId}/verify`,
  );
  return data.task;
}

// ── #605: Escalation policy ───────────────────────────────────────────────────

export async function getEscalationPolicy(eventId: number | string): Promise<EscalationPolicy | null> {
  const data = await api.get<{ policy: EscalationPolicy | null }>(`/api/events/${eventId}/escalation-policy`);
  return data.policy;
}

export async function upsertEscalationPolicy(
  eventId: number | string,
  policy: Partial<Omit<EscalationPolicy, 'id' | 'event_id'>>,
): Promise<EscalationPolicy> {
  const data = await api.put<{ policy: EscalationPolicy }>(
    `/api/events/${eventId}/escalation-policy`,
    policy,
  );
  return data.policy;
}

// ── #606: My tasks / capacity planning ────────────────────────────────────────

export async function getMyTasks(): Promise<Task[]> {
  const data = await api.get<{ tasks: Task[] }>('/api/tasks/my-tasks');
  return data.tasks;
}

export async function getTaskCapacity(): Promise<TaskCapacity> {
  const data = await api.get<{ capacity: TaskCapacity }>('/api/tasks/capacity');
  return data.capacity;
}
