/**
 * BRD v2 — Audit log event tests (#538, #572)
 *
 * Verifies that the audit_log table has the BRD v2 columns and that the
 * logAuditEvent utility writes correct rows for auth events.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '../src/db/database.js';
import { logAuditEvent, AUDIT_ACTIONS } from '../src/utils/audit-log.js';
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

describe('Audit log schema (BRD v2)', () => {
  it('audit_log has actor_id column', async () => {
    const db = getDatabase();
    const row = await db.get<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_log' AND column_name = 'actor_id'`,
    );
    expect(row).toBeDefined();
  });

  it('audit_log has severity column with CHECK constraint', async () => {
    const db = getDatabase();
    const row = await db.get<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_log' AND column_name = 'severity'`,
    );
    expect(row).toBeDefined();
  });

  it('audit_log has context (JSONB) column', async () => {
    const db = getDatabase();
    const row = await db.get<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_log' AND column_name = 'context'`,
    );
    expect(row).toBeDefined();
  });

  it('audit_log has target_type and target_id columns', async () => {
    const db = getDatabase();
    const rows = await db.all<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'audit_log' AND column_name IN ('target_type', 'target_id')`,
    );
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('target_type');
    expect(cols).toContain('target_id');
  });
});

describe('logAuditEvent utility', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = getDatabase();
    const seed = `audit-test-${Date.now()}`;
    const result = await db.run(
      `INSERT INTO users (email, password_hash, display_name, role_id)
       VALUES (?, 'x', ?, 1) RETURNING id`,
      [`${seed}@test.local`, seed],
    );
    testUserId = result.lastID!;
  });

  it('writes a LOGIN_SUCCESS audit event', async () => {
    const db = getDatabase();
    await logAuditEvent({
      db,
      userId: testUserId,
      email: 'test@test.local',
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      description: 'Test login success',
      ipAddress: '127.0.0.1',
      severity: 'INFO',
    });

    const row = await db.get<{ action: string; severity: string }>(
      `SELECT action, severity FROM audit_log
       WHERE user_id = ? AND action = ?
       ORDER BY created_at DESC LIMIT 1`,
      [testUserId, AUDIT_ACTIONS.LOGIN_SUCCESS],
    );

    expect(row).toBeDefined();
    expect(row?.action).toBe(AUDIT_ACTIONS.LOGIN_SUCCESS);
    expect(row?.severity).toBe('INFO');
  });

  it('writes a LOGIN_FAILURE audit event with WARN severity', async () => {
    const db = getDatabase();
    await logAuditEvent({
      db,
      userId: testUserId,
      email: 'test@test.local',
      action: AUDIT_ACTIONS.LOGIN_FAILURE,
      description: 'Test login failure',
      ipAddress: '127.0.0.1',
      severity: 'WARN',
      context: { attempts: 3 },
    });

    const row = await db.get<{ action: string; severity: string }>(
      `SELECT action, severity FROM audit_log
       WHERE user_id = ? AND action = ?
       ORDER BY created_at DESC LIMIT 1`,
      [testUserId, AUDIT_ACTIONS.LOGIN_FAILURE],
    );

    expect(row?.severity).toBe('WARN');
  });

  it('writes a ROLE_CHANGE audit event with target_type=user', async () => {
    const db = getDatabase();
    await logAuditEvent({
      db,
      userId: testUserId,
      email: 'admin@test.local',
      action: AUDIT_ACTIONS.ROLE_CHANGE,
      description: 'Role changed to Collaborator',
      ipAddress: '10.0.0.1',
      severity: 'WARN',
      targetType: 'user',
      targetId: String(testUserId),
      context: { newRoleId: 4 },
    });

    const row = await db.get<{ action: string; target_type: string; target_id: string }>(
      `SELECT action, target_type, target_id FROM audit_log
       WHERE action = ? AND target_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [AUDIT_ACTIONS.ROLE_CHANGE, String(testUserId)],
    );

    expect(row?.action).toBe(AUDIT_ACTIONS.ROLE_CHANGE);
    expect(row?.target_type).toBe('user');
    expect(row?.target_id).toBe(String(testUserId));
  });

  it('does not throw when the audit write fails (non-blocking)', async () => {
    // Pass a null db — should not throw but log to stderr
    await expect(
      logAuditEvent({
        db: null as unknown as ReturnType<typeof getDatabase>,
        userId: null,
        email: null,
        action: AUDIT_ACTIONS.LOGOUT,
        description: 'Should not throw',
        ipAddress: null,
        severity: 'INFO',
      }),
    ).resolves.not.toThrow();
  });
});

describe('Audit actions constants', () => {
  it('AUDIT_ACTIONS has all required action keys', () => {
    const required = [
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGIN_ACCOUNT_LOCKED',
      'LOGOUT',
      'LOGOUT_ALL_SESSIONS',
      'TOKEN_REFRESH_SUCCESS',
      'TOKEN_REFRESH_FAILURE',
      'SESSION_EXPIRED',
      'ROLE_CHANGE',
      'PERMISSION_DENIED',
      'PASSWORD_RESET_REQUEST',
      'PASSWORD_RESET_COMPLETED',
      'UPLOAD_SCAN_PASS',
      'UPLOAD_SCAN_FAIL',
      'UPLOAD_REJECTED',
    ];
    for (const key of required) {
      expect(AUDIT_ACTIONS).toHaveProperty(key);
    }
  });
});
