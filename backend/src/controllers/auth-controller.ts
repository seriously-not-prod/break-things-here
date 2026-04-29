import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabase } from '../db/database.js';
import { verifyPassword, validateEmailFormat, hashPassword, generateVerificationToken, hashToken, encryptToken, decryptToken } from '../utils/auth-helpers.js';
import { generateTokens, verifyToken, SESSION_TIMEOUT_MS } from '../middleware/auth.js';

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

  // Create a server-side session identifier (random opaque id). This session id is
  // embedded in the access token `jti` claim and a hash of it is stored in the DB.
  const sessionId = crypto.randomBytes(16).toString('hex');
  const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role_id, sessionId);

  const tokenHash = hashToken(sessionId);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    `INSERT INTO sessions (user_id, token, refresh_token, expires_at, last_activity)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, tokenHash, refreshTokenHash, expiresAt, new Date().toISOString()],
  );

  // Set httpOnly secure cookie for the encrypted refresh token; do not expose raw refresh tokens in API responses
  const encrypted = encryptToken(refreshToken);
  res.cookie('refreshToken', encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Also set encrypted httpOnly cookie for access token (do not return raw tokens in JSON)
  const encryptedAccess = encryptToken(accessToken);
  res.cookie('accessToken', encryptedAccess, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000, // access token lifespan (1h)
  });

  // For development convenience, return raw tokens in the JSON response so
  // browser clients or automated tests can use Authorization headers if cookie
  // handling fails in certain environments. Do NOT enable this in production.
  const resp: any = {
    message: 'Login successful.',
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      roleId: user.role_id,
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    resp.accessToken = accessToken;
    resp.refreshToken = refreshToken;
  }

  return res.status(200).json(resp);
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
  // Prefer revoking session by the refresh token cookie (server-side session).
  let refreshToken = req.cookies?.refreshToken;
  const authHeader = req.headers?.['authorization'];
  const authToken = authHeader && typeof authHeader === 'string' ? authHeader.split(' ')[1] : undefined;
  if (refreshToken && typeof refreshToken === 'string' && !refreshToken.includes('.')) {
    try {
      refreshToken = decryptToken(refreshToken);
    } catch (err) {
      refreshToken = undefined as unknown as string;
    }
  }

  if (refreshToken) {
    await db.run('DELETE FROM sessions WHERE refresh_token = ? AND user_id = ?', [hashToken(refreshToken), req.user.id]);
  }

  // If no refresh cookie present, fall back to Authorization header token (tests use this flow).
  if (!refreshToken && authToken) {
    await db.run('DELETE FROM sessions WHERE token = ? AND user_id = ?', [hashToken(authToken), req.user.id]);
  }

  // Clear authentication cookies
  res.clearCookie('refreshToken');
  res.clearCookie('accessToken');

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

/**
 * POST /api/auth/refresh
 * Rotates the refresh token and issues a new access token.
 */
export async function refreshTokenEndpoint(req: Request, res: Response): Promise<Response> {
  let refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

  // If cookie contains an encrypted token, decrypt it first
  if (refreshToken && typeof refreshToken === 'string' && !refreshToken.includes('.')) {
    try {
      refreshToken = decryptToken(refreshToken);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid refresh token.' });
    }
  }

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token is required.' });
  }

  const payload = verifyToken(refreshToken);
  if (!payload) {
    return res.status(403).json({ error: 'Invalid or expired refresh token.' });
  }

  const db = getDatabase();

  // Verify refresh token is in the sessions table
  // Stored refresh tokens are hashed — compare hashes
  const session = await db.get<{ id: number; user_id: number }>(
    'SELECT id, user_id FROM sessions WHERE refresh_token = ?',
    [hashToken(refreshToken)],
  );

  if (!session) {
    return res.status(403).json({ error: 'Refresh token has been revoked.' });
  }

  // Verify user still exists
  const user = await db.get<{ id: number; email: string; role_id: number }>(
    'SELECT id, email, role_id FROM users WHERE id = ? AND deleted_at IS NULL',
    [session.user_id],
  );

  if (!user) {
    // Clean up orphaned session
    await db.run('DELETE FROM sessions WHERE id = ?', [session.id]);
    return res.status(403).json({ error: 'User account no longer exists.' });
  }

  // Rotate tokens
  // Rotate session id and refresh token. Generate a new session id so we never
  // store data derived from jwt.sign; the DB stores the opaque session id hash
  // and the refresh token hash.
  const newSessionId = crypto.randomBytes(16).toString('hex');
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens(
    user.id,
    user.email,
    user.role_id,
    newSessionId,
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.run(
    'UPDATE sessions SET token = ?, refresh_token = ?, expires_at = ?, last_activity = ? WHERE id = ?',
    [hashToken(newSessionId), hashToken(newRefreshToken), expiresAt, new Date().toISOString(), session.id],
  );

  // Set httpOnly cookie for the new refresh token (encrypt before sending)
  const newEncrypted = encryptToken(newRefreshToken);
  res.cookie('refreshToken', newEncrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Set encrypted httpOnly cookie for the new access token and do not return raw token
  const newEncryptedAccess = encryptToken(newAccessToken);
  res.cookie('accessToken', newEncryptedAccess, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000,
  });

  return res.status(200).json({
    message: 'Token refreshed successfully.',
  });
}

/**
 * POST /api/auth/session/heartbeat
 * Updates session last_activity and returns session timeout configuration.
 */
export async function sessionHeartbeat(req: AuthRequest, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const db = getDatabase();
  // Update last_activity by refresh token stored in cookie (sessions keep refresh token hashes)
  let refreshToken = req.cookies?.refreshToken;
  if (refreshToken && typeof refreshToken === 'string' && !refreshToken.includes('.')) {
    try {
      refreshToken = decryptToken(refreshToken);
    } catch (err) {
      refreshToken = undefined as unknown as string;
    }
  }

  if (refreshToken) {
    await db.run(
      'UPDATE sessions SET last_activity = ? WHERE refresh_token = ? AND user_id = ?',
      [new Date().toISOString(), hashToken(refreshToken), req.user.id],
    );
  }

  return res.status(200).json({
    message: 'Session activity updated.',
    sessionTimeoutMs: SESSION_TIMEOUT_MS,
  });
}
