/**
 * Admin API integration tests (#280)
 *
 * Verifies all acceptance criteria for issue #260:
 * - Admin can list all users (200)
 * - Non-admin gets 403 on all admin endpoints
 * - Admin can change a user's role
 * - Admin can lock a user account
 * - Admin can unlock a user account
 * - Admin cannot lock their own account (400)
 * - Admin can soft-delete a user
 * - Admin can restore a soft-deleted user
 * - Admin cannot delete their own account (400)
 * - Admin can list all roles
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/db/database.js';
import * as adminController from '../src/controllers/admin-controller.js';
import { authorizeRole } from '../src/middleware/auth.js';
import { hashPassword } from '../src/utils/auth-helpers.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  } as any;
}

function makeReq(params: any = {}, body: any = {}, user?: { id: number; email: string; role_id: number }) {
  return { params, body, user } as any;
}

const apiRoutesSource = readFileSync(new URL('../src/routes/api-routes.ts', import.meta.url), 'utf8');

async function seedUser(
  email: string,
  password: string,
  roleId: number,
  verified = true,
): Promise<number> {
  const db = getDatabase();
  const hash = await hashPassword(password);
  const result = await db.run(
    `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [email, hash, email.split('@')[0], verified ? 1 : 0, roleId],
  );
  return result.lastID as number;
}

describe('Admin API — integration tests (#260 #279 #280)', () => {
  let adminUserId: number;
  let regularUserId: number;

  beforeEach(async () => {
    await initializeDatabase();
    const db = getDatabase();
    await db.run('DELETE FROM users');

    adminUserId = await seedUser('admin@example.com', 'Admin1234', 3);
    regularUserId = await seedUser('user@example.com', 'User1234', 1);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  describe('admin route wiring', () => {
    it('registers all admin routes with auth and admin-role middleware', () => {
      const expectedRoutes = [
        "router.get('/admin/users', authenticateToken, authorizeRole(['Admin']), adminController.listUsers);",
        "router.patch('/admin/users/:id/role', authenticateToken, authorizeRole(['Admin']), adminController.changeUserRole);",
        "router.patch('/admin/users/:id/lock', authenticateToken, authorizeRole(['Admin']), adminController.toggleLock);",
        "router.delete('/admin/users/:id', authenticateToken, authorizeRole(['Admin']), adminController.deleteUser);",
        "router.post('/admin/users/:id/restore', authenticateToken, authorizeRole(['Admin']), adminController.restoreUser);",
        "router.get('/admin/roles', authenticateToken, authorizeRole(['Admin']), adminController.listRoles);",
      ];

      for (const routeLine of expectedRoutes) {
        expect(apiRoutesSource).toContain(routeLine);
      }
    });

    it('returns 403 from admin middleware for non-admin users', async () => {
      const authorizeAdmin = authorizeRole(['Admin']);
      const req = makeReq({}, {}, { id: regularUserId, email: 'user@example.com', role_id: 1 });
      const res = makeRes();
      const next = vi.fn();

      await authorizeAdmin(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/insufficient permissions/i);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── AC: List Users ─────────────────────────────────────────────────────────

  describe('GET /api/admin/users', () => {
    it('returns 200 with user list for Admin', async () => {
      const res = makeRes();
      await adminController.listUsers(makeReq(), res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    });

    it('includes role_name and updated_at in each user row', async () => {
      const res = makeRes();
      await adminController.listUsers(makeReq(), res);
      const user = res.body.users.find((u: any) => u.email === 'admin@example.com');
      expect(user).toBeDefined();
      expect(user.role_name).toBe('Admin');
      expect(user.updated_at).toBeDefined();
    });
  });

  // ── AC: Change User Role ───────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/role', () => {
    it('returns 200 and updates role for valid request', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        { role_id: 2 },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.changeUserRole(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/role updated/i);
    });

    it('returns 400 when role_id is missing', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.changeUserRole(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/role_id.*required/i);
    });

    it('returns 400 when role_id is invalid', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        { role_id: 9999 },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.changeUserRole(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid role_id/i);
    });

    it('returns 400 when admin tries to change their own role', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(adminUserId) },
        { role_id: 1 },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.changeUserRole(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/cannot change your own role/i);
    });
  });

  // ── AC: Lock / Unlock ──────────────────────────────────────────────────────

  describe('PATCH /api/admin/users/:id/lock', () => {
    it('returns 200 when locking a user', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        { locked: true },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.toggleLock(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/account locked/i);
    });

    it('returns 200 when unlocking a user', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        { locked: false },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.toggleLock(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/account unlocked/i);
    });

    it('returns 400 when locked param is missing', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.toggleLock(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/locked.*required/i);
    });

    it('returns 400 when admin tries to lock their own account', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(adminUserId) },
        { locked: true },
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.toggleLock(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/cannot lock your own account/i);
    });
  });

  // ── AC: Soft-Delete User ───────────────────────────────────────────────────

  describe('DELETE /api/admin/users/:id', () => {
    it('returns 200 and soft-deletes user', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.deleteUser(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/user deleted/i);

      // Verify deleted_at is set in DB
      const db = getDatabase();
      const user = await db.get('SELECT deleted_at FROM users WHERE id = ?', [regularUserId]);
      expect(user.deleted_at).not.toBeNull();
    });

    it('returns 400 when admin tries to delete their own account', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(adminUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.deleteUser(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/cannot delete your own account/i);
    });

    it('returns 404 for non-existent user', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: '99999' },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.deleteUser(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/user not found/i);
    });

    it('returns 400 when deleting an already-deleted user', async () => {
      const db = getDatabase();
      await db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [regularUserId]);

      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );
      await adminController.deleteUser(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/already deleted/i);
    });
  });

  // ── AC: Restore User ───────────────────────────────────────────────────────

  describe('POST /api/admin/users/:id/restore', () => {
    it('returns 200 and restores a soft-deleted user', async () => {
      const db = getDatabase();
      await db.run('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [regularUserId]);

      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );

      await adminController.restoreUser(req, res);
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toMatch(/user restored/i);

      const restoredUser = await db.get('SELECT deleted_at FROM users WHERE id = ?', [regularUserId]);
      expect(restoredUser.deleted_at).toBeNull();
    });

    it('returns 400 when restoring a user that is not deleted', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: String(regularUserId) },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );

      await adminController.restoreUser(req, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/not deleted/i);
    });

    it('returns 404 for a non-existent user', async () => {
      const res = makeRes();
      const req = makeReq(
        { id: '99999' },
        {},
        { id: adminUserId, email: 'admin@example.com', role_id: 3 },
      );

      await adminController.restoreUser(req, res);
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toMatch(/user not found/i);
    });
  });

  // ── AC: List Roles ─────────────────────────────────────────────────────────

  describe('GET /api/admin/roles', () => {
    it('returns 200 with roles list', async () => {
      const res = makeRes();
      await adminController.listRoles(makeReq(), res);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('roles');
      expect(Array.isArray(res.body.roles)).toBe(true);
      // Seeded roles: Attendee, Organizer, Admin
      expect(res.body.roles.length).toBeGreaterThanOrEqual(3);
    });

    it('includes expected role names', async () => {
      const res = makeRes();
      await adminController.listRoles(makeReq(), res);
      const names = res.body.roles.map((r: any) => r.name);
      expect(names).toContain('Admin');
      expect(names).toContain('Organizer');
      expect(names).toContain('Attendee');
    });
  });
});
