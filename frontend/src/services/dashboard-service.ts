/**
 * Dashboard Service
 * Typed API adapter for all dashboard data fetching.
 * Covers issues: #372 #373 #374 #375
 */

import { api } from '../lib/api-client';
import { seededPlannerState } from '../data/event-planner-seed';

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
  canonical_status:
    | 'pending'
    | 'confirmed'
    | 'declined'
    | 'maybe'
    | 'waitlist'
    | 'cancelled'
    | 'checked_in'
    | 'no_show';
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
  try {
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
  } catch {
    return {
      events: seededPlannerState.events.map((event) => ({
        id: Number.parseInt(event.id.replace('event-', ''), 10),
        title: event.title,
        location: event.location,
        date: event.date,
        capacity: null,
        status: event.status,
        created_by_name: 'Demo data',
      })),
      tasks: seededPlannerState.tasks.map((task) => ({
        id: Number.parseInt(task.id.replace('task-', ''), 10),
        event_id: Number.parseInt(task.eventId.replace('event-', ''), 10),
        title: task.title,
        notes: task.description,
        assignee_name: task.assignee,
        due_date: task.dueDate ?? null,
        status: task.status === 'Complete' ? 'Complete' : 'Pending',
        priority: 'Medium',
      })),
      rsvps: seededPlannerState.rsvps.map((rsvp) => ({
        id: Number.parseInt(rsvp.id.replace('rsvp-', ''), 10),
        event_id: Number.parseInt(rsvp.eventId.replace('event-', ''), 10),
        name: rsvp.name,
        email: rsvp.email,
        guests: rsvp.guests,
        canonical_status:
          rsvp.status === 'Confirmed'
            ? 'confirmed'
            : rsvp.status === 'Declined'
              ? 'declined'
              : 'pending',
      })),
    };
  }
}
