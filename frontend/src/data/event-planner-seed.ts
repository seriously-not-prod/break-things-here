export interface SeededPlannerEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  status: 'Draft' | 'Active' | 'Completed';
  createdAt: string;
  updatedAt: string;
}

export interface SeededPlannerTask {
  id: string;
  eventId: string;
  title: string;
  description: string;
  assignee: string;
  dueDate: string | undefined;
  status: 'Pending' | 'Complete';
  createdAt: string;
  updatedAt: string;
}

export interface SeededPlannerRsvp {
  id: string;
  eventId: string;
  name: string;
  email: string;
  guests: number;
  status: 'Pending' | 'Confirmed' | 'Declined';
  createdAt: string;
}

export interface SeededPlannerState {
  events: SeededPlannerEvent[];
  tasks: SeededPlannerTask[];
  rsvps: SeededPlannerRsvp[];
}

export const seededPlannerState: SeededPlannerState = {
  events: [
    {
      id: 'event-001',
      title: 'Riverfront Music Weekend',
      date: '2026-05-18',
      location: 'Austin, TX',
      description: 'A two-day outdoor festival with live music, food trucks, and sponsor activations.',
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
      description: 'A neighborhood event featuring local chefs, nonprofit booths, and family activities.',
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
  ],
  tasks: [
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
  ],
  rsvps: [
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
  ],
};
