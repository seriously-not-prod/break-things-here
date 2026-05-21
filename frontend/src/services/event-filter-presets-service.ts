/**
 * Saved event filter presets service — story #416, task #454
 */

import { api } from '../lib/api-client';
import type { EventListFilters } from './events-service';

export interface FilterPreset {
  id: number;
  name: string;
  filters: EventListFilters;
  created_at: string;
  updated_at: string;
}

export async function listPresets(): Promise<FilterPreset[]> {
  const data = await api.get<{ presets: FilterPreset[] }>('/api/event-filter-presets');
  return data.presets ?? [];
}

export async function createPreset(name: string, filters: EventListFilters): Promise<FilterPreset> {
  return api.post<FilterPreset>('/api/event-filter-presets', { name, filters });
}

export async function updatePreset(
  id: number | string,
  payload: { name?: string; filters?: EventListFilters },
): Promise<FilterPreset> {
  return api.put<FilterPreset>(`/api/event-filter-presets/${id}`, payload);
}

export async function deletePreset(id: number | string): Promise<void> {
  await api.delete<{ message: string }>(`/api/event-filter-presets/${id}`);
}
