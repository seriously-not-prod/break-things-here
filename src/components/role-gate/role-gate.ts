import { UserRole } from '../../types/user-role';
import { isVisibleForRole } from '../../hooks/use-user-role';

/**
 * Role-based component visibility helper.
 *
 * Returns the children (content) only if the user's role is in the allowed list.
 * This enforces visibility by not rendering — not CSS hiding.
 *
 * Usage (React JSX):
 *   <RoleGate allowedRoles={[UserRole.Admin]} userRole={currentRole}>
 *     <AdminPanel />
 *   </RoleGate>
 */
export interface RoleGateProps {
  allowedRoles: UserRole | UserRole[];
  userRole: UserRole | null;
  children: unknown;
}

/**
 * Returns children if the user's role matches, null otherwise.
 * In a full React app, this would be a React.FC component.
 */
export function roleGate(props: RoleGateProps): unknown {
  if (!isVisibleForRole(props.allowedRoles, props.userRole)) {
    return null;
  }
  return props.children;
}
