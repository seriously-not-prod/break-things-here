import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../db/database.js';

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

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const COOKIE_OPTIONS = {
  accessToken: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict' as const,
    maxAge: 60 * 60 * 1000,        // 1 hour — matches access token expiry
    path: '/',
  },
  refreshToken: {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches refresh token expiry
    path: '/',
  },
};

export function generateTokens(userId: number, email: string, roleId: number) {
  const accessToken = jwt.sign(
    { id: userId, email, role_id: roleId },
    JWT_SECRET,
    { expiresIn: '1h' } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { id: userId, email, role_id: roleId, type: 'refresh', jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
  );

  return { accessToken, refreshToken };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = req.cookies?.accessToken;
  const token = headerToken || cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  // Verify the session still exists in the database (rejected after logout)
  const db = getDatabase();
  const session = await db.get<{ id: number; last_activity: string | null }>(
    'SELECT id, last_activity FROM sessions WHERE token = ? AND user_id = ?',
    [token, payload.id],
  );

  if (!session) {
    res.status(401).json({ error: 'Session has been invalidated' });
    return;
  }

  // Check inactivity timeout
  if (session.last_activity) {
    const lastActivity = new Date(session.last_activity).getTime();
    if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      await db.run('DELETE FROM sessions WHERE id = ?', [session.id]);
      res.status(401).json({ code: 'SESSION_TIMEOUT', error: 'Session expired due to inactivity' });
      return;
    }
  }

  // Update last_activity timestamp
  await db.run(
    'UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?',
    [session.id],
  );

  req.user = {
    id: payload.id,
    email: payload.email,
    role_id: payload.role_id,
  };

  next();
}

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

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
