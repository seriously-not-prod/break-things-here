import {
  DashboardStats,
  EventDraft,
  PlannerEvent,
  PlannerRsvp,
  PlannerTask,
  RsvpDraft,
  TaskDraft,
} from '../types/event-planner';

export interface ValidationErrors {
  [key: string]: string;
}

export function validateEventDraft(draft: EventDraft): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!draft.title.trim()) {
    errors.title = 'Title is required.';
  }

  if (!draft.date) {
    errors.date = 'Date is required.';
  }

  if (!draft.location.trim()) {
    errors.location = 'Location is required.';
  }

  if (!draft.description.trim()) {
    errors.description = 'Description is required.';
  }

  return errors;
}

export function validateTaskDraft(draft: TaskDraft): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!draft.eventId) {
    errors.eventId = 'Please select an event.';
  }

  if (!draft.title.trim()) {
    errors.title = 'Task title is required.';
  }

  if (!draft.assignee.trim()) {
    errors.assignee = 'Assignee is required.';
  }

  if (!draft.dueDate) {
    errors.dueDate = 'Due date is required.';
  }

  return errors;
}

export function validateRsvpDraft(draft: RsvpDraft): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!draft.eventId) {
    errors.eventId = 'Event is required.';
  }

  if (!draft.name.trim()) {
    errors.name = 'Name is required.';
  }

  if (!draft.email.trim()) {
    errors.email = 'Email is required.';
  }

  if (draft.email.trim() && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
    errors.email = 'A valid email address is required.';
  }

  return errors;
}

export function sortEventsByDate(events: PlannerEvent[]): PlannerEvent[] {
  return [...events].sort((left: PlannerEvent, right: PlannerEvent) => {
    return new Date(left.date).getTime() - new Date(right.date).getTime();
  });
}

export function getDashboardStats(
  events: PlannerEvent[],
  tasks: PlannerTask[],
  rsvps: PlannerRsvp[]
): DashboardStats {
  const sortedEvents = sortEventsByDate(events);
  const recentRsvps = [...rsvps]
    .sort((left: PlannerRsvp, right: PlannerRsvp) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .slice(0, 5);

  return {
    totalEvents: events.length,
    activeEvents: events.filter((event: PlannerEvent) => event.status === 'Active').length,
    upcomingEvents: sortedEvents.filter((event: PlannerEvent) => event.status !== 'Completed').slice(0, 4),
    recentRsvps,
    pendingTasks: tasks.filter((task: PlannerTask) => task.status === 'Pending').length,
  };
}

export function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatRelativeTimestamp(value: string): string {
  const deltaMs = Date.now() - new Date(value).getTime();
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function groupEventsByMonth(events: PlannerEvent[]): Array<{ month: string; events: PlannerEvent[] }> {
  const buckets = new Map<string, PlannerEvent[]>();

  sortEventsByDate(events).forEach((event: PlannerEvent) => {
    const monthLabel = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(event.date));
    const current = buckets.get(monthLabel) ?? [];
    current.push(event);
    buckets.set(monthLabel, current);
  });

  return Array.from(buckets.entries()).map(([month, bucketEvents]) => ({
    month,
    events: bucketEvents,
  }));
}
