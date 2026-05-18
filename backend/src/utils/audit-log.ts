import { DatabaseAdapter } from '../db/database.js';

export type AuditSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface AuditEventParams {
  db: DatabaseAdapter;
  userId?: number | null;
  email?: string | null;
  action: string;
  description?: string;
  ipAddress?: string;
  actorId?: number | null;
  targetType?: string;
  targetId?: string;
  context?: Record<string, unknown>;
  severity?: AuditSeverity;
}

/**
 * Persists a security/audit event to the audit_log table.
 * All security-sensitive operations MUST call this function.
 * Payload includes: actor, action, target, timestamp, IP, context.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    db,
    userId,
    email,
    action,
    description,
    ipAddress,
    actorId,
    targetType,
    targetId,
    context,
    severity = 'INFO',
  } = params;

  try {
    await db.run(
      `INSERT INTO audit_log
         (user_id, email, action, description, ip_address,
          actor_id, target_type, target_id, context, severity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)`,
      [
        userId ?? null,
        email ?? null,
        action,
        description ?? null,
        ipAddress ?? null,
        actorId ?? userId ?? null,
        targetType ?? null,
        targetId ?? null,
        context ? JSON.stringify(context) : null,
        severity,
      ],
    );
  } catch (err) {
    // Audit log failures MUST NOT break the primary operation.
    // Log to stderr for operational visibility.
    console.error('[AUDIT] Failed to persist audit event:', action, err);
  }
}

// ─── Well-known action constants ─────────────────────────────────────────────

export const AUDIT_ACTIONS = {
  // Auth events
  LOGIN_SUCCESS:         'LOGIN_SUCCESS',
  LOGIN_FAILURE:         'LOGIN_FAILURE',
  LOGIN_ACCOUNT_LOCKED:  'LOGIN_ACCOUNT_LOCKED',
  LOGOUT:                'LOGOUT',
  LOGOUT_ALL_SESSIONS:   'LOGOUT_ALL_SESSIONS',
  TOKEN_REFRESH_SUCCESS: 'TOKEN_REFRESH_SUCCESS',
  TOKEN_REFRESH_FAILURE: 'TOKEN_REFRESH_FAILURE',
  SESSION_EXPIRED:       'SESSION_EXPIRED',
  // RBAC events
  ROLE_CHANGE:           'ROLE_CHANGE',
  PERMISSION_DENIED:     'PERMISSION_DENIED',
  // Account events
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFIED:        'EMAIL_VERIFIED',
  // Upload events
  UPLOAD_SCAN_PASS:      'UPLOAD_SCAN_PASS',
  UPLOAD_SCAN_FAIL:      'UPLOAD_SCAN_FAIL',
  UPLOAD_REJECTED:       'UPLOAD_REJECTED',
  // Domain mutations (create/update/delete) — emitted by C2 wiring
  EVENT_CREATE:          'EVENT_CREATE',
  EVENT_UPDATE:          'EVENT_UPDATE',
  EVENT_DELETE:          'EVENT_DELETE',
  RSVP_CREATE:           'RSVP_CREATE',
  RSVP_UPDATE:           'RSVP_UPDATE',
  RSVP_DELETE:           'RSVP_DELETE',
  TASK_CREATE:           'TASK_CREATE',
  TASK_UPDATE:           'TASK_UPDATE',
  TASK_DELETE:           'TASK_DELETE',
  SHOPPING_ITEM_CREATE:  'SHOPPING_ITEM_CREATE',
  SHOPPING_ITEM_UPDATE:  'SHOPPING_ITEM_UPDATE',
  SHOPPING_ITEM_DELETE:  'SHOPPING_ITEM_DELETE',
  VENDOR_CREATE:         'VENDOR_CREATE',
  VENDOR_UPDATE:         'VENDOR_UPDATE',
  VENDOR_DELETE:         'VENDOR_DELETE',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ─── Convenience wrapper for domain-entity mutations ─────────────────────────

/**
 * Thin wrapper around logAuditEvent for create/update/delete on domain
 * entities (events, RSVPs, tasks, shopping items, vendors). Centralises the
 * targetType/targetId/actorId boilerplate so controllers only pass the action
 * and the entity id.
 *
 * The req parameter is intentionally typed as `{ ip?, user? }` rather than
 * `AuthRequest` so this helper works with both Express's base `Request`
 * (where `user` is attached at runtime by authenticateToken) and explicit
 * `AuthRequest` subtypes — no cast at the call site.
 */
export async function logMutation(
  db: DatabaseAdapter,
  req: { ip?: string; user?: { id: number; email: string } | null },
  action: string,
  targetType: string,
  targetId: string | number,
  context?: Record<string, unknown>,
): Promise<void> {
  await logAuditEvent({
    db,
    userId: req.user?.id ?? null,
    email: req.user?.email ?? null,
    action,
    actorId: req.user?.id ?? null,
    targetType,
    targetId: String(targetId),
    ipAddress: req.ip,
    context,
  });
}
