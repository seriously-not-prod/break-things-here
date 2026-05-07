/**
 * Store Suggestions Service (#464)
 */

import { api } from '../lib/api-client';

export interface StoreSuggestion {
  id: number;
  event_id: number;
  name: string;
  website: string | null;
  notes: string | null;
  category: string | null;
  suggested_by: number | null;
  suggester_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export async function listStoreSuggestions(
  eventId: number | string,
  status?: string,
): Promise<StoreSuggestion[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await api.get<{ suggestions: StoreSuggestion[] }>(
    `/api/events/${eventId}/store-suggestions${qs}`,
  );
  return data.suggestions;
}

export async function createStoreSuggestion(
  eventId: number | string,
  payload: { name: string; website?: string; notes?: string; category?: string },
): Promise<StoreSuggestion> {
  const data = await api.post<{ suggestion: StoreSuggestion }>(
    `/api/events/${eventId}/store-suggestions`,
    payload,
  );
  return data.suggestion;
}

export async function updateStoreSuggestionStatus(
  eventId: number | string,
  id: number,
  status: 'pending' | 'approved' | 'rejected',
): Promise<StoreSuggestion> {
  const data = await api.patch<{ suggestion: StoreSuggestion }>(
    `/api/events/${eventId}/store-suggestions/${id}`,
    { status },
  );
  return data.suggestion;
}

export async function deleteStoreSuggestion(
  eventId: number | string,
  id: number,
): Promise<void> {
  await api.delete(`/api/events/${eventId}/store-suggestions/${id}`);
}
