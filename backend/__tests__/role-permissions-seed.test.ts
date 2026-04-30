import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';
import { authorizePermission } from '../src/middleware/auth.js';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';

process.env.DATABASE_URL ||= 'postgresql://festival_user:change_me_in_local_env@localhost:5432/festival_planner_test';

type AuthRequest = {
  user?: { id: number; email: string; role_id: number };
};

function makeResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.body = data;
      return this;
    },
  } as Response & { statusCode: number; body: unknown };
}

async function runPermissionCheck(roleId: number, permission: string) {
  const middleware = authorizePermission(permission);
  const req = {
    user: { id: roleId, email: `role-${roleId}@test.com`, role_id: roleId },
  } as AuthRequest;
  const res = makeResponse();
  const next = vi.fn() as NextFunction;

  await middleware(req as never, res, next);

  return { res, next };
}

describe('Role-permission seed migration (#265 #287)', () => {
  beforeEach(async () => {
    await initializeDatabase();
    const db = getDatabase();
    await db.run('DELETE FROM role_permissions');
    await closeDatabase();

    await initializeDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it('seeds the expected permissions for each default role', async () => {
    const db = getDatabase();
    const rows = await db.all<{ role_id: number; permission_name: string }>(
      `SELECT rp.role_id, p.name AS permission_name
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       ORDER BY rp.role_id, p.name`,
    );

    const rolePermissions = new Map<number, string[]>();
    for (const row of rows) {
      const current = rolePermissions.get(row.role_id) ?? [];
      current.push(row.permission_name);
      rolePermissions.set(row.role_id, current);
    }

    expect(rolePermissions.get(3)).toEqual([
      'events.create',
      'events.delete',
      'events.edit',
      'events.view',
      'roles.manage',
      'roles.view',
      'users.delete',
      'users.edit',
      'users.view',
    ]);

    expect(rolePermissions.get(2)).toEqual([
      'events.create',
      'events.delete',
      'events.edit',
      'events.view',
      'roles.view',
    ]);

    expect(rolePermissions.get(1)).toEqual([
      'events.view',
      'users.view',
    ]);
  });

  it('allows Admin to use roles.manage', async () => {
    const { res, next } = await runPermissionCheck(3, 'roles.manage');

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('allows Organizer to use events.create', async () => {
    const { res, next } = await runPermissionCheck(2, 'events.create');

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('allows Attendee to use events.view and denies events.create', async () => {
    const allowed = await runPermissionCheck(1, 'events.view');
    const denied = await runPermissionCheck(1, 'events.create');

    expect(allowed.next).toHaveBeenCalledOnce();
    expect(allowed.res.statusCode).toBe(200);
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.res.statusCode).toBe(403);
  });
});