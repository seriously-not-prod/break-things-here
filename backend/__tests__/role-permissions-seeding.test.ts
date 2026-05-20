import type { NextFunction, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '../src/middleware/auth.js';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = resolveTestDatabaseUrl();

if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = defaultDatabaseUrl;
}

interface MockResponse extends Partial<Response> {
  statusCode: number;
  body: unknown;
  status(code: number): MockResponse;
  json(data: unknown): MockResponse;
}

function makeResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number): MockResponse {
      this.statusCode = code;
      return this;
    },
    json(data: unknown): MockResponse {
      this.body = data;
      return this;
    },
  };
}

function makeRequest(roleId: number): { user: { id: number; email: string; role_id: number } } {
  return {
    user: {
      id: roleId,
      email: `role-${roleId}@test.local`,
      role_id: roleId,
    },
  };
}

async function getRoleId(roleName: 'Admin' | 'Organizer' | 'Attendee'): Promise<number> {
  const db = getDatabase();
  const role = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [roleName]);

  if (!role) {
    throw new Error(`Role ${roleName} was not found during test setup`);
  }

  return role.id;
}

async function runPermissionCheck(
  roleId: number,
  permissionName: string,
): Promise<{ next: NextFunction; response: MockResponse }> {
  const response = makeResponse();
  const next = vi.fn();

  await authorizePermission(permissionName)(
    makeRequest(roleId) as Parameters<ReturnType<typeof authorizePermission>>[0],
    response as Response,
    next,
  );

  return {
    next,
    response,
  };
}

beforeAll(async (): Promise<void> => {
  await initializeDatabase();
});

afterAll(async (): Promise<void> => {
  await closeDatabase();

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
    return;
  }

  delete process.env.DATABASE_URL;
});

describe('Role permission seeding', () => {
  it('seeds every defined permission for the Admin role', async () => {
    const db = getDatabase();
    const adminRoleId = await getRoleId('Admin');
    const allPermissions = await db.all<{ name: string }>(
      'SELECT name FROM permissions ORDER BY name',
    );
    const adminPermissions = await db.all<{ name: string }>(
      `SELECT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.name`,
      [adminRoleId],
    );

    expect(adminPermissions.map(({ name }) => name)).toEqual(
      allPermissions.map(({ name }) => name),
    );
  });

  it('allows Admin users through authorizePermission for seeded permissions', async () => {
    const adminRoleId = await getRoleId('Admin');
    const { next, response } = await runPermissionCheck(adminRoleId, 'roles.manage');

    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
  });

  it('allows Organizer users through authorizePermission for seeded permissions', async () => {
    const organizerRoleId = await getRoleId('Organizer');
    const createEventCheck = await runPermissionCheck(organizerRoleId, 'events.create');
    const viewRolesCheck = await runPermissionCheck(organizerRoleId, 'roles.view');
    const manageRolesCheck = await runPermissionCheck(organizerRoleId, 'roles.manage');

    expect(createEventCheck.next).toHaveBeenCalledOnce();
    expect(createEventCheck.response.statusCode).toBe(200);
    expect(viewRolesCheck.next).toHaveBeenCalledOnce();
    expect(viewRolesCheck.response.statusCode).toBe(200);
    expect(manageRolesCheck.next).not.toHaveBeenCalled();
    expect(manageRolesCheck.response.statusCode).toBe(403);
  });

  it('allows Attendee users through authorizePermission for seeded permissions', async () => {
    const attendeeRoleId = await getRoleId('Attendee');
    const viewEventsCheck = await runPermissionCheck(attendeeRoleId, 'events.view');
    const createEventCheck = await runPermissionCheck(attendeeRoleId, 'events.create');

    expect(viewEventsCheck.next).toHaveBeenCalledOnce();
    expect(viewEventsCheck.response.statusCode).toBe(200);
    expect(createEventCheck.next).not.toHaveBeenCalled();
    expect(createEventCheck.response.statusCode).toBe(403);
  });
});
