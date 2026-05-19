/**
 * Role name constants and helper functions for the 5-role model (BRD v2).
 *
 * Role IDs:
 *  1 = Attendee
 *  2 = Organizer
 *  3 = Admin
 *  4 = Collaborator
 *  5 = Guest
 *  6 = Viewer
 */

export const ROLES = {
  ATTENDEE: 'Attendee',
  ORGANIZER: 'Organizer',
  ADMIN: 'Admin',
  COLLABORATOR: 'Collaborator',
  GUEST: 'Guest',
  VIEWER: 'Viewer',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** Roles that can create and modify event content */
export const EDIT_ROLES: readonly string[] = [ROLES.ORGANIZER, ROLES.ADMIN, ROLES.COLLABORATOR];

/** Roles that have full administrative privileges */
export const ADMIN_ROLES: readonly string[] = [ROLES.ADMIN];

/** Roles that can view event details */
export const VIEW_ROLES: readonly string[] = [
  ROLES.ATTENDEE,
  ROLES.ORGANIZER,
  ROLES.ADMIN,
  ROLES.COLLABORATOR,
  ROLES.GUEST,
  ROLES.VIEWER,
];

/** Can the user edit event content (tasks, vendors, budget, documents, etc.)? */
export function canEditEvent(roleName?: string | null): boolean {
  return !!roleName && (EDIT_ROLES as string[]).includes(roleName);
}

/** Is the user an admin? */
export function isAdmin(roleName?: string | null): boolean {
  return roleName === ROLES.ADMIN;
}

/** Is the user an organizer or above? */
export function isOrganizerOrAbove(roleName?: string | null): boolean {
  return (
    roleName === ROLES.ORGANIZER ||
    roleName === ROLES.ADMIN
  );
}

/** Can the user perform check-in operations? */
export function canCheckIn(roleName?: string | null): boolean {
  return !!roleName && ([ROLES.ORGANIZER, ROLES.ADMIN, ROLES.COLLABORATOR] as string[]).includes(roleName);
}

/** Can the user view-only (Viewer or Guest)? */
export function isViewOnly(roleName?: string | null): boolean {
  return roleName === ROLES.VIEWER || roleName === ROLES.GUEST;
}
