import { create } from 'zustand';

export type EventStatus = 'Draft' | 'Planning' | 'Confirmed' | 'Active' | 'Completed' | 'Cancelled';

export interface EventSummary {
  id: number;
  title: string;
  date: string;
  endDate?: string;
  location: string;
  status: EventStatus;
  eventType: string;
  isPublic: boolean;
  capacity?: number;
  createdBy: number;
}

interface EventFilters {
  search: string;
  status: EventStatus | '';
  eventType: string;
  view: 'list' | 'grid' | 'calendar' | 'timeline';
}

interface EventState {
  events: EventSummary[];
  selectedEventId: number | null;
  filters: EventFilters;
  isLoading: boolean;
  error: string | null;
  setEvents: (events: EventSummary[]) => void;
  setSelectedEventId: (id: number | null) => void;
  updateFilters: (patch: Partial<EventFilters>) => void;
  resetFilters: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const DEFAULT_FILTERS: EventFilters = {
  search: '',
  status: '',
  eventType: '',
  view: 'list',
};

export const useEventStore = create<EventState>()((set) => ({
  events: [],
  selectedEventId: null,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  error: null,
  setEvents: (events) => set({ events }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  updateFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
