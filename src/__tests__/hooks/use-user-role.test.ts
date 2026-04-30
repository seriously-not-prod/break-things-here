import { UserRole } from '../../types/user-role';
import { Permission } from '../../types/permissions';
import {
  useUserRole,
  useHasPermission,
  isVisibleForRole,
  setAuthState,
} from '../../hooks/use-user-role';

interface RoleGateProps {
  allowedRoles: UserRole | UserRole[];
  userRole: UserRole | null;
  children: unknown;
}

function roleGate(props: RoleGateProps): unknown {
  if (!isVisibleForRole(props.allowedRoles, props.userRole)) return null;
  return props.children;
}

describe('useUserRole hook', () => {
  afterEach(() => setAuthState({ user: null }));

  it('should return null when no user is authenticated', () => {
    setAuthState({ user: null });
    expect(useUserRole()).toBeNull();
  });

  it('should return Admin role for admin user', () => {
    setAuthState({ user: { id: '1', role: UserRole.Admin } });
    expect(useUserRole()).toBe(UserRole.Admin);
  });

  it('should return Organizer role for organizer user', () => {
    setAuthState({ user: { id: '2', role: UserRole.Organizer } });
    expect(useUserRole()).toBe(UserRole.Organizer);
  });

  it('should return Attendee role for attendee user', () => {
    setAuthState({ user: { id: '3', role: UserRole.Attendee } });
    expect(useUserRole()).toBe(UserRole.Attendee);
  });
});

describe('useHasPermission hook', () => {
  afterEach(() => setAuthState({ user: null }));

  it('should return false when no user is authenticated', () => {
    setAuthState({ user: null });
    expect(useHasPermission(Permission.ManageUsers)).toBe(false);
  });

  it('should return true for Admin with ManageUsers', () => {
    setAuthState({ user: { id: '1', role: UserRole.Admin } });
    expect(useHasPermission(Permission.ManageUsers)).toBe(true);
  });

  it('should return false for Attendee with ManageUsers', () => {
    setAuthState({ user: { id: '1', role: UserRole.Attendee } });
    expect(useHasPermission(Permission.ManageUsers)).toBe(false);
  });

  it('should return true for Attendee with BrowseEvents', () => {
    setAuthState({ user: { id: '1', role: UserRole.Attendee } });
    expect(useHasPermission(Permission.BrowseEvents)).toBe(true);
  });
});

describe('isVisibleForRole', () => {
  it('should return false when currentRole is null', () => {
    expect(isVisibleForRole(UserRole.Admin, null)).toBe(false);
  });

  it('should return true when role matches single required role', () => {
    expect(isVisibleForRole(UserRole.Admin, UserRole.Admin)).toBe(true);
  });

  it('should return false when role does not match single required role', () => {
    expect(isVisibleForRole(UserRole.Admin, UserRole.Attendee)).toBe(false);
  });

  it('should return true when role is in array of required roles', () => {
    expect(
      isVisibleForRole([UserRole.Admin, UserRole.Organizer], UserRole.Organizer),
    ).toBe(true);
  });

  it('should return false when role is not in array of required roles', () => {
    expect(
      isVisibleForRole([UserRole.Admin, UserRole.Organizer], UserRole.Attendee),
    ).toBe(false);
  });

  // Admin can see organizer-only elements
  it('should show organizer content to Admin when Admin is in allowed list', () => {
    expect(
      isVisibleForRole([UserRole.Admin, UserRole.Organizer], UserRole.Admin),
    ).toBe(true);
  });
});

describe('roleGate component', () => {
  it('should return children when role matches', () => {
    const props: RoleGateProps = {
      allowedRoles: UserRole.Admin,
      userRole: UserRole.Admin,
      children: 'admin-content',
    };
    expect(roleGate(props)).toBe('admin-content');
  });

  it('should return null when role does not match', () => {
    const props: RoleGateProps = {
      allowedRoles: UserRole.Admin,
      userRole: UserRole.Attendee,
      children: 'admin-content',
    };
    expect(roleGate(props)).toBeNull();
  });

  it('should return null when user is not logged in', () => {
    const props: RoleGateProps = {
      allowedRoles: UserRole.Admin,
      userRole: null,
      children: 'content',
    };
    expect(roleGate(props)).toBeNull();
  });

  it('should hide Admin-only content from Organizer', () => {
    const props: RoleGateProps = {
      allowedRoles: [UserRole.Admin],
      userRole: UserRole.Organizer,
      children: 'admin-panel',
    };
    expect(roleGate(props)).toBeNull();
  });

  it('should hide Admin-only content from Attendee', () => {
    const props: RoleGateProps = {
      allowedRoles: [UserRole.Admin],
      userRole: UserRole.Attendee,
      children: 'admin-panel',
    };
    expect(roleGate(props)).toBeNull();
  });

  it('should show Organizer content to Admin when both are allowed', () => {
    const props: RoleGateProps = {
      allowedRoles: [UserRole.Admin, UserRole.Organizer],
      userRole: UserRole.Admin,
      children: 'org-content',
    };
    expect(roleGate(props)).toBe('org-content');
  });

  it('should hide Organizer content from Attendee', () => {
    const props: RoleGateProps = {
      allowedRoles: [UserRole.Admin, UserRole.Organizer],
      userRole: UserRole.Attendee,
      children: 'org-content',
    };
    expect(roleGate(props)).toBeNull();
  });
});
