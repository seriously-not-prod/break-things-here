import { UserRole } from './user-role';

/**
 * All permissions available in the application.
 */
export enum Permission {
  // User management
  ManageUsers = 'manage:users',
  AssignRoles = 'assign:roles',

  // Event management
  CreateEvent = 'create:event',
  EditOwnEvent = 'edit:own-event',
  DeleteOwnEvent = 'delete:own-event',
  EditAnyEvent = 'edit:any-event',
  DeleteAnyEvent = 'delete:any-event',
  ViewEventAttendees = 'view:event-attendees',

  // Event participation
  BrowseEvents = 'browse:events',
  RegisterForEvent = 'register:event',

  // Profile
  ViewOwnProfile = 'view:own-profile',
  EditOwnProfile = 'edit:own-profile',
  DeleteOwnAccount = 'delete:own-account',

  // Settings
  ManageSettings = 'manage:settings',
}

/**
 * Maps each role to its set of permissions.
 */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.Admin]: new Set([
    // Full access
    Permission.ManageUsers,
    Permission.AssignRoles,
    Permission.CreateEvent,
    Permission.EditOwnEvent,
    Permission.DeleteOwnEvent,
    Permission.EditAnyEvent,
    Permission.DeleteAnyEvent,
    Permission.ViewEventAttendees,
    Permission.BrowseEvents,
    Permission.RegisterForEvent,
    Permission.ViewOwnProfile,
    Permission.EditOwnProfile,
    Permission.DeleteOwnAccount,
    Permission.ManageSettings,
  ]),

  [UserRole.Organizer]: new Set([
    Permission.CreateEvent,
    Permission.EditOwnEvent,
    Permission.DeleteOwnEvent,
    Permission.ViewEventAttendees,
    Permission.BrowseEvents,
    Permission.RegisterForEvent,
    Permission.ViewOwnProfile,
    Permission.EditOwnProfile,
    Permission.DeleteOwnAccount,
  ]),

  [UserRole.Attendee]: new Set([
    Permission.BrowseEvents,
    Permission.RegisterForEvent,
    Permission.ViewOwnProfile,
    Permission.EditOwnProfile,
    Permission.DeleteOwnAccount,
  ]),
};

/**
 * Check whether a given role has a specific permission.
 *
 * Returns false if the role is not a valid UserRole.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.has(permission);
}
