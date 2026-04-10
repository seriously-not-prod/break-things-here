import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { verifyPassword, validateEmailFormat, hashPassword, generateVerificationToken } from '../utils/auth-helpers.js';
import { generateTokens } from '../middleware/auth.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  email_verified: number;
  role_id: number;
  account_locked: number;
  locked_until: string | null;
  login_attempts: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/login
 *
 * Validates credentials against bcrypt hash, issues JWT access + refresh tokens.
 * Returns 401 with generic message for invalid credentials (no user enumeration).
 * Returns 403 for unconfirmed (email not verified) accounts.
 * Returns 429 for locked accounts.
 */
export async function login(req: Request, res: Response): Promise<Response> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  if (!validateEmailFormat(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  const user = await db.get<UserRow>(
    `SELECT id, email, password_hash, display_name, email_verified,
            role_id, account_locked, locked_until, login_attempts
     FROM users WHERE LOWER(email) = ? AND deleted_at IS NULL`,
    [normalizedEmail],
  );

  // Return same generic error whether user exists or not (prevents enumeration)
  if (!user) {
    // Perform a dummy bcrypt compare to keep response time consistent
    await verifyPassword(password, '$2b$12$invalidhashplaceholdervalue.paddingtomakevalidlength');
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Check if account is locked
  if (user.account_locked && user.locked_until) {
    const lockExpiry = new Date(user.locked_until).getTime();
    const now = Date.now();
    if (lockExpiry > now) {
      return res.status(429).json({
        error: 'Account is temporarily locked due to too many failed login attempts.',
        retryAfter: Math.ceil((lockExpiry - now) / 1000),
      });
    }

    // Lock has expired — reset
    await db.run(
      `UPDATE users SET account_locked = 0, locked_until = NULL, login_attempts = 0,
                        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [user.id],
    );
    user.account_locked = 0;
    user.login_attempts = 0;
  }

  // Check if email is verified
  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Email address has not been verified. Please check your inbox for a confirmation link.',
    });
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.password_hash);
  if (!passwordValid) {
    const newAttempts = user.login_attempts + 1;

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
      await db.run(
        `UPDATE users SET login_attempts = ?, account_locked = 1, locked_until = ?,
                          updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newAttempts, lockedUntil, user.id],
      );
    } else {
      await db.run(
        `UPDATE users SET login_attempts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newAttempts, user.id],
      );
    }

    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  // Successful login — reset attempts and issue tokens
  await db.run(
    `UPDATE users SET login_attempts = 0, account_locked = 0, locked_until = NULL,
                      updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [user.id],
  );

  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role_id);

  // Store refresh token in the sessions table
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, accessToken, refreshToken, expiresAt],
  );

  return res.status(200).json({
    message: 'Login successful.',
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      roleId: user.role_id,
    },
  });
}

/**
 * POST /api/auth/register
 * Stub — to be implemented in a separate task.
 */
export async function register(req: Request, res: Response): Promise<Response> {
  const { email, password, displayName } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password, and displayName are required.' });
  }

  if (!validateEmailFormat(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  const exists = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
  if (exists) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = generateVerificationToken();

  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verification_token)
     VALUES (?, ?, ?, ?)`,
    [normalizedEmail, passwordHash, displayName.trim(), verificationToken],
  );

  return res.status(201).json({
    message: 'Registration successful. Please check your email to verify your account.',
    userId: result.lastID,
  });
}

/**
 * POST /api/auth/verify-email
 * Stub — confirms email verification token.
 */
export async function verifyEmail(req: Request, res: Response): Promise<Response> {
  const { token } = req.body as { token?: string };

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required.' });
  }

  const db = getDatabase();
  const user = await db.get(
    'SELECT id FROM users WHERE email_verification_token = ? AND deleted_at IS NULL',
    [token],
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification token.' });
  }

  await db.run(
    `UPDATE users SET email_verified = 1, email_verified_at = CURRENT_TIMESTAMP,
                      email_verification_token = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [user.id],
  );

  return res.status(200).json({ message: 'Email verified successfully.' });
}

/**
 * POST /api/auth/logout
 * Invalidates the current session/tokens.
 */
export async function logout(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const db = getDatabase();
  const authHeader = req.headers?.['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    await db.run('DELETE FROM sessions WHERE token = ? AND user_id = ?', [token, req.user.id]);
  }

  return res.status(200).json({ message: 'Logged out successfully.' });
}

/**
 * GET /api/auth/me
 * Returns current authenticated user info.
 */
export async function getCurrentUser(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const db = getDatabase();
  const user = await db.get(
    `SELECT id, email, display_name, email_verified, role_id, created_at, updated_at
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [req.user.id],
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  return res.status(200).json(user);
}
