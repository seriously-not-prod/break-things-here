import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/event-planner-api';
import {
  EventDraft,
  EventPlannerStore,
  PlannerActivity,
  PlannerEvent,
  PlannerRsvp,
  PlannerTask,
  RsvpDraft,
  RsvpStatus,
  TaskDraft,
} from '../types/event-planner';

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createActivity(kind: PlannerActivity['kind'], message: string): PlannerActivity {
  return {
    id: createId('activity'),
    kind,
    message,
    createdAt: new Date().toISOString(),
  };
}

// Convert API event to PlannerEvent format
function mapApiEventToPlanner(event: api.Event): PlannerEvent {
  return {
    id: `event-${event.id}`,
    title: event.title,
    date: event.date,
    location: event.location,
    description: event.description,
    status: event.status,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

// Convert API task to PlannerTask format
function mapApiTaskToPlanner(task: api.Task): PlannerTask {
  return {
    id: `task-${task.id}`,
    eventId: `event-${task.event_id}`,
    title: task.title,
    description: task.description,
    assignee: task.assignee,
    dueDate: task.due_date || undefined,
    status: task.status,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

// Convert API RSVP to PlannerRsvp format
function mapApiRsvpToPlanner(rsvp: api.Rsvp): PlannerRsvp {
  return {
    id: `rsvp-${rsvp.id}`,
    eventId: `event-${rsvp.event_id}`,
    name: rsvp.name,
    email: rsvp.email,
    guests: rsvp.guests,
    status: rsvp.status,
    createdAt: rsvp.created_at,
  };
}

export function useEventPlannerStore(): EventPlannerStore {
  const [state, setState] = useState<{
    events: PlannerEvent[];
    tasks: PlannerTask[];
    rsvps: PlannerRsvp[];
    activities: PlannerActivity[];
  }>({
    events: [],
    tasks: [],
    rsvps: [],
    activities: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data from API on mount
  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[EventPlanner] 🔄 Loading data from backend database...');

      const [events, tasks, rsvps] = await Promise.all([
        api.getAllEvents(),
        api.getAllTasks(),
        api.getAllRsvps(),
      ]);

      setState({
        events: events.map(mapApiEventToPlanner),
        tasks: tasks.map(mapApiTaskToPlanner),
        rsvps: rsvps.map(mapApiRsvpToPlanner),
        activities: [],
      });

      console.log('[EventPlanner] ✅ Loaded from database:', {
        events: events.length,
        tasks: tasks.length,
        rsvps: rsvps.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      console.error('[EventPlanner] ❌ Error loading data:', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const notify = useCallback((message: string) => {
    const activity = createActivity('event', message);
    setState((current) => ({
      ...current,
      activities: [activity, ...current.activities].slice(0, 25),
    }));
  }, []);

  const createEvent = useCallback(async (draft: EventDraft): Promise<PlannerEvent> => {
    console.log('[EventPlanner] 💾 Creating event in database:', draft.title);

    const apiEvent = await api.createEvent({
      title: draft.title,
      date: draft.date,
      location: draft.location,
      description: draft.description,
      status: draft.status,
    });

    const newEvent = mapApiEventToPlanner(apiEvent);

    setState((current) => ({
      ...current,
      events: [...current.events, newEvent],
      activities: [
        createActivity('event', `Created event ${newEvent.title}.`),
        ...current.activities,
      ].slice(0, 25),
    }));

    console.log('[EventPlanner] ✅ Event saved to database with ID:', apiEvent.id);
    return newEvent;
  }, []);

  const updateEvent = useCallback(
    async (eventId: string, updates: Partial<EventDraft>): Promise<void> => {
      const numericId = parseInt(eventId.replace('event-', ''));
      console.log('[EventPlanner] 💾 Updating event in database:', numericId);

      const apiEvent = await api.updateEvent(numericId, updates);
      const updatedEvent = mapApiEventToPlanner(apiEvent);

      setState((current) => ({
        ...current,
        events: current.events.map((event) => (event.id === eventId ? updatedEvent : event)),
        activities: [
          createActivity('event', `Updated event ${updatedEvent.title}.`),
          ...current.activities,
        ].slice(0, 25),
      }));

      console.log('[EventPlanner] ✅ Event updated in database');
    },
    [],
  );

  const createTask = useCallback(async (draft: TaskDraft): Promise<PlannerTask> => {
    const eventNumericId = parseInt(draft.eventId.replace('event-', ''));
    console.log('[EventPlanner] 💾 Creating task in database');

    const apiTask = await api.createTask({
      event_id: eventNumericId,
      title: draft.title,
      description: draft.description,
      assignee: draft.assignee,
      due_date: draft.dueDate,
      status: 'Pending',
    });

    const newTask = mapApiTaskToPlanner(apiTask);

    setState((current) => {
      const event = current.events.find((e) => e.id === draft.eventId);
      return {
        ...current,
        tasks: [...current.tasks, newTask],
        activities: [
          createActivity('task', `Added task ${newTask.title} to ${event?.title ?? 'an event'}.`),
          ...current.activities,
        ].slice(0, 25),
      };
    });

    console.log('[EventPlanner] ✅ Task saved to database with ID:', apiTask.id);
    return newTask;
  }, []);

  const toggleTask = useCallback(async (taskId: string): Promise<void> => {
    const numericId = parseInt(taskId.replace('task-', ''));
    console.log('[EventPlanner] 💾 Toggling task status in database:', numericId);

    const apiTask = await api.toggleTaskStatus(numericId);
    const updatedTask = mapApiTaskToPlanner(apiTask);

    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updatedTask : task)),
      activities: [
        createActivity('task', `${updatedTask.title} marked ${updatedTask.status.toLowerCase()}.`),
        ...current.activities,
      ].slice(0, 25),
    }));

    console.log('[EventPlanner] ✅ Task status updated in database');
  }, []);

  const submitRsvp = useCallback(async (draft: RsvpDraft): Promise<PlannerRsvp> => {
    const eventNumericId = parseInt(draft.eventId.replace('event-', ''));
    console.log('[EventPlanner] 💾 Submitting RSVP to database');

    const apiRsvp = await api.submitRsvp({
      event_id: eventNumericId,
      name: draft.name,
      email: draft.email,
      guests: draft.guests,
      status: draft.status,
    });

    const newRsvp = mapApiRsvpToPlanner(apiRsvp);

    setState((current) => {
      const event = current.events.find((e) => e.id === draft.eventId);
      return {
        ...current,
        rsvps: [...current.rsvps, newRsvp],
        activities: [
          createActivity(
            'rsvp',
            `${draft.name} responded ${draft.status.toLowerCase()} for ${event?.title ?? 'an event'}.`,
          ),
          ...current.activities,
        ].slice(0, 25),
      };
    });

    console.log('[EventPlanner] ✅ RSVP saved to database with ID:', apiRsvp.id);
    return newRsvp;
  }, []);

  const updateRsvpStatus = useCallback(
    async (rsvpId: string, status: RsvpStatus): Promise<void> => {
      const numericId = parseInt(rsvpId.replace('rsvp-', ''));
      console.log('[EventPlanner] 💾 Updating RSVP status in database:', numericId);

      const apiRsvp = await api.updateRsvp(numericId, { status });
      const updatedRsvp = mapApiRsvpToPlanner(apiRsvp);

      setState((current) => ({
        ...current,
        rsvps: current.rsvps.map((rsvp) => (rsvp.id === rsvpId ? updatedRsvp : rsvp)),
        activities: [
          createActivity(
            'rsvp',
            `RSVP for ${updatedRsvp.name} updated to ${status.toLowerCase()}.`,
          ),
          ...current.activities,
        ].slice(0, 25),
      }));

      console.log('[EventPlanner] ✅ RSVP status updated in database');
    },
    [],
  );

  return {
    activities: state.activities,
    events: state.events,
    rsvps: state.rsvps,
    tasks: state.tasks,
    loading,
    error,
    createEvent,
    updateEvent,
    createTask,
    toggleTask,
    submitRsvp,
    updateRsvpStatus,
    notify,
    refreshData,
  };
}
