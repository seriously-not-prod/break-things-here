import type { NextFunction, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '../src/middleware/auth.js';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const defaultDatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:5432/festival_planner';

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
    const allPermissions = await db.all<{ name: string }>('SELECT name FROM permissions ORDER BY name');
    const adminPermissions = await db.all<{ name: string }>(
      `SELECT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.name`,
      [3],
    );

    expect(adminPermissions.map(({ name }) => name)).toEqual(allPermissions.map(({ name }) => name));
  });

  it('allows Admin users through authorizePermission for seeded permissions', async () => {
    const { next, response } = await runPermissionCheck(3, 'roles.manage');

    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
  });

  it('allows Organizer users through authorizePermission for seeded permissions', async () => {
    const createEventCheck = await runPermissionCheck(2, 'events.create');
    const viewRolesCheck = await runPermissionCheck(2, 'roles.view');

    expect(createEventCheck.next).toHaveBeenCalledOnce();
    expect(createEventCheck.response.statusCode).toBe(200);
    expect(viewRolesCheck.next).toHaveBeenCalledOnce();
    expect(viewRolesCheck.response.statusCode).toBe(200);
  });

  it('allows Attendee users through authorizePermission for seeded permissions', async () => {
    const { next, response } = await runPermissionCheck(1, 'events.view');

    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200);
  });
});