import { requireRole } from '../../middleware/rbac';
import { UserRole } from '../../types/user-role';
import { ApiRequest, ApiResponse } from '../../types/api';
import { findUserById, updateUserRole, isValidRole } from '../../data/user-store';

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
      return res.status(400).json({
        error: 'Invalid role. Must be one of: Admin, Organizer, Attendee',
      });
    }

    // Prevent admin from demoting their own account
    if (req.user!.id === targetUserId && role !== UserRole.Admin) {
      return res.status(403).json({
        error: 'Cannot change your own role',
      });
    }

    const targetUser = findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = updateUserRole(targetUserId, role);
    return res.status(200).json(updatedUser);
  },
);
