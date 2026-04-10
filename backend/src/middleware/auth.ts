import jwt from 'jsonwebtoken';
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

export function generateTokens(userId: number, email: string, roleId: number) {
  const accessToken = jwt.sign(
    { id: userId, email, role_id: roleId },
    JWT_SECRET,
    { expiresIn: '1h' } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { id: userId, email, role_id: roleId, type: 'refresh' },
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

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

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
