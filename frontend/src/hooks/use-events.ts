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
        ? '?' + new URLSearchParams(
            Object.entries(filters).reduce<Record<string, string>>((acc, [k, v]) => {
              if (v != null && v !== '') acc[k] = String(v);
              return acc;
            }, {}),
          ).toString()
        : '';
      const data = await api.get<{ events: EventDetail[] }>(`/api/events${params}`);
      return data.events ?? [];
    },
  });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: EVENT_QUERY_KEYS.detail(id),
    queryFn: async () => {
      const data = await api.get<{ event: EventDetail }>(`/api/events/${id}`);
      return data.event;
    },
    enabled: id > 0,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventDetail> & { date?: string; event_date?: string }) =>
      api.post<EventDetail>('/api/events', {
        ...payload,
        event_date: payload.event_date ?? payload.date,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}

export function useUpdateEvent(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<EventDetail> & { date?: string; event_date?: string }) =>
      api.patch<EventDetail>(`/api/events/${id}`, {
        ...payload,
        event_date: payload.event_date ?? payload.date,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(EVENT_QUERY_KEYS.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEYS.all });
    },
  });
}
