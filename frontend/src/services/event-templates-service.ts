/**
 * Event templates service — story #410, task #432
 * Typed API adapter for /api/event-templates and the apply flow.
 */

import { api } from '../lib/api-client';
import type { Event } from './events-service';

export interface EventTemplate {
  id: number;
  name: string;
  description: string | null;
  default_title: string | null;
  default_location: string | null;
  default_capacity: number | null;
  default_event_type: string | null;
  default_status: 'Draft' | 'Active' | 'Completed' | null;
  default_tags: string | null;
  default_is_public: boolean;
  default_waitlist_enabled: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export type CreateTemplatePayload = Partial<
  Omit<EventTemplate, 'id' | 'created_by' | 'created_at' | 'updated_at'>
> & { name: string };

export interface ApplyTemplateOverrides {
  title?: string;
  date: string;
  location?: string;
  capacity?: number | null;
  status?: 'Draft' | 'Active' | 'Completed';
  event_type?: string | null;
  tags?: string | null;
  is_public?: boolean;
  waitlist_enabled?: boolean;
  description?: string | null;
}

export async function listTemplates(): Promise<EventTemplate[]> {
  const data = await api.get<{ templates: EventTemplate[] }>('/api/event-templates');
  return data.templates ?? [];
}

export async function getTemplate(id: number | string): Promise<EventTemplate> {
  return api.get<EventTemplate>(`/api/event-templates/${id}`);
}

export async function createTemplate(payload: CreateTemplatePayload): Promise<EventTemplate> {
  return api.post<EventTemplate>('/api/event-templates', payload);
}

export async function updateTemplate(
  id: number | string,
  payload: Partial<CreateTemplatePayload>,
): Promise<EventTemplate> {
  return api.patch<EventTemplate>(`/api/event-templates/${id}`, payload);
}

export async function deleteTemplate(id: number | string): Promise<void> {
  await api.delete(`/api/event-templates/${id}`);
}

export async function applyTemplate(
  id: number | string,
  overrides: ApplyTemplateOverrides,
): Promise<Event> {
  return api.post<Event>(`/api/event-templates/${id}/apply`, overrides);
}
