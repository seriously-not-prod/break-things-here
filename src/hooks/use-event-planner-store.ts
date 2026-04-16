import { useEffect, useMemo, useState } from 'react';
import { EVENT_PLANNER_STORAGE_KEY, seededPlannerState } from '../data/event-planner-seed';
import {
  EventDraft,
  PlannerActivity,
  PlannerEvent,
  PlannerRsvp,
  PlannerState,
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

function loadInitialState(): PlannerState {
  try {
    const savedValue = window.localStorage.getItem(EVENT_PLANNER_STORAGE_KEY);
    if (!savedValue) {
      return seededPlannerState;
    }

    const parsedValue = JSON.parse(savedValue) as PlannerState;
    return {
      events: parsedValue.events ?? seededPlannerState.events,
      tasks: parsedValue.tasks ?? seededPlannerState.tasks,
      rsvps: parsedValue.rsvps ?? seededPlannerState.rsvps,
      users: parsedValue.users ?? seededPlannerState.users,
      activities: parsedValue.activities ?? seededPlannerState.activities,
    };
  } catch {
    return seededPlannerState;
  }
}

export interface EventPlannerStore {
  activities: PlannerActivity[];
  events: PlannerEvent[];
  rsvps: PlannerRsvp[];
  tasks: PlannerTask[];
  createEvent: (draft: EventDraft) => PlannerEvent;
  createTask: (draft: TaskDraft) => PlannerTask;
  submitRsvp: (draft: RsvpDraft, source: 'internal' | 'public') => PlannerRsvp;
  toggleTask: (taskId: string) => void;
  updateEvent: (eventId: string, draft: EventDraft) => PlannerEvent | undefined;
  updateRsvpStatus: (rsvpId: string, status: RsvpStatus) => void;
}

export function useEventPlannerStore(): EventPlannerStore {
  const [state, setState] = useState<PlannerState>(loadInitialState);

  useEffect(() => {
    window.localStorage.setItem(EVENT_PLANNER_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const store = useMemo<EventPlannerStore>(() => {
    function createEvent(draft: EventDraft): PlannerEvent {
      const timestamp = new Date().toISOString();
      const newEvent: PlannerEvent = {
        id: createId('event'),
        ...draft,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      setState((current: PlannerState) => ({
        ...current,
        events: [...current.events, newEvent],
        activities: [createActivity('event', `Created event ${newEvent.title}.`), ...current.activities].slice(0, 25),
      }));

      return newEvent;
    }

    function updateEvent(eventId: string, draft: EventDraft): PlannerEvent | undefined {
      const currentEvent = state.events.find((event: PlannerEvent) => event.id === eventId);
      if (!currentEvent) {
        return undefined;
      }

      const updatedEvent: PlannerEvent = {
        ...currentEvent,
        ...draft,
        updatedAt: new Date().toISOString(),
      };

      setState((current: PlannerState) => ({
        ...current,
        events: current.events.map((event: PlannerEvent) => {
          return event.id === eventId ? updatedEvent : event;
        }),
        activities: [createActivity('event', `Updated event ${updatedEvent.title}.`), ...current.activities].slice(0, 25),
      }));

      return updatedEvent;
    }

    function createTask(draft: TaskDraft): PlannerTask {
      const timestamp = new Date().toISOString();
      const newTask: PlannerTask = {
        id: createId('task'),
        ...draft,
        status: 'Pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const event = state.events.find((item: PlannerEvent) => item.id === draft.eventId);

      setState((current: PlannerState) => ({
        ...current,
        tasks: [...current.tasks, newTask],
        activities: [
          createActivity('task', `Added task ${newTask.title} to ${event?.title ?? 'an event'}.`),
          ...current.activities,
        ].slice(0, 25),
      }));

      return newTask;
    }

    function toggleTask(taskId: string): void {
      setState((current: PlannerState) => {
        const task = current.tasks.find((item: PlannerTask) => item.id === taskId);
        if (!task) {
          return current;
        }

        const nextStatus = task.status === 'Completed' ? 'Pending' : 'Completed';
        return {
          ...current,
          tasks: current.tasks.map((item: PlannerTask) => {
            if (item.id !== taskId) {
              return item;
            }

            return {
              ...item,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            };
          }),
          activities: [
            createActivity('task', `${task.title} marked ${nextStatus.toLowerCase()}.`),
            ...current.activities,
          ].slice(0, 25),
        };
      });
    }

    function submitRsvp(draft: RsvpDraft, source: 'internal' | 'public'): PlannerRsvp {
      const matchingRsvp = state.rsvps.find((item: PlannerRsvp) => {
        return item.eventId === draft.eventId && item.email.toLowerCase() === draft.email.toLowerCase();
      });

      const timestamp = new Date().toISOString();
      const nextRsvp: PlannerRsvp = {
        id: matchingRsvp?.id ?? createId('rsvp'),
        ...draft,
        source,
        updatedAt: timestamp,
      };

      const event = state.events.find((item: PlannerEvent) => item.id === draft.eventId);

      setState((current: PlannerState) => ({
        ...current,
        rsvps: matchingRsvp
          ? current.rsvps.map((item: PlannerRsvp) => {
              return item.id === matchingRsvp.id ? nextRsvp : item;
            })
          : [...current.rsvps, nextRsvp],
        activities: [
          createActivity(
            'rsvp',
            `${draft.name} responded ${draft.status.toLowerCase()} for ${event?.title ?? 'an event'}.`
          ),
          ...current.activities,
        ].slice(0, 25),
      }));

      return nextRsvp;
    }

    function updateRsvpStatus(rsvpId: string, status: RsvpStatus): void {
      setState((current: PlannerState) => {
        const rsvp = current.rsvps.find((item: PlannerRsvp) => item.id === rsvpId);
        if (!rsvp) {
          return current;
        }

        return {
          ...current,
          rsvps: current.rsvps.map((item: PlannerRsvp) => {
            if (item.id !== rsvpId) {
              return item;
            }

            return {
              ...item,
              status,
              updatedAt: new Date().toISOString(),
            };
          }),
          activities: [
            createActivity('rsvp', `RSVP for ${rsvp.name} updated to ${status.toLowerCase()}.`),
            ...current.activities,
          ].slice(0, 25),
        };
      });
    }

    return {
      activities: state.activities,
      events: state.events,
      rsvps: state.rsvps,
      tasks: state.tasks,
      createEvent,
      createTask,
      submitRsvp,
      toggleTask,
      updateEvent,
      updateRsvpStatus,
    };
  }, [state]);

  return store;
}
