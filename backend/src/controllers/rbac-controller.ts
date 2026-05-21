import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../utils/audit-log.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

/**
 * GET /api/roles
 * Returns all available roles.
 */
export async function getAllRoles(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const roles = await db.all('SELECT id, name, description FROM roles');
  return res.status(200).json(roles);
}

/**
 * GET /api/roles/:roleId
 * Returns a single role with its permissions.
 */
export async function getRoleWithPermissions(req: AuthRequest, res: Response): Promise<Response> {
  const { roleId } = req.params;
  const db = getDatabase();

  const role = await db.get('SELECT id, name, description FROM roles WHERE id = $1', [roleId]);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }

  const permissions = await db.all(
    `SELECT p.id, p.name, p.description FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1`,
    [roleId],
  );

  return res.status(200).json({ ...role, permissions });
}

/**
 * POST /api/roles
 * Creates a new role (Admin only).
 */
export async function createRole(req: AuthRequest, res: Response): Promise<Response> {
  const { name, description } = req.body as { name?: string; description?: string };

  if (!name) {
    return res.status(400).json({ error: 'Role name is required' });
  }

  const db = getDatabase();
  const existing = await db.get('SELECT id FROM roles WHERE name = $1', [name]);
  if (existing) {
    return res.status(409).json({ error: 'Role already exists' });
  }

  const result = await db.run(
    'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id',
    [name, description || ''],
  );

  await logAuditEvent({
    db,
    userId: req.user?.id,
    email: req.user?.email,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    description: `Role created: ${name}`,
    ipAddress: req.ip,
    targetType: 'role',
    targetId: String(result.lastID),
    context: { roleName: name },
    severity: 'INFO',
  });

  return res.status(201).json({ id: result.lastID, name, description });
}

/**
 * POST /api/roles/assign-role
 * Assigns a role to a user.
 */
export async function assignRoleToUser(req: AuthRequest, res: Response): Promise<Response> {
  const { userId, roleId } = req.body as { userId?: number; roleId?: number };

  if (!userId || !roleId) {
    return res.status(400).json({ error: 'userId and roleId are required' });
  }

  const db = getDatabase();

  const role = await db.get('SELECT id FROM roles WHERE id = $1', [roleId]);
  if (!role) {
    return res.status(404).json({ error: 'Role not found' });
  }

  const user = await db.get('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const previous = await db.get<{ role_id: number }>('SELECT role_id FROM users WHERE id = $1', [
    userId,
  ]);
  await db.run('UPDATE users SET role_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
    roleId,
    userId,
  ]);

  await logAuditEvent({
    db,
    userId: req.user?.id,
    email: req.user?.email,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    description: `Assigned role ${roleId} to user ${userId}`,
    ipAddress: req.ip,
    targetType: 'user',
    targetId: String(userId),
    context: { previousRoleId: previous?.role_id ?? null, newRoleId: roleId },
    severity: 'INFO',
  });

  return res.status(200).json({ message: 'Role assigned successfully' });
}

/**
 * POST /api/roles/add-permission
 * Adds a permission to a role.
 */
export async function addPermissionToRole(req: AuthRequest, res: Response): Promise<Response> {
  const { roleId, permissionId } = req.body as { roleId?: number; permissionId?: number };

  if (!roleId || !permissionId) {
    return res.status(400).json({ error: 'roleId and permissionId are required' });
  }

  const db = getDatabase();

  const existing = await db.get(
    'SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
    [roleId, permissionId],
  );
  if (existing) {
    return res.status(409).json({ error: 'Permission already assigned to role' });
  }

  await db.run('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [
    roleId,
    permissionId,
  ]);

  await logAuditEvent({
    db,
    userId: req.user?.id,
    email: req.user?.email,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    description: `Added permission ${permissionId} to role ${roleId}`,
    ipAddress: req.ip,
    targetType: 'role',
    targetId: String(roleId),
    context: { permissionId, operation: 'add-permission' },
    severity: 'INFO',
  });

  return res.status(201).json({ message: 'Permission added to role' });
}

/**
 * POST /api/roles/remove-permission
 * Removes a permission from a role.
 */
export async function removePermissionFromRole(req: AuthRequest, res: Response): Promise<Response> {
  const { roleId, permissionId } = req.body as { roleId?: number; permissionId?: number };

  if (!roleId || !permissionId) {
    return res.status(400).json({ error: 'roleId and permissionId are required' });
  }

  const db = getDatabase();
  await db.run('DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2', [
    roleId,
    permissionId,
  ]);

  await logAuditEvent({
    db,
    userId: req.user?.id,
    email: req.user?.email,
    action: AUDIT_ACTIONS.ROLE_CHANGE,
    description: `Removed permission ${permissionId} from role ${roleId}`,
    ipAddress: req.ip,
    targetType: 'role',
    targetId: String(roleId),
    context: { permissionId, operation: 'remove-permission' },
    severity: 'INFO',
  });

  return res.status(200).json({ message: 'Permission removed from role' });
}

/**
 * GET /api/permissions
 * Returns all available permissions.
 */
export async function getAllPermissions(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const permissions = await db.all('SELECT id, name, description FROM permissions');
  return res.status(200).json(permissions);
}

/**
 * GET /api/user/role-permissions
 * Returns the current user's role and permissions.
 */
export async function getUserRoleAndPermissions(
  req: AuthRequest,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getDatabase();
  const role = await db.get('SELECT id, name, description FROM roles WHERE id = $1', [
    req.user.role_id,
  ]);

  const permissions = await db.all(
    `SELECT p.id, p.name, p.description FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     WHERE rp.role_id = $1`,
    [req.user.role_id],
  );

  return res.status(200).json({ role, permissions });
}
