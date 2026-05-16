import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { hashPassword, validateEmailFormat } from '../utils/auth-helpers.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../utils/audit-log.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/admin/users — list all users */
export async function listUsers(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const users = await db.all(
    `SELECT u.id, u.email, u.display_name, u.email_verified, u.account_locked,
            u.login_attempts, u.created_at, u.updated_at, u.deleted_at,
            r.name AS role_name, r.id AS role_id
     FROM users u
     LEFT JOIN roles r ON u.role_id = r.id
     ORDER BY u.created_at DESC`,
  );
  return res.json({ users });
}

/** PATCH /api/admin/users/:id/role — change user role */
export async function changeUserRole(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;
  const { role_id } = req.body as { role_id?: number };

  if (!role_id) return res.status(400).json({ error: 'role_id is required.' });

  const role = await db.get('SELECT id FROM roles WHERE id = $1', [role_id]);
  if (!role) return res.status(400).json({ error: 'Invalid role_id.' });

  // Prevent self-demotion
  if (req.user!.id === Number(id)) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  await db.run('UPDATE users SET role_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [role_id, id]);

  // Get target user info for audit
  const targetUser = await db.get<{ email: string }>('SELECT email FROM users WHERE id = $1', [id]);
  await logAuditEvent({
    db,
    userId: req.user!.id,
    email: req.user!.email,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    description: `Admin changed role for user ${id} to role_id=${role_id}`,
    ipAddress: req.ip,
    severity: 'WARN',
    targetType: 'user',
    targetId: String(id),
    context: { newRoleId: role_id, targetEmail: targetUser?.email },
  });

  return res.json({ message: 'Role updated.' });
}

/** PATCH /api/admin/users/:id/lock — lock / unlock account */
export async function toggleLock(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;
  const { locked } = req.body as { locked?: boolean };

  if (locked === undefined) return res.status(400).json({ error: 'locked (boolean) is required.' });

  if (req.user!.id === Number(id)) {
    return res.status(400).json({ error: 'You cannot lock your own account.' });
  }

  await db.run(
    `UPDATE users
     SET account_locked = $1, locked_until = $2, login_attempts = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [locked ? 1 : 0, locked ? null : null, id],
  );

  return res.json({ message: locked ? 'Account locked.' : 'Account unlocked.' });
}

/** DELETE /api/admin/users/:id — soft-delete a user */
export async function deleteUser(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  if (req.user!.id === Number(id)) {
    return res.status(400).json({ error: 'You cannot delete your own account via admin.' });
  }

  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = $1', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.deleted_at) return res.status(400).json({ error: 'User already deleted.' });

  await db.run(
    "UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id],
  );
  return res.json({ message: 'User deleted.' });
}

/** POST /api/admin/users/:id/restore — restore a soft-deleted user */
export async function restoreUser(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = $1', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!user.deleted_at) return res.status(400).json({ error: 'User is not deleted.' });

  await db.run(
    'UPDATE users SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id],
  );

  return res.json({ message: 'User restored.' });
}

/** GET /api/admin/roles — list all roles */
export async function listRoles(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const roles = await db.all('SELECT * FROM roles ORDER BY id ASC');
  return res.json({ roles });
}

/** POST /api/admin/users — create a new user */
export async function createUser(req: AuthRequest, res: Response): Promise<Response> {
  const { email, password, display_name, role_id, email_verified } = req.body as {
    email?: string;
    password?: string;
    display_name?: string;
    role_id?: number;
    email_verified?: boolean;
  };

  if (!email || !password || !display_name || !role_id) {
    return res.status(400).json({ error: 'email, password, display_name and role_id are required.' });
  }
  if (!validateEmailFormat(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: 'User with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, account_locked, login_attempts, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [normalizedEmail, passwordHash, display_name.trim(), email_verified ? 1 : 0, role_id],
  );

  return res.status(201).json({ message: 'User created.', userId: result.lastID });
}

/** PUT /api/admin/users/:id — update a user */
export async function updateUser(req: AuthRequest, res: Response): Promise<Response> {
  const { id } = req.params;
  const { email, password, display_name, role_id, email_verified, account_locked } = req.body as {
    email?: string;
    password?: string;
    display_name?: string;
    role_id?: number;
    email_verified?: boolean;
    account_locked?: boolean;
  };

  if (!email || !display_name || !role_id) {
    return res.status(400).json({ error: 'email, display_name and role_id are required.' });
  }
  if (!validateEmailFormat(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = $1', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.deleted_at) return res.status(400).json({ error: 'Cannot update a deleted user.' });

  const updateValues: unknown[] = [normalizedEmail, display_name.trim(), role_id, email_verified ? 1 : 0, account_locked ? 1 : 0];
  let query = `UPDATE users SET email = $1, display_name = $2, role_id = $3, email_verified = $4, account_locked = $5, updated_at = CURRENT_TIMESTAMP`;

  if (password) {
    const passwordHash = await hashPassword(password);
    query += ', password_hash = ?';
    updateValues.push(passwordHash);
  }

  query += ' WHERE id = $1';
  updateValues.push(id);

  await db.run(query, updateValues);
  return res.json({ message: 'User updated.' });
}

/** GET /api/admin/audit-log — search audit log by user email, action type, date range */
export async function searchAuditLog(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { email, action, from, to, page = '1', limit = '50' } = req.query as Record<string, string>;

  const params: (string | number)[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (email) {
    conditions.push(`LOWER(al.actor_email) = $${idx++}`);
    params.push(email.trim().toLowerCase());
  }
  if (action) {
    conditions.push(`al.action = $${idx++}`);
    params.push(action);
  }
  if (from) {
    conditions.push(`al.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`al.created_at <= $${idx++}`);
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  const rows = await db.all(
    `SELECT al.id, al.actor_id, al.actor_email, al.action, al.description,
            al.ip_address, al.severity, al.target_type, al.target_id,
            al.context, al.created_at
     FROM audit_log al
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limitNum, offset],
  );

  const countRow = await db.get<{ total: number }>(
    `SELECT COUNT(*) AS total FROM audit_log al ${where}`,
    params,
  );

  return res.json({ logs: rows, total: countRow?.total ?? 0, page: pageNum, limit: limitNum });
}

/** GET /api/admin/audit-log/export — export audit log as CSV or JSON */
export async function exportAuditLog(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { email, action, from, to, format = 'csv' } = req.query as Record<string, string>;

  const params: (string | number)[] = [];
  const conditions: string[] = [];
  let idx = 1;

  if (email) {
    conditions.push(`LOWER(al.actor_email) = $${idx++}`);
    params.push(email.trim().toLowerCase());
  }
  if (action) {
    conditions.push(`al.action = $${idx++}`);
    params.push(action);
  }
  if (from) {
    conditions.push(`al.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`al.created_at <= $${idx++}`);
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await db.all(
    `SELECT al.id, al.actor_id, al.actor_email, al.action, al.description,
            al.ip_address, al.severity, al.target_type, al.target_id,
            al.created_at
     FROM audit_log al
     ${where}
     ORDER BY al.created_at DESC`,
    params,
  );

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.json"');
    return res.json(rows);
  }

  // Default: CSV (streamed)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');

  const headers = ['id', 'actor_id', 'actor_email', 'action', 'description', 'ip_address', 'severity', 'target_type', 'target_id', 'created_at'];
  res.write(headers.join(',') + '\n');

  for (const row of rows as Record<string, unknown>[]) {
    const line = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') $1 `"${s}"` : s;
    }).join(',');
    res.write(line + '\n');
  }

  res.end();
  return res as unknown as Response;
}

