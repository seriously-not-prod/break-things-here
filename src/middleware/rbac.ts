import { UserRole } from '../types/user-role';
import { ApiRequest, ApiResponse, ApiHandler } from '../types/api';
import { HTTP_STATUS, AUTH_ERRORS } from '../utils/http-errors';
import { getTokenVersion } from '../data/user-store';

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
export function requireRole(allowedRoles: UserRole | UserRole[], handler: ApiHandler): ApiHandler {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: ApiRequest, res: ApiResponse) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(AUTH_ERRORS.UNAUTHENTICATED);
    }

    if (!roles.includes(req.user.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json(AUTH_ERRORS.FORBIDDEN);
    }

    // Token version check: reject tokens issued before a role change
    if (req.user.tokenVersion !== undefined) {
      const currentVersion = getTokenVersion(req.user.id);
      if (req.user.tokenVersion !== currentVersion) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(AUTH_ERRORS.TOKEN_EXPIRED);
      }
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
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(AUTH_ERRORS.UNAUTHENTICATED);
    }

    // Token version check: reject tokens issued before a role change
    if (req.user.tokenVersion !== undefined) {
      const currentVersion = getTokenVersion(req.user.id);
      if (req.user.tokenVersion !== currentVersion) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(AUTH_ERRORS.TOKEN_EXPIRED);
      }
    }

    return handler(req, res);
  };
}
