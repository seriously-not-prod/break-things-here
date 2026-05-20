/**
 * GDPR compliance controller — personal data export and right to erasure (#680).
 *
 * GET  /api/profile/data-export       — authenticated user downloads all their data
 * DELETE /api/profile/erase           — authenticated user requests full erasure
 * POST /api/admin/users/:id/erase     — admin forces erasure (requires Admin role)
 */
import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { logAuditEvent } from '../utils/audit-log.js';
import fs from 'fs/promises';
import path from 'path';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

const ROLE_ADMIN_ID = 1;

/**
 * GET /api/profile/data-export
 * Returns a JSON payload with all personal data for the authenticated user.
 */
export async function exportPersonalData(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  const db = getDatabase();
  const userId = req.user.id;

  const [profile, rsvps, memberships, uploads, commsHistory] = await Promise.all([
    db.get(
      `SELECT u.id, u.email, u.display_name, u.created_at,
              p.bio, p.phone_number, p.city, p.state, p.country
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    ),
    db.all(
      `SELECT r.id, r.status, r.waitlist_position, r.checked_in, r.created_at,
              e.title AS event_title, e.date AS event_date
       FROM rsvps r
       JOIN events e ON e.id = r.event_id
       WHERE r.user_id = $1`,
      [userId],
    ),
    db.all(
      `SELECT em.event_id, em.role, em.created_at, e.title AS event_title
       FROM event_members em
       JOIN events e ON e.id = em.event_id
       WHERE em.user_id = $1`,
      [userId],
    ),
    db.all(
      `SELECT id, file_name, original_name, file_size, created_at
       FROM event_documents
       WHERE uploaded_by = $1`,
      [userId],
    ),
    db.all(
      `SELECT id, event_id, channel, subject, status, sent_at
       FROM communication_log
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT 1000`,
      [userId],
    ),
  ]);

  await logAuditEvent({
    db,
    userId,
    email: req.user.email,
    action: 'GDPR_DATA_EXPORT',
    description: 'User exported personal data',
    ipAddress: req.ip,
    severity: 'INFO',
  });

  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  return res.json({
    exportedAt: new Date().toISOString(),
    profile,
    rsvps,
    eventMemberships: memberships,
    uploadedFiles: uploads,
    communicationHistory: commsHistory,
  });
}

/**
 * DELETE /api/profile/erase
 * Anonymises all PII fields, deletes physical files, revokes sessions.
 */
export async function erasePersonalData(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });

  const db = getDatabase();
  const userId = req.user.id;

  // Get uploaded files to delete from disk
  const uploads = await db.all<{ file_name: string }>(
    `SELECT file_name FROM event_documents WHERE uploaded_by = $1`,
    [userId],
  );

  // Anonymise all PII in users table
  await db.run(
    `UPDATE users
     SET deleted_at     = CURRENT_TIMESTAMP,
         email          = 'erased-' || id || '@erased.invalid',
         display_name   = 'Erased User',
         password_hash  = '',
         email_verification_token = NULL,
         pending_email  = NULL,
         pending_email_token = NULL,
         deactivated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId],
  );

  // Anonymise user_profiles
  await db.run(
    `UPDATE user_profiles
     SET bio = NULL, phone_number = NULL, profile_photo_url = NULL,
         address = NULL, city = NULL, state = NULL, zip_code = NULL, country = NULL
     WHERE user_id = $1`,
    [userId],
  );

  // Revoke all sessions
  await db.run('DELETE FROM sessions WHERE user_id = $1', [userId]);

  // Delete physical files from disk (best-effort)
  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'uploads');
  for (const upload of uploads) {
    try {
      await fs.unlink(path.join(uploadDir, upload.file_name));
    } catch {
      /* file may already be gone */
    }
  }

  await logAuditEvent({
    db,
    userId,
    email: req.user.email,
    action: 'GDPR_ERASURE',
    description: 'User exercised right to erasure — all PII anonymised',
    ipAddress: req.ip,
    severity: 'CRITICAL',
    targetType: 'user',
    targetId: String(userId),
  });

  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');
  return res.status(204).send();
}

/**
 * POST /api/admin/users/:id/erase
 * Admin-initiated erasure of another user's personal data.
 * Requires Admin role. Writes audit_log with severity critical.
 */
export async function adminErasePersonalData(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  if (req.user.role_id !== ROLE_ADMIN_ID)
    return res.status(403).json({ error: 'Admin role required.' });

  const db = getDatabase();
  const targetId = parseInt(req.params.id, 10);

  if (req.user.id === targetId) {
    return res.status(400).json({ error: 'Cannot erase own account via admin endpoint.' });
  }

  const target = await db.get<{ id: number; email: string }>(
    'SELECT id, email FROM users WHERE id = $1 AND deleted_at IS NULL',
    [targetId],
  );
  if (!target) return res.status(404).json({ error: 'User not found.' });

  await db.run(
    `UPDATE users
     SET deleted_at     = CURRENT_TIMESTAMP,
         email          = 'admin-erased-' || id || '@erased.invalid',
         display_name   = 'Erased User',
         password_hash  = '',
         email_verification_token = NULL,
         pending_email  = NULL
     WHERE id = $1`,
    [targetId],
  );

  await db.run(
    `UPDATE user_profiles
     SET bio = NULL, phone_number = NULL, profile_photo_url = NULL,
         address = NULL, city = NULL, state = NULL, zip_code = NULL, country = NULL
     WHERE user_id = $1`,
    [targetId],
  );

  await db.run('DELETE FROM sessions WHERE user_id = $1', [targetId]);

  await logAuditEvent({
    db,
    userId: req.user.id,
    email: req.user.email,
    action: 'GDPR_ADMIN_ERASURE',
    description: `Admin erased personal data for user ${targetId} (${target.email})`,
    ipAddress: req.ip,
    severity: 'CRITICAL',
    targetType: 'user',
    targetId: String(targetId),
    context: { targetEmail: target.email },
  });

  return res.json({ message: 'User personal data erased and sessions revoked.' });
}
