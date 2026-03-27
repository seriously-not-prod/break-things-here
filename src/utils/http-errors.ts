/**
 * Standardized API error responses for security-sensitive endpoints.
 *
 * Ensures consistent HTTP status codes across all protected routes:
 *   401 — Unauthenticated (no valid token)
 *   403 — Forbidden (authenticated but wrong role)
 *   400 — Bad request (invalid input)
 *   404 — Resource not found
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
} as const;

/**
 * Standard error response shapes for protected endpoints.
 */
export const AUTH_ERRORS = {
  UNAUTHENTICATED: { error: 'Authentication required' },
  FORBIDDEN: { error: 'Insufficient permissions' },
  INVALID_ROLE: { error: 'Invalid role. Must be one of: Admin, Organizer, Attendee' },
  USER_NOT_FOUND: { error: 'User not found' },
  SELF_ROLE_CHANGE: { error: 'Cannot change your own role' },
} as const;

/**
 * Security audit checklist for protected routes.
 *
 * All role-protected endpoints MUST:
 * 1. Return 401 for unauthenticated requests (no user/token)
 * 2. Return 403 for wrong-role requests (never 404 or 200)
 * 3. Never leak data in error responses
 * 4. Use requireRole() or requireAuth() middleware
 *
 * Protected routes in this application:
 *
 * | Endpoint                         | Method | Required Role | Status |
 * |----------------------------------|--------|---------------|--------|
 * | /api/admin/users/:id/role        | PATCH  | Admin         | ✅     |
 * | /api/auth/register               | POST   | None (public) | ✅     |
 *
 * Routes to be added by future tasks should follow the same pattern
 * using requireRole() or requireAuth() from src/middleware/rbac.ts.
 */
