/**
 * User roles for the Festival Event Planner application.
 *
 * - Admin: Full access — manage users, events, and settings
 * - Organizer: Create and manage their own events; view attendees for their events
 * - Attendee: Browse events, register for events, manage own profile
 */
export enum UserRole {
  Admin = 'Admin',
  Organizer = 'Organizer',
  Attendee = 'Attendee',
}

export const USER_ROLES = [UserRole.Admin, UserRole.Organizer, UserRole.Attendee] as const;

export const DEFAULT_ROLE = UserRole.Attendee;
