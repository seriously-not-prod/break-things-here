import { UserRole } from '../types/user-role';
import { ApiRequest, ApiResponse, ApiHandler } from '../types/api';

/**
 * RBAC middleware that restricts access to users with the required role(s).
 *
 * - Returns 401 if the user is not authenticated (no user on request).
 * - Returns 403 if the user's role is not in the allowed roles list.
 * - Calls the handler if the user's role is authorized.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 * @param handler - The API route handler to execute if authorized.
 */
export function requireRole(
  allowedRoles: UserRole | UserRole[],
  handler: ApiHandler,
): ApiHandler {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: ApiRequest, res: ApiResponse) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return handler(req, res);
  };
}

/**
 * Middleware that only requires authentication (any role is allowed).
 */
export function requireAuth(handler: ApiHandler): ApiHandler {
  return (req: ApiRequest, res: ApiResponse) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    return handler(req, res);
  };
}
