/**
 * AI RBAC Middleware — Issue #963
 *
 * Enforces role-based access control for all AI capability endpoints.
 * Users must hold the `ai.access` permission (granted to Admin and Organizer
 * roles) to reach any /api/ai/* route.
 *
 * Responsibilities:
 * - Verify the authenticated user has the `ai.access` permission
 * - Log every access decision (granted or denied) to the audit log for
 *   observability and compliance
 * - Return a safe, structured 403 response for unauthorized access with no
 *   information leakage about the underlying AI provider or configuration
 */
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../utils/audit-log.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** The permission name that gates all AI capability endpoints. */
export const AI_PERMISSION = 'ai.access';

/**
 * Express middleware that enforces `ai.access` permission.
 *
 * Must be placed AFTER `authenticateToken` in the middleware chain so that
 * `req.user` is guaranteed to be populated before this check runs.
 *
 * On denial it logs an `AI_ACCESS_DENIED` audit event and returns:
 *   `403 { error: 'AI features require elevated permissions.' }`
 *
 * On success it logs an `AI_ACCESS_GRANTED` audit event and calls `next()`.
 */
export async function requireAiAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const db = getDatabase();

  const hasPermission = await db.get<{ exists: number }>(
    `SELECT 1 AS exists
     FROM role_permissions rp
     JOIN permissions p ON rp.permission_id = p.id
     WHERE rp.role_id = $1 AND p.name = $2`,
    [req.user.role_id, AI_PERMISSION],
  );

  if (!hasPermission) {
    await logAuditEvent({
      db,
      userId: req.user.id,
      email: req.user.email,
      action: AUDIT_ACTIONS.AI_ACCESS_DENIED,
      description: `AI access denied — user lacks '${AI_PERMISSION}' permission`,
      ipAddress: req.ip,
      severity: 'WARN',
      context: {
        path: req.path,
        method: req.method,
        roleId: req.user.role_id,
        requiredPermission: AI_PERMISSION,
      },
    });
    res.status(403).json({ error: 'AI features require elevated permissions.' });
    return;
  }

  await logAuditEvent({
    db,
    userId: req.user.id,
    email: req.user.email,
    action: AUDIT_ACTIONS.AI_ACCESS_GRANTED,
    description: `AI access granted — '${AI_PERMISSION}' permission verified`,
    ipAddress: req.ip,
    severity: 'INFO',
    context: {
      path: req.path,
      method: req.method,
      roleId: req.user.role_id,
    },
  });

  next();
}
