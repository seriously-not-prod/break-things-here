/**
 * Dashboard Service
 * Typed API adapter for all dashboard data fetching.
 * Covers issues: #372 #373 #374 #375
 */

import { api } from '../lib/api-client';

export interface DashboardEvent {
  id: number;
  title: string;
  location: string | null;
  date: string;
  capacity: number | null;
  status: string;
  created_by_name: string | null;
}

export interface DashboardTask {
  id: number;
  event_id: number;
  title: string;
  notes: string | null;
  assignee_name: string | null;
  due_date: string | null;
  status: 'Pending' | 'In Progress' | 'Blocked' | 'Complete';
  priority: 'Low' | 'Medium' | 'High';
}

export interface DashboardRsvp {
  id: number;
  event_id: number;
  name: string;
  email: string;
  guests: number;
  status: 'Pending' | 'Going' | 'Maybe' | 'Not Going' | 'Declined';
}

export interface DashboardData {
  events: DashboardEvent[];
  tasks: DashboardTask[];
  rsvps: DashboardRsvp[];
}

/**
 * Fetches all data required to render the dashboard panels.
 * Uses /api/events, /api/tasks, and /api/rsvps in parallel.
 */
export async function fetchDashboardData(): Promise<DashboardData> {
  const [events, tasks, rsvps] = await Promise.all([
    api.get<DashboardEvent[]>('/api/events'),
    api.get<DashboardTask[]>('/api/tasks'),
    api.get<DashboardRsvp[]>('/api/rsvps'),
  ]);

  return {
    events: events ?? [],
    tasks: tasks ?? [],
    rsvps: rsvps ?? [],
  };
}
