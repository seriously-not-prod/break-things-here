import {
  PlannerActivity,
  PlannerEvent,
  PlannerRsvp,
  PlannerState,
  PlannerTask,
  PlannerUser,
} from '../types/event-planner';

export const EVENT_PLANNER_STORAGE_KEY = 'festival-event-planner.v1';

export const seededEvents: PlannerEvent[] = [
  {
    id: 'event-001',
    title: 'Riverfront Music Weekend',
    date: '2026-05-18',
    location: 'Austin, TX',
    description:
      'A two-day outdoor festival with live music, food trucks, and sponsor activations.',
    status: 'Active',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-04-11T14:10:00.000Z',
  },
  {
    id: 'event-002',
    title: 'Indie Film Night',
    date: '2026-05-29',
    location: 'Portland, OR',
    description: 'An evening screening series for regional filmmakers with post-show networking.',
    status: 'Active',
    createdAt: '2026-03-10T12:30:00.000Z',
    updatedAt: '2026-04-12T16:00:00.000Z',
  },
  {
    id: 'event-003',
    title: 'Community Food Fair',
    date: '2026-06-06',
    location: 'Denver, CO',
    description:
      'A neighborhood event featuring local chefs, nonprofit booths, and family activities.',
    status: 'Draft',
    createdAt: '2026-03-20T11:00:00.000Z',
    updatedAt: '2026-04-09T09:15:00.000Z',
  },
  {
    id: 'event-004',
    title: 'Winter Lights Gala',
    date: '2026-02-14',
    location: 'Chicago, IL',
    description: 'A completed donor gala with VIP seating, live auction, and post-event reception.',
    status: 'Completed',
    createdAt: '2025-12-15T18:00:00.000Z',
    updatedAt: '2026-02-15T07:00:00.000Z',
  },
];

export const seededTasks: PlannerTask[] = [
  {
    id: 'task-001',
    eventId: 'event-001',
    title: 'Confirm headline artist contract',
    description: 'Legal review is complete, waiting on countersignature.',
    assignee: 'Morgan Lee',
    dueDate: '2026-04-20',
    status: 'Pending',
    createdAt: '2026-04-05T08:30:00.000Z',
    updatedAt: '2026-04-05T08:30:00.000Z',
  },
  {
    id: 'task-002',
    eventId: 'event-001',
    title: 'Finalize sponsor booth layout',
    description: 'Need final dimensions from venue operations.',
    assignee: 'Casey Jones',
    dueDate: '2026-04-23',
    status: 'Pending',
    createdAt: '2026-04-06T10:00:00.000Z',
    updatedAt: '2026-04-06T10:00:00.000Z',
  },
  {
    id: 'task-003',
    eventId: 'event-002',
    title: 'Publish attendee reminder email',
    description: 'Email drafted and approved by marketing.',
    assignee: 'Avery Patel',
    dueDate: '2026-05-22',
    status: 'Complete',
    createdAt: '2026-04-01T12:00:00.000Z',
    updatedAt: '2026-04-12T15:40:00.000Z',
  },
  {
    id: 'task-004',
    eventId: 'event-003',
    title: 'Shortlist food vendors',
    description: 'Waiting on pricing from three vendors.',
    assignee: 'Jordan Kim',
    dueDate: '2026-04-25',
    status: 'Pending',
    createdAt: '2026-04-10T11:45:00.000Z',
    updatedAt: '2026-04-10T11:45:00.000Z',
  },
];

export const seededRsvps: PlannerRsvp[] = [
  {
    id: 'rsvp-001',
    eventId: 'event-001',
    name: 'Taylor Brooks',
    email: 'taylor@example.com',
    guests: 2,
    status: 'Confirmed',
    createdAt: '2026-04-13T13:20:00.000Z',
  },
  {
    id: 'rsvp-002',
    eventId: 'event-001',
    name: 'Jamie Chen',
    email: 'jamie@example.com',
    guests: 1,
    status: 'Pending',
    createdAt: '2026-04-12T17:45:00.000Z',
  },
  {
    id: 'rsvp-003',
    eventId: 'event-002',
    name: 'Riley Adams',
    email: 'riley@example.com',
    guests: 2,
    status: 'Confirmed',
    createdAt: '2026-04-11T09:05:00.000Z',
  },
  {
    id: 'rsvp-004',
    eventId: 'event-003',
    name: 'Cameron Reed',
    email: 'cameron@example.com',
    guests: 1,
    status: 'Declined',
    createdAt: '2026-04-09T15:00:00.000Z',
  },
];

export const seededUsers: PlannerUser[] = [
  {
    id: 'user-001',
    name: 'Alex Carter',
    email: 'alex.carter@festival.local',
    role: 'Admin',
  },
  {
    id: 'user-002',
    name: 'Morgan Lee',
    email: 'morgan.lee@festival.local',
    role: 'Organizer',
  },
  {
    id: 'user-003',
    name: 'Jordan Kim',
    email: 'jordan.kim@festival.local',
    role: 'Coordinator',
  },
];

export const seededActivities: PlannerActivity[] = [
  {
    id: 'activity-001',
    kind: 'event',
    message: 'Riverfront Music Weekend moved into active planning.',
    createdAt: '2026-04-13T08:00:00.000Z',
  },
  {
    id: 'activity-002',
    kind: 'rsvp',
    message: 'Taylor Brooks submitted a public RSVP for Riverfront Music Weekend.',
    createdAt: '2026-04-13T13:20:00.000Z',
  },
  {
    id: 'activity-003',
    kind: 'task',
    message: 'Publish attendee reminder email was marked complete.',
    createdAt: '2026-04-12T15:40:00.000Z',
  },
  {
    id: 'activity-004',
    kind: 'system',
    message: 'Admin overview refreshed for this training workspace.',
    createdAt: '2026-04-11T09:00:00.000Z',
  },
];

export const seededPlannerState: PlannerState = {
  events: seededEvents,
  tasks: seededTasks,
  rsvps: seededRsvps,
  users: seededUsers,
  activities: seededActivities,
};
