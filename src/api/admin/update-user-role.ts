import { requireRole } from '../../middleware/rbac';
import { UserRole } from '../../types/user-role';
import { ApiRequest, ApiResponse } from '../../types/api';
import { findUserById, updateUserRole, isValidRole } from '../../data/user-store';
import { HTTP_STATUS, AUTH_ERRORS } from '../../utils/http-errors';

/**
 * PATCH /api/admin/users/:id/role
 *
 * Admin-only endpoint to assign or change a user's role.
 *
 * Request body: { role: "Admin" | "Organizer" | "Attendee" }
 * Responses:
 *   200 — Updated user
 *   400 — Invalid role value
 *   403 — Caller is not Admin (or trying to demote self)
 *   404 — Target user not found
 */
export const handleUpdateUserRole = requireRole(
  UserRole.Admin,
  (req: ApiRequest, res: ApiResponse) => {
    const targetUserId = req.params.id;
    const { role } = req.body as { role?: unknown };

    if (!isValidRole(role)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json(AUTH_ERRORS.INVALID_ROLE);
    }

    // Prevent admin from demoting their own account
    if (req.user!.id === targetUserId && role !== UserRole.Admin) {
      return res.status(HTTP_STATUS.FORBIDDEN).json(AUTH_ERRORS.SELF_ROLE_CHANGE);
    }

    const targetUser = findUserById(targetUserId);
    if (!targetUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json(AUTH_ERRORS.USER_NOT_FOUND);
    }

    const updatedUser = updateUserRole(targetUserId, role);
    return res.status(HTTP_STATUS.OK).json(updatedUser);
  },
);
