import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { validateEmailFormat, verifyPassword } from '../utils/auth-helpers';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * PATCH /api/users/me
 * Accepts: displayName (string), email (string) — both optional (partial update).
 * Returns 200 with updated user object on success.
 * Returns 400 for invalid input, 401 for unauthenticated.
 */
export async function updateMe(req: AuthRequest, res: Response): Promise<Response> {
  try {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { displayName, email } = req.body as { displayName?: unknown; email?: unknown };

  // Must supply at least one field
  if (displayName === undefined && email === undefined) {
    return res.status(400).json({ error: 'Provide at least one field to update: displayName or email' });
  }

  // Validate displayName
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      return res.status(400).json({ error: 'displayName must be at least 2 characters' });
    }
  }

  // Validate email
  if (email !== undefined) {
    if (typeof email !== 'string' || !validateEmailFormat(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
  }

  const db = getDatabase();

  // Build dynamic SET clause for partial updates
  const setClauses: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const values: unknown[] = [];

  if (displayName !== undefined) {
    setClauses.push('display_name = ?');
    values.push((displayName as string).trim());
  }

  // Email change is handled via re-confirmation flow — only update display_name here.
  // Email input routing: if email differs from current, delegate to email-change flow.
  if (email !== undefined) {
    const currentUser = await db.get<{ email: string }>(
      'SELECT email FROM users WHERE id = ?',
      [req.user.id],
    );
    if (currentUser && email !== currentUser.email) {
      return res.status(400).json({
        error: 'To change your email address use the email change endpoint: POST /api/profile/change-email',
      });
    }
  }

  values.push(req.user.id);
  await db.run(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    values,
  );

  const updated = await db.get(
    `SELECT id, email, display_name, email_verified, created_at, updated_at
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [req.user.id],
  );

  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json(updated);
  } catch (error) {
    console.error('updateMe error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

/**
 * GET /api/users/me
 * Returns current authenticated user's public profile.
 */
export async function getMe(req: AuthRequest, res: Response): Promise<Response> {
  try {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getDatabase();
  const user = await db.get(
    `SELECT u.id, u.email, u.display_name, u.email_verified, r.name AS role,
            up.bio, up.phone_number, up.profile_photo_url, up.city, up.country
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [req.user.id],
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Mask email: show only first 2 chars + domain
  const [local, domain] = (user.email as string).split('@');
  user.email_masked = `${local.slice(0, 2)}****@${domain}`;

  return res.status(200).json(user);
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
}

/**
 * DELETE /api/users/me
 * Requires password in body for confirmation.
 * Returns 204 on successful deletion.
 * Soft-deletes user and invalidates all sessions.
 */
export async function deleteMe(req: AuthRequest, res: Response): Promise<Response> {
  try {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { password } = req.body as { password?: unknown };

  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required to confirm account deletion' });
  }

  const db = getDatabase();
  const user = await db.get<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = ? AND deleted_at IS NULL',
    [req.user.id],
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Anonymise personal data and soft-delete
  await db.run(
    `UPDATE users
     SET deleted_at = CURRENT_TIMESTAMP,
         email = 'deleted-' || id::text || '@deleted.invalid',
         display_name = 'Deleted User',
         password_hash = '',
         email_verification_token = NULL
     WHERE id = ?`,
    [req.user.id],
  );

  // Wipe profile data
  await db.run(
    `UPDATE user_profiles
     SET bio = NULL, phone_number = NULL, profile_photo_url = NULL,
         address = NULL, city = NULL, state = NULL, zip_code = NULL, country = NULL
     WHERE user_id = ?`,
    [req.user.id],
  );

  // Invalidate all sessions
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);

  res.clearCookie('refreshToken');

  return res.status(204).send();
  } catch (error) {
    console.error('deleteMe error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
}
