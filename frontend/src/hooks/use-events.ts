import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api-client';

export const EVENT_QUERY_KEYS = {
  all: ['events'] as const,
  list: (filters?: Record<string, unknown>) => ['events', 'list', filters] as const,
  detail: (id: number) => ['events', 'detail', id] as const,
  members: (id: number) => ['events', id, 'members'] as const,
};

export interface EventDetail {
  id: number;
  title: string;
  date: string;
  endDate?: string;
  location: string;
  description?: string;
  status: string;
  eventType: string;
  isPublic: boolean;
  capacity?: number;
  createdBy: number;
  rsvpDeadline?: string;
  tags?: string;
  currencyCode: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  archivedAt?: string;
}

export function useEvents(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: EVENT_QUERY_KEYS.list(filters),
    queryFn: async () => {
      const params = filters
        ? '?' + new URLSearchParams(filters as Record<string, string>).toString()
        : '';
      const data = await api.get<EventDetail[]>(`/events${params}`);
      return data;
    },
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: EVENT_QUERY_KEYS.detail(id),
    queryFn: () => api.get<EventDetail>(`/events/${id}`),
    enabled: id > 0,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventDetail>) => api.post<EventDetail>('/events', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}

export function useUpdateEvent(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventDetail>) => api.patch<EventDetail>(`/events/${id}`, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(EVENT_QUERY_KEYS.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}
