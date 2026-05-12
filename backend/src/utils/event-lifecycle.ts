/**
 * Event lifecycle helpers (#528, #539, #574, #575, #578)
 *
 * Defines the BRD v2 status set, the legal transitions between statuses, and a
 * single source of truth for date validation rules. Enforcing these helpers in
 * one place keeps the controller, tests, and any future bulk action consistent.
 */

export type EventStatus =
  | 'Draft'
  | 'Planning'
  | 'Confirmed'
  | 'Active'
  | 'Completed'
  | 'Cancelled';

export const EVENT_STATUSES: readonly EventStatus[] = [
  'Draft',
  'Planning',
  'Confirmed',
  'Active',
  'Completed',
  'Cancelled',
] as const;

/**
 * Allowed status transitions. Cancelled is reachable from anything pre-completion
 * so organisers can cancel late, and Completed is terminal except for an explicit
 * admin override (handled separately).
 */
const TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  Draft: ['Planning', 'Active', 'Cancelled'],
  Planning: ['Draft', 'Confirmed', 'Active', 'Cancelled'],
  Confirmed: ['Planning', 'Active', 'Cancelled'],
  Active: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: ['Draft'],
};

export function isValidStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && (EVENT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: EventStatus, to: EventStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/**
 * Returns an error message if the transition is invalid; null otherwise. Admins
 * may bypass via `bypass=true` (e.g. reopen a Completed event).
 */
export function describeInvalidTransition(
  from: EventStatus,
  to: EventStatus,
  bypass = false,
): string | null {
  if (bypass) return null;
  if (canTransition(from, to)) return null;
  return `Cannot transition event status from ${from} to ${to}.`;
}

/**
 * Date validation per BRD v2 (#574).
 *
 * - New events must have a future date (>= today, server-local UTC date).
 * - Existing events may keep an in-past date but cannot be moved further into
 *   the past unless they are being marked Completed/Cancelled (i.e. they are
 *   acknowledged as historical).
 *
 * Returns null when valid, otherwise an error message.
 */
export interface DateValidationContext {
  isCreate: boolean;
  currentDate?: string | null;
  status?: EventStatus | null;
  now?: Date;
}

export function validateEventDate(
  dateInput: unknown,
  ctx: DateValidationContext,
): string | null {
  if (dateInput === null || dateInput === undefined || dateInput === '') {
    return ctx.isCreate ? 'date is required.' : null;
  }
  if (typeof dateInput !== 'string') {
    return 'date must be an ISO-formatted string.';
  }

  // Accept YYYY-MM-DD and full ISO timestamps.
  const parsed = new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return 'date is not a valid date.';
  }

  // Normalise to YYYY-MM-DD for comparison so timezones don't make
  // "today" reject inputs that are equal-day in another zone.
  const targetDay = parsed.toISOString().slice(0, 10);
  const now = ctx.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  // Historical events (Completed/Cancelled) are allowed to be past-dated.
  const isHistorical = ctx.status === 'Completed' || ctx.status === 'Cancelled';

  if (ctx.isCreate) {
    if (!isHistorical && targetDay < today) {
      return 'Event date must be today or in the future.';
    }
    return null;
  }

  // Updates: allow keeping a past date if it's unchanged.
  if (ctx.currentDate && ctx.currentDate.slice(0, 10) === targetDay) return null;

  if (!isHistorical && targetDay < today) {
    return 'Event date cannot be moved into the past for an active event.';
  }
  return null;
}
