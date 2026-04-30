/**
 * Audit Log Helper
 *
 * Provides a single reusable function to insert a row into the `audit_log`
 * table. All state-changing operations (event CRUD, task CRUD, admin actions,
 * RSVP status changes) must call this helper so the security trail is complete.
 *
 * Addresses: #271 (Task), #256 (Story)
 */

import { Request } from 'express';
import { getDatabase } from '../db/database.js';

interface AuditActor {
  /** ID of the user performing the action (null for unauthenticated actions). */
  userId: number | null;
  /** Email of the acting user (null for unauthenticated actions). */
  email: string | null;
}

/**
 * Inserts one row into the audit_log table.
 *
 * @param actor      - The user performing the action
 * @param action     - Dot-namespaced action string (e.g. "task.created")
 * @param description - Human-readable description stored alongside the action
 * @param ipAddress  - Remote IP address of the request (optional)
 */
export async function writeAuditLog(
  actor: AuditActor,
  action: string,
  description: string,
  ipAddress: string | null,
): Promise<void> {
  try {
    const db = getDatabase();
    await db.run(
      'INSERT INTO audit_log (user_id, email, action, description, ip_address) VALUES (?, ?, ?, ?, ?)',
      [actor.userId, actor.email, action, description, ipAddress],
    );
  } catch (err) {
    // Audit failures must never crash the main request flow. Log and continue.
    console.error('[AuditLog] Failed to write audit entry:', err);
  }
}

/**
 * Convenience wrapper that extracts actor and IP from an Express Request and
 * delegates to writeAuditLog.
 *
 * @param req         - Express request (user injected by authenticateToken)
 * @param action      - Dot-namespaced action string
 * @param description - Human-readable description
 */
export async function auditFromRequest(
  req: Request & { user?: { id: number; email: string } },
  action: string,
  description: string,
): Promise<void> {
  await writeAuditLog(
    {
      userId: req.user?.id ?? null,
      email: req.user?.email ?? null,
    },
    action,
    description,
    req.ip ?? null,
  );
}
