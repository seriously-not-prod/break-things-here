/**
 * Task Templates & Time Entries Service (#450)
 */

import { api } from '../lib/api-client';

export interface TaskTemplate {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  priority: 'Low' | 'Medium' | 'High';
  estimated_hours: number | null;
  created_by: number | null;
  created_at: string;
}

export interface TaskTimeEntry {
  id: number;
  task_id: number;
  user_id: number;
  author_name: string;
  hours_spent: number;
  notes: string | null;
  logged_at: string;
  created_at: string;
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function listTaskTemplates(eventId: number | string): Promise<TaskTemplate[]> {
  const data = await api.get<{ templates: TaskTemplate[] }>(
    `/api/events/${eventId}/task-templates`,
  );
  return data.templates;
}

export async function createTaskTemplate(
  eventId: number | string,
  payload: Pick<TaskTemplate, 'name' | 'description' | 'priority' | 'estimated_hours'>,
): Promise<TaskTemplate> {
  const data = await api.post<{ template: TaskTemplate }>(
    `/api/events/${eventId}/task-templates`,
    payload,
  );
  return data.template;
}

export async function deleteTaskTemplate(
  eventId: number | string,
  id: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/task-templates/${id}`);
}

export interface AppliedTask {
  id: number;
  event_id: number;
  title: string;
  description: string | null;
  priority: 'Low' | 'Medium' | 'High';
  estimated_hours: number | null;
  assignee_name: string | null;
  due_date: string | null;
  status: string;
  template_id: number | null;
  created_by: number | null;
  created_at: string;
}

export async function applyTaskTemplate(
  eventId: number | string,
  templateId: number,
  overrides?: { title?: string; assignee_name?: string; due_date?: string },
): Promise<AppliedTask> {
  const data = await api.post<{ task: AppliedTask }>(
    `/api/events/${eventId}/task-templates/${templateId}/apply`,
    overrides ?? {},
  );
  return data.task;
}

// ── Time Entries ─────────────────────────────────────────────────────────────

export async function listTimeEntries(
  eventId: number | string,
  taskId: number | string,
): Promise<{ entries: TaskTimeEntry[]; total_hours: number }> {
  return api.get(`/api/events/${eventId}/tasks/${taskId}/time-entries`);
}

export async function addTimeEntry(
  eventId: number | string,
  taskId: number | string,
  payload: { hours_spent: number; notes?: string; logged_at?: string },
): Promise<TaskTimeEntry> {
  const data = await api.post<{ entry: TaskTimeEntry }>(
    `/api/events/${eventId}/tasks/${taskId}/time-entries`,
    payload,
  );
  return data.entry;
}

export async function deleteTimeEntry(
  eventId: number | string,
  taskId: number | string,
  id: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/tasks/${taskId}/time-entries/${id}`);
}
