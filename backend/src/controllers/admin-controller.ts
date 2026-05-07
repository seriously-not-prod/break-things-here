import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { hashPassword, validateEmailFormat } from '../utils/auth-helpers.js';

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

  const role = await db.get('SELECT id FROM roles WHERE id = ?', [role_id]);
  if (!role) return res.status(400).json({ error: 'Invalid role_id.' });

  // Prevent self-demotion
  if (req.user!.id === Number(id)) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  await db.run('UPDATE users SET role_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role_id, id]);
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
     SET account_locked = ?, locked_until = ?, login_attempts = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
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

  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.deleted_at) return res.status(400).json({ error: 'User already deleted.' });

  await db.run(
    "UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [id],
  );
  return res.json({ message: 'User deleted.' });
}

/** POST /api/admin/users/:id/restore — restore a soft-deleted user */
export async function restoreUser(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!user.deleted_at) return res.status(400).json({ error: 'User is not deleted.' });

  await db.run(
    'UPDATE users SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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
  const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: 'User with this email already exists.' });
  }

  const passwordHash = await hashPassword(password);
  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, account_locked, login_attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
  const user = await db.get('SELECT id, deleted_at FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.deleted_at) return res.status(400).json({ error: 'Cannot update a deleted user.' });

  const updateValues: unknown[] = [normalizedEmail, display_name.trim(), role_id, email_verified ? 1 : 0, account_locked ? 1 : 0];
  let query = `UPDATE users SET email = ?, display_name = ?, role_id = ?, email_verified = ?, account_locked = ?, updated_at = CURRENT_TIMESTAMP`;

  if (password) {
    const passwordHash = await hashPassword(password);
    query += ', password_hash = ?';
    updateValues.push(passwordHash);
  }

  query += ' WHERE id = ?';
  updateValues.push(id);

  await db.run(query, updateValues);
  return res.json({ message: 'User updated.' });
}
