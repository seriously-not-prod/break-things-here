import { UserRole, USER_ROLES, DEFAULT_ROLE } from '../types/user-role';
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
} from '../types/permissions';
import { USER_SCHEMA } from '../types/user';

describe('UserRole enum', () => {
  it('should define exactly three roles', () => {
    expect(USER_ROLES).toHaveLength(3);
  });

  it('should contain Admin, Organizer, and Attendee', () => {
    expect(USER_ROLES).toContain(UserRole.Admin);
    expect(USER_ROLES).toContain(UserRole.Organizer);
    expect(USER_ROLES).toContain(UserRole.Attendee);
  });

  it('should have string values matching role names', () => {
    expect(UserRole.Admin).toBe('Admin');
    expect(UserRole.Organizer).toBe('Organizer');
    expect(UserRole.Attendee).toBe('Attendee');
  });

  it('should set Attendee as the default role', () => {
    expect(DEFAULT_ROLE).toBe(UserRole.Attendee);
  });
});

describe('Role permissions', () => {
  it('should define permissions for all three roles', () => {
    expect(ROLE_PERMISSIONS[UserRole.Admin]).toBeDefined();
    expect(ROLE_PERMISSIONS[UserRole.Organizer]).toBeDefined();
    expect(ROLE_PERMISSIONS[UserRole.Attendee]).toBeDefined();
  });

  describe('Admin role', () => {
    it('should have all permissions', () => {
      const adminPerms = ROLE_PERMISSIONS[UserRole.Admin];
      for (const perm of Object.values(Permission)) {
        expect(adminPerms.has(perm)).toBe(true);
      }
    });

    it('should have ManageUsers and AssignRoles', () => {
      expect(hasPermission(UserRole.Admin, Permission.ManageUsers)).toBe(true);
      expect(hasPermission(UserRole.Admin, Permission.AssignRoles)).toBe(true);
    });
  });

  describe('Organizer role', () => {
    it('should be able to create and manage own events', () => {
      expect(hasPermission(UserRole.Organizer, Permission.CreateEvent)).toBe(true);
      expect(hasPermission(UserRole.Organizer, Permission.EditOwnEvent)).toBe(true);
      expect(hasPermission(UserRole.Organizer, Permission.DeleteOwnEvent)).toBe(true);
      expect(hasPermission(UserRole.Organizer, Permission.ViewEventAttendees)).toBe(true);
    });

    it('should NOT be able to manage users or settings', () => {
      expect(hasPermission(UserRole.Organizer, Permission.ManageUsers)).toBe(false);
      expect(hasPermission(UserRole.Organizer, Permission.AssignRoles)).toBe(false);
      expect(hasPermission(UserRole.Organizer, Permission.ManageSettings)).toBe(false);
    });

    it('should NOT be able to edit/delete any event', () => {
      expect(hasPermission(UserRole.Organizer, Permission.EditAnyEvent)).toBe(false);
      expect(hasPermission(UserRole.Organizer, Permission.DeleteAnyEvent)).toBe(false);
    });
  });

  describe('Attendee role', () => {
    it('should be able to browse and register for events', () => {
      expect(hasPermission(UserRole.Attendee, Permission.BrowseEvents)).toBe(true);
      expect(hasPermission(UserRole.Attendee, Permission.RegisterForEvent)).toBe(true);
    });

    it('should be able to manage own profile', () => {
      expect(hasPermission(UserRole.Attendee, Permission.ViewOwnProfile)).toBe(true);
      expect(hasPermission(UserRole.Attendee, Permission.EditOwnProfile)).toBe(true);
      expect(hasPermission(UserRole.Attendee, Permission.DeleteOwnAccount)).toBe(true);
    });

    it('should NOT be able to create or manage events', () => {
      expect(hasPermission(UserRole.Attendee, Permission.CreateEvent)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.EditOwnEvent)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.DeleteOwnEvent)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.EditAnyEvent)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.DeleteAnyEvent)).toBe(false);
    });

    it('should NOT be able to manage users or settings', () => {
      expect(hasPermission(UserRole.Attendee, Permission.ManageUsers)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.AssignRoles)).toBe(false);
      expect(hasPermission(UserRole.Attendee, Permission.ManageSettings)).toBe(false);
    });
  });
});

describe('hasPermission helper', () => {
  it('returns true for a valid role-permission pair', () => {
    expect(hasPermission(UserRole.Admin, Permission.ManageUsers)).toBe(true);
  });

  it('returns false for an invalid role-permission pair', () => {
    expect(hasPermission(UserRole.Attendee, Permission.ManageUsers)).toBe(false);
  });

  it('returns false for an unknown/invalid role without crashing', () => {
    expect(hasPermission('InvalidRole' as UserRole, Permission.ManageUsers)).toBe(false);
  });
});

describe('User schema', () => {
  it('should have a role column with enum type', () => {
    expect(USER_SCHEMA.columns.role.type).toBe('enum');
  });

  it('should list all three roles as valid enum values', () => {
    expect(USER_SCHEMA.columns.role.values).toHaveLength(3);
    expect(USER_SCHEMA.columns.role.values).toEqual(
      expect.arrayContaining(['Admin', 'Organizer', 'Attendee']),
    );
  });

  it('should default role to Attendee', () => {
    expect(USER_SCHEMA.columns.role.default).toBe(UserRole.Attendee);
  });
});