/** POST /api/admin/users/:id/deactivate — deactivate a user (sets deactivated_at) */
export async function deactivateUser(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  if (req.user!.id === Number(id)) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  const user = await db.get('SELECT id, deactivated_at FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  await db.run(
    'UPDATE users SET deactivated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id],
  );

  // Revoke all sessions for this user
  await db.run('DELETE FROM sessions WHERE user_id = $1', [id]);

  await logAuditEvent({
    db, userId: req.user!.id, email: req.user!.email,
    action: AUDIT_ACTIONS.USER_DEACTIVATED ?? 'USER_DEACTIVATED',
    description: `Admin deactivated user ${id}`,
    ipAddress: req.ip,
    severity: 'WARN',
    targetType: 'user',
    targetId: String(id),
  });

  return res.json({ message: 'User deactivated. All sessions revoked.' });
}

/** POST /api/admin/users/:id/force-logout — revoke all sessions for a user */
export async function forceLogoutUser(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const result = await db.run('DELETE FROM sessions WHERE user_id = $1', [id]);

  await logAuditEvent({
    db, userId: req.user!.id, email: req.user!.email,
    action: 'FORCE_LOGOUT',
    description: `Admin force-logged out user ${id}`,
    ipAddress: req.ip,
    severity: 'WARN',
    targetType: 'user',
    targetId: String(id),
  });

  return res.json({ message: 'All sessions revoked.', sessionsRevoked: result.changes ?? 0 });
}

/** GET /api/admin/stats — system statistics dashboard (#677) */
export async function getSystemStats(_req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();

  const [users, events, sessions, recentErrors] = await Promise.all([
    db.get<{ active: number; deactivated: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE deleted_at IS NULL AND deactivated_at IS NULL) AS active,
         COUNT(*) FILTER (WHERE deactivated_at IS NOT NULL) AS deactivated
       FROM users`,
    ),
    db.get<{ total: number; upcoming: number }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE date > CURRENT_TIMESTAMP AND deleted_at IS NULL) AS upcoming
       FROM events`,
    ),
    db.get<{ active: number }>(
      `SELECT COUNT(*) AS active FROM sessions WHERE expires_at > CURRENT_TIMESTAMP`,
    ),
    db.get<{ errors_last_hour: number }>(
      `SELECT COUNT(*) AS errors_last_hour FROM audit_log
       WHERE severity = 'ERROR' AND created_at > NOW() - INTERVAL '1 hour'`,
    ),
  ]);

  return res.json({
    users: users ?? { active: 0, deactivated: 0 },
    events: events ?? { total: 0, upcoming: 0 },
    sessions: sessions ?? { active: 0 },
    recentErrors: recentErrors ?? { errors_last_hour: 0 },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
