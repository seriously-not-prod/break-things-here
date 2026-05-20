import { describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '../src/db/database.js';
import { AUDIT_ACTIONS, logMutation, type AuditTargetType } from '../src/utils/audit-log.js';

function buildMockDb(): { db: DatabaseAdapter; runMock: ReturnType<typeof vi.fn> } {
  const runMock = vi.fn().mockResolvedValue({ lastID: 1, changes: 1 });
  const db = {
    get: vi.fn(),
    all: vi.fn(),
    exec: vi.fn(),
    run: runMock,
  } as unknown as DatabaseAdapter;
  return { db, runMock };
}

describe('logMutation wrapper', () => {
  it('persists actor + target + context for an authenticated request', async () => {
    const { db, runMock } = buildMockDb();
    await logMutation(
      db,
      { ip: '1.2.3.4', user: { id: 42, email: 'alice@example.com' } },
      AUDIT_ACTIONS.RSVP_UPDATE,
      'rsvp' as AuditTargetType,
      99,
      { eventId: '7' },
    );

    expect(runMock).toHaveBeenCalledOnce();
    const params = runMock.mock.calls[0][1] as unknown[];
    // [user_id, email, action, description, ip_address, actor_id, target_type, target_id, context, severity]
    expect(params[0]).toBe(42); // user_id
    expect(params[1]).toBe('alice@example.com'); // email
    expect(params[2]).toBe('RSVP_UPDATE'); // action
    expect(params[4]).toBe('1.2.3.4'); // ip_address
    expect(params[5]).toBe(42); // actor_id
    expect(params[6]).toBe('rsvp'); // target_type
    expect(params[7]).toBe('99'); // target_id stringified
    expect(params[8]).toBe(JSON.stringify({ eventId: '7' })); // context
    expect(params[9]).toBe('INFO'); // severity default
  });

  it('falls back to the provided email when there is no authenticated user', async () => {
    // This is the public createRsvp surface — req.user is undefined but the
    // submitter's email is available on the request body. The audit row
    // should still be attributable.
    const { db, runMock } = buildMockDb();
    await logMutation(
      db,
      { ip: '5.6.7.8', user: undefined },
      AUDIT_ACTIONS.RSVP_CREATE,
      'rsvp' as AuditTargetType,
      'guest-token-abc',
      { eventId: '7', waitlisted: true },
      'guest@external.org',
    );

    const params = runMock.mock.calls[0][1] as unknown[];
    expect(params[0]).toBeNull(); // user_id is null (no auth)
    expect(params[1]).toBe('guest@external.org'); // email fallback used
    expect(params[5]).toBeNull(); // actor_id is null
    expect(params[7]).toBe('guest-token-abc'); // string ids pass through
  });

  it('stringifies numeric targetId so target_id is always TEXT', async () => {
    const { db, runMock } = buildMockDb();
    await logMutation(
      db,
      { user: { id: 1, email: 'x@y.com' } },
      AUDIT_ACTIONS.VENDOR_DELETE,
      'vendor' as AuditTargetType,
      12345, // number
    );
    const params = runMock.mock.calls[0][1] as unknown[];
    expect(params[7]).toBe('12345');
  });

  it('does not throw when the underlying audit insert fails', async () => {
    // logAuditEvent swallows db errors so the primary operation isn't broken.
    const runMock = vi.fn().mockRejectedValue(new Error('audit table missing'));
    const db = { run: runMock } as unknown as DatabaseAdapter;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(
        logMutation(
          db,
          { user: { id: 1, email: 'x@y.com' } },
          AUDIT_ACTIONS.TASK_DELETE,
          'task' as AuditTargetType,
          1,
        ),
      ).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
