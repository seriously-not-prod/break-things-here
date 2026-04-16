export type EventStatus = 'Active' | 'Draft' | 'Completed';

export type TaskStatus = 'Pending' | 'Completed';

export type RsvpStatus = 'Going' | 'Maybe' | 'Not Going';

export type AdminRole = 'Admin' | 'Organizer' | 'Coordinator';

export type ActivityKind = 'event' | 'task' | 'rsvp' | 'system';

export interface PlannerEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerTask {
  id: string;
  eventId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: TaskStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerRsvp {
  id: string;
  eventId: string;
  name: string;
  email: string;
  status: RsvpStatus;
  notes: string;
  source: 'internal' | 'public';
  updatedAt: string;
}

export interface PlannerUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

export interface PlannerActivity {
  id: string;
  kind: ActivityKind;
  message: string;
  createdAt: string;
}

export interface PlannerState {
  events: PlannerEvent[];
  tasks: PlannerTask[];
  rsvps: PlannerRsvp[];
  users: PlannerUser[];
  activities: PlannerActivity[];
}

export interface EventDraft {
  title: string;
  date: string;
  location: string;
  description: string;
  status: EventStatus;
}

export interface TaskDraft {
  eventId: string;
  title: string;
  assignee: string;
  dueDate: string;
  notes: string;
}

export interface RsvpDraft {
  eventId: string;
  name: string;
  email: string;
  status: RsvpStatus;
  notes: string;
}

export interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  upcomingEvents: PlannerEvent[];
  recentRsvps: PlannerRsvp[];
  pendingTasks: number;
}
