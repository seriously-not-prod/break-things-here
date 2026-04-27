import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';
import { hashToken } from '../utils/auth-helpers.js';

interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role_id: number;
  };
}

interface TokenPayload {
  id: number;
  email: string;
  role_id: number;
  iat: number;
  exp: number;
}

// Resolve JWT_SECRET at module load time.
// In production this throws if unset; in dev/test an ephemeral random value is used
// so no literal credential is embedded in source (satisfies CodeQL js/hardcoded-credentials).
function _resolveJwtSecret(): string {
  const value = process.env.JWT_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  const ephemeral = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[SECURITY] JWT_SECRET is not set. Using an ephemeral per-startup secret — ' +
    'sessions will not survive restarts. Set JWT_SECRET for persistent sessions.',
  );
  return ephemeral;
}
const JWT_SECRET = _resolveJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || String(30 * 60 * 1000), 10);

export function generateTokens(userId: number, email: string, roleId: number, jti?: string) {
  const accessJti = jti || crypto.randomBytes(16).toString('hex');
  const accessToken = jwt.sign(
    { id: userId, email, role_id: roleId, jti: accessJti },
    JWT_SECRET,
    { expiresIn: '1h' } as jwt.SignOptions,
  );

  // Use an opaque random refresh token rather than a signed JWT to avoid
  // persisting jwt.sign outputs in server storage. Refresh tokens are
  // stored hashed in the DB and rotated.
  const refreshToken = crypto.randomBytes(32).toString('hex');

  return { accessToken, refreshToken, accessJti };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

import { decryptToken } from '../utils/auth-helpers.js';

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // Try to get token from Authorization header first
  let token: string | undefined;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }
  
  // If no Authorization header, try to get from cookie
  if (!token && req.cookies?.accessToken) {
    try {
      token = decryptToken(req.cookies.accessToken);
    } catch (error) {
      console.error('Failed to decrypt access token from cookie:', error);
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }
  const db = getDatabase();

  // Use the access token `jti` (which is a random server-generated session id)
  // to validate the session and enforce inactivity timeout.
  // Sessions are stored keyed by hashToken(sessionId) — use the same KDF for lookup.
  const sessionJti = (payload as any).jti as string | undefined;
  const tokenHash = sessionJti ? hashToken(sessionJti) : hashToken(token);

  const session = await db.get<{ id: number; last_activity: string; user_id: number }>(
    'SELECT id, last_activity, user_id FROM sessions WHERE token = ?',
    [tokenHash],
  );

  if (!session) {
    res.status(401).json({ error: 'Session not found' });
    return;
  }

  if (session.last_activity) {
    const lastActivity = new Date(session.last_activity).getTime();
    if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      await db.run('DELETE FROM sessions WHERE id = ?', [session.id]);
      res.status(401).json({ error: 'Session expired due to inactivity', code: 'SESSION_TIMEOUT' });
      return;
    }
  }

  // Update last_activity
  await db.run('UPDATE sessions SET last_activity = ? WHERE id = ?', [new Date().toISOString(), session.id]);

  req.user = {
    id: payload.id,
    email: payload.email,
    role_id: payload.role_id,
  };

  next();
}

export function authorizeRole(
  allowedRoles: string[],
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const db = getDatabase();
    const role = await db.get<{ name: string }>(
      'SELECT name FROM roles WHERE id = ?',
      [req.user.role_id],
    );

    if (!role || !allowedRoles.includes(role.name)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export function authorizePermission(
  requiredPermission: string,
): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const db = getDatabase();
    const hasPermission = await db.get(
      `
      SELECT 1 FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ? AND p.name = ?
      `,
      [req.user.role_id, requiredPermission],
    );

    if (!hasPermission) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    next();
  };
}
