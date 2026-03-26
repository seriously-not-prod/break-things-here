import { UserRole } from '../types/user-role';
import { Permission, hasPermission } from '../types/permissions';

/**
 * Auth context state shared via React context (stubbed here for non-React usage).
 */
export interface AuthContextState {
  user: { id: string; role: UserRole } | null;
}

let currentAuthState: AuthContextState = { user: null };

/** Set auth state (for testing or initialization). */
export function setAuthState(state: AuthContextState): void {
  currentAuthState = state;
}

/** Get current auth state. */
export function getAuthState(): AuthContextState {
  return currentAuthState;
}

/**
 * Hook: useUserRole
 *
 * Returns the current authenticated user's role, or null if not logged in.
 * In a React app, this would use useContext(AuthContext).
 */
export function useUserRole(): UserRole | null {
  const { user } = getAuthState();
  return user?.role ?? null;
}

/**
 * Hook: useHasPermission
 *
 * Returns true if the current user has the specified permission.
 */
export function useHasPermission(permission: Permission): boolean {
  const role = useUserRole();
  if (!role) return false;
  return hasPermission(role, permission);
}

/**
 * Determines whether a UI element should be rendered for the given role.
 *
 * Enforces visibility by returning false (not rendered), not CSS hiding.
 *
 * @param requiredRoles - Role(s) allowed to see the element.
 * @param currentRole - The current user's role (null = not logged in).
 */
export function isVisibleForRole(
  requiredRoles: UserRole | UserRole[],
  currentRole: UserRole | null,
): boolean {
  if (!currentRole) return false;
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.includes(currentRole);
}
