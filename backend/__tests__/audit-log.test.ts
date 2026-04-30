/**
 * Tests for Audit Log (#271, #256)
 *
 * Acceptance criteria:
 * - writeAuditLog inserts a row with user_id, action, description, ip_address
 * - A row is inserted for each audited action type:
 *     task.created, task.updated, task.deleted, task.status_toggled
 *     admin.user.role_changed, admin.user.locked, admin.user.unlocked,
 *     admin.user.deleted, rsvp.status_changed
 * - Audit failures do not throw (they log and continue)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { writeAuditLog } from '../src/utils/audit.js';

// Mock the database module so tests don't require a real DB connection
vi.mock('../src/db/database.js', () => {
  const runMock = vi.fn().mockResolvedValue({ changes: 1 });
  const getMock = vi.fn().mockResolvedValue(undefined);
  return {
    getDatabase: () => ({ run: runMock, get: getMock }),
    __runMock: runMock,
  };
});

import * as dbModule from '../src/db/database.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getRunMock = () => (dbModule as any).__runMock as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getRunMock().mockClear();
});

/**
 * Helper: assert that writeAuditLog inserts exactly one row with the
 * expected action, description, user_id, and ip_address.
 */
async function assertAuditInserted(
  action: string,
  description: string,
  userId: number | null = 1,
  ip: string | null = '127.0.0.1',
) {
  getRunMock().mockClear();
  await writeAuditLog({ userId, email: userId ? 'user@example.com' : null }, action, description, ip);

  expect(getRunMock()).toHaveBeenCalledTimes(1);
  const [sql, params] = getRunMock().mock.calls[0] as [string, unknown[]];

  expect(sql).toContain('INSERT INTO audit_log');
  expect(params).toContain(action);
  expect(params).toContain(description);
  expect(params).toContain(userId);
  expect(params).toContain(ip);
}

describe('writeAuditLog — task actions (#271 / #256)', () => {
  it('inserts an audit row for task.created', async () => {
    await assertAuditInserted('task.created', 'Created task #42: "Setup stage" in event #5');
  });

  it('inserts an audit row for task.updated', async () => {
    await assertAuditInserted('task.updated', 'Updated task #42: "Setup stage"');
  });

  it('inserts an audit row for task.deleted', async () => {
    await assertAuditInserted('task.deleted', 'Deleted task #42: "Setup stage"');
  });

  it('inserts an audit row for task.status_toggled', async () => {
    await assertAuditInserted('task.status_toggled', 'Toggled task #42 status to "Complete"');
  });
});

describe('writeAuditLog — admin user actions (#271 / #256)', () => {
  it('inserts an audit row for admin.user.role_changed', async () => {
    await assertAuditInserted('admin.user.role_changed', 'Admin changed role of user #7 to role_id 2');
  });

  it('inserts an audit row for admin.user.locked', async () => {
    await assertAuditInserted('admin.user.locked', 'Admin locked account for user #7');
  });

  it('inserts an audit row for admin.user.unlocked', async () => {
    await assertAuditInserted('admin.user.unlocked', 'Admin unlocked account for user #7');
  });

  it('inserts an audit row for admin.user.deleted', async () => {
    await assertAuditInserted('admin.user.deleted', 'Admin soft-deleted user #7');
  });
});

describe('writeAuditLog — RSVP status change (#271 / #256)', () => {
  it('inserts an audit row for rsvp.status_changed', async () => {
    await assertAuditInserted('rsvp.status_changed', 'RSVP #10 status changed from "Pending" to "Going"');
  });

  it('captures null user_id for unauthenticated actions', async () => {
    await assertAuditInserted('rsvp.status_changed', 'RSVP #10 status changed', null, '10.0.0.1');
  });
});

describe('writeAuditLog — resilience', () => {
  it('does not throw when the DB insert fails', async () => {
    getRunMock().mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(
      writeAuditLog({ userId: 1, email: 'u@example.com' }, 'task.created', 'desc', null),
    ).resolves.not.toThrow();
  });
});
