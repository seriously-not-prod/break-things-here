export type EventStatus = 'Active' | 'Draft' | 'Completed';

export type TaskStatus = 'Pending' | 'Complete';

export type RsvpStatus = 'Pending' | 'Confirmed' | 'Declined';

export type AdminRole = 'Admin' | 'Organizer' | 'Coordinator';

export type ActivityKind = 'event' | 'task' | 'rsvp' | 'system';

export interface PlannerEvent {
  id: string;
  title: string;
  date: string;
  event_time?: string | null;
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
  description: string;
  assignee: string;
  dueDate?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerRsvp {
  id: string;
  eventId: string;
  name: string;
  email: string;
  guests: number;
  status: RsvpStatus;
  createdAt: string;
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
  event_time?: string;
  location: string;
  description: string;
  status: EventStatus;
}

export interface TaskDraft {
  eventId: string;
  title: string;
  description: string;
  assignee: string;
  dueDate?: string;
}

export interface RsvpDraft {
  eventId: string;
  name: string;
  email: string;
  guests: number;
  status: RsvpStatus;
}

export interface DashboardStats {
  totalEvents: number;
  activeEvents: number;
  upcomingEvents: PlannerEvent[];
  recentRsvps: PlannerRsvp[];
  pendingTasks: number;
}

export interface EventPlannerStore {
  events: PlannerEvent[];
  tasks: PlannerTask[];
  rsvps: PlannerRsvp[];
  activities: PlannerActivity[];
  loading: boolean;
  error: string | null;
  createEvent: (draft: EventDraft) => Promise<PlannerEvent>;
  updateEvent: (id: string, updates: Partial<EventDraft>) => Promise<void>;
  createTask: (draft: TaskDraft) => Promise<PlannerTask>;
  toggleTask: (taskId: string) => Promise<void>;
  submitRsvp: (draft: RsvpDraft) => Promise<PlannerRsvp>;
  updateRsvpStatus: (rsvpId: string, status: RsvpStatus) => Promise<void>;
  notify: (message: string) => void;
  refreshData: () => Promise<void>;
}
