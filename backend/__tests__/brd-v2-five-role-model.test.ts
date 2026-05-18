/**
 * BRD v2 — 5-role model unit tests (#537, #573)
 *
 * Verifies that all 6 roles are seeded correctly (Attendee, Organizer, Admin,
 * Collaborator, Guest, Viewer) and that their permissions match the BRD v2 spec.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { resolveTestDatabaseUrl } from '../test-database-url.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = resolveTestDatabaseUrl();
}

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
  if (!originalDatabaseUrl) delete process.env.DATABASE_URL;
});

describe('5-Role Model — role seeding', () => {
  it('seeds all 6 roles', async () => {
    const db = getDatabase();
    const roles = await db.all<{ id: number; name: string }>(
      'SELECT id, name FROM roles ORDER BY id',
    );
    const names = roles.map((r) => r.name);
    expect(names).toContain('Attendee');
    expect(names).toContain('Organizer');
    expect(names).toContain('Admin');
    expect(names).toContain('Collaborator');
    expect(names).toContain('Guest');
    expect(names).toContain('Viewer');
  });

  it('role IDs are stable (Attendee=1, Organizer=2, Admin=3, Collaborator=4, Guest=5, Viewer=6)', async () => {
    const db = getDatabase();
    const roleMap: Record<string, number> = {};
    const roles = await db.all<{ id: number; name: string }>('SELECT id, name FROM roles');
    for (const r of roles) roleMap[r.name] = r.id;

    expect(roleMap['Attendee']).toBe(1);
    expect(roleMap['Organizer']).toBe(2);
    expect(roleMap['Admin']).toBe(3);
    expect(roleMap['Collaborator']).toBe(4);
    expect(roleMap['Guest']).toBe(5);
    expect(roleMap['Viewer']).toBe(6);
  });
});

describe('5-Role Model — permission assignments', () => {
  async function getPermissionsForRole(roleName: string): Promise<string[]> {
    const db = getDatabase();
    const rows = await db.all<{ name: string }>(
      `SELECT p.name
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE r.name = ?
       ORDER BY p.name`,
      [roleName],
    );
    return rows.map((r) => r.name);
  }

  it('Admin has all permissions', async () => {
    const permissions = await getPermissionsForRole('Admin');
    expect(permissions.length).toBeGreaterThan(0);
    // Admin should have at minimum everything Organizer has plus admin-specific
    expect(permissions).toContain('events.create');
    expect(permissions).toContain('events.edit');
    expect(permissions).toContain('events.delete');
    expect(permissions).toContain('users.manage');
  });

  it('Organizer can create and edit events', async () => {
    const permissions = await getPermissionsForRole('Organizer');
    expect(permissions).toContain('events.create');
    expect(permissions).toContain('events.edit');
  });

  it('Organizer cannot delete users', async () => {
    const permissions = await getPermissionsForRole('Organizer');
    expect(permissions).not.toContain('users.manage');
  });

  it('Collaborator can edit events but not create them', async () => {
    const permissions = await getPermissionsForRole('Collaborator');
    expect(permissions).toContain('events.edit');
    expect(permissions).not.toContain('events.create');
  });

  it('Guest has limited permissions (rsvp.create, rsvp.view)', async () => {
    const permissions = await getPermissionsForRole('Guest');
    expect(permissions).toContain('rsvp.create');
    expect(permissions).toContain('rsvp.view');
    expect(permissions).not.toContain('events.create');
    expect(permissions).not.toContain('events.edit');
  });

  it('Viewer has view-only permissions', async () => {
    const permissions = await getPermissionsForRole('Viewer');
    expect(permissions).not.toContain('events.create');
    expect(permissions).not.toContain('events.edit');
    expect(permissions).not.toContain('events.delete');
  });

  it('Attendee permissions match Guest permissions', async () => {
    const attendeePerms = await getPermissionsForRole('Attendee');
    const guestPerms = await getPermissionsForRole('Guest');
    // Both should be equivalent minimal sets
    expect(attendeePerms.sort()).toEqual(guestPerms.sort());
  });
});
