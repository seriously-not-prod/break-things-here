import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/** GET /api/admin/users — list all users */
export async function listUsers(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const users = await db.all(
    `SELECT u.id, u.email, u.display_name, u.email_verified, u.account_locked,
            u.login_attempts, u.created_at, u.deleted_at,
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
