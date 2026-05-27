/**
 * Tests: AI RBAC Middleware — Issue #963
 *
 * Covers the `ai-rbac` middleware in full:
 *
 * requireAiAccess
 * - Returns 401 when req.user is not set (unauthenticated)
 * - Returns 403 when user lacks the ai.access permission
 * - Logs an AI_ACCESS_DENIED audit event on denial
 * - Calls next() when user has the ai.access permission
 * - Logs an AI_ACCESS_GRANTED audit event on success
 * - Logs the correct context fields (path, method, roleId)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireAiAccess, AI_PERMISSION } from '../src/middleware/ai-rbac.js';
import { AUDIT_ACTIONS } from '../src/utils/audit-log.js';

// ── Mock the database ────────────────────────────────────────────────────────

vi.mock('../src/db/database.js', () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from '../src/db/database.js';

// ── Mock the audit log ────────────────────────────────────────────────────────

vi.mock('../src/utils/audit-log.js', async () => {
  const actual = await vi.importActual<typeof import('../src/utils/audit-log.js')>(
    '../src/utils/audit-log.js',
  );
  return {
    ...actual,
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
  };
});

import { logAuditEvent } from '../src/utils/audit-log.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
  status(code: number): this;
  json(payload: unknown): this;
}

function makeRes(): Response & MockResponse {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & MockResponse;
}

function makeReq(
  user?: { id: number; email: string; role_id: number },
  overrides: Partial<Request> = {},
): Request {
  return {
    user,
    ip: '127.0.0.1',
    path: '/api/ai/suggest',
    method: 'POST',
    ...overrides,
  } as unknown as Request;
}

// ── Test DB helpers ───────────────────────────────────────────────────────────

function mockDbWithPermission(hasPermission: boolean): void {
  const mockDb = {
    get: vi.fn().mockResolvedValue(hasPermission ? { exists: 1 } : undefined),
    run: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(getDatabase).mockReturnValue(mockDb as never);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireAiAccess — unauthenticated', () => {
  it('returns 401 when req.user is absent', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(res.statusCode).toBe(401);
    expect((res as MockResponse).body).toEqual({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not call logAuditEvent when req.user is absent', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('requireAiAccess — access denied (no permission)', () => {
  beforeEach(() => {
    mockDbWithPermission(false);
  });

  it('returns 403 when user lacks ai.access permission', async () => {
    const req = makeReq({ id: 42, email: 'attendee@example.com', role_id: 1 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(res.statusCode).toBe(403);
    expect((res as MockResponse).body).toEqual({
      error: 'AI features require elevated permissions.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('queries the DB for the correct permission name', async () => {
    const mockDb = {
      get: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(getDatabase).mockReturnValue(mockDb as never);

    const req = makeReq({ id: 42, email: 'attendee@example.com', role_id: 1 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    const [query, params] = mockDb.get.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('role_permissions');
    expect(query).toContain('permissions');
    expect(params).toContain(1); // role_id
    expect(params).toContain(AI_PERMISSION);
  });

  it('logs an AI_ACCESS_DENIED audit event', async () => {
    const req = makeReq({ id: 42, email: 'attendee@example.com', role_id: 1 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(logAuditEvent).toHaveBeenCalledOnce();
    const call = vi.mocked(logAuditEvent).mock.calls[0][0];
    expect(call.action).toBe(AUDIT_ACTIONS.AI_ACCESS_DENIED);
    expect(call.userId).toBe(42);
    expect(call.email).toBe('attendee@example.com');
    expect(call.severity).toBe('WARN');
  });

  it('includes path, method, and roleId in the denial audit context', async () => {
    const req = makeReq(
      { id: 5, email: 'viewer@example.com', role_id: 6 },
      { path: '/api/ai/grounded', method: 'POST' } as Partial<Request>,
    );
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    const call = vi.mocked(logAuditEvent).mock.calls[0][0];
    expect(call.context).toMatchObject({
      path: '/api/ai/grounded',
      method: 'POST',
      roleId: 6,
      requiredPermission: AI_PERMISSION,
    });
  });
});

describe('requireAiAccess — access granted (has permission)', () => {
  beforeEach(() => {
    mockDbWithPermission(true);
  });

  it('calls next() when user has ai.access permission', async () => {
    const req = makeReq({ id: 7, email: 'organizer@example.com', role_id: 2 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200); // status not changed
  });

  it('does NOT set an error response body when access is granted', async () => {
    const req = makeReq({ id: 7, email: 'organizer@example.com', role_id: 2 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect((res as MockResponse).body).toBeNull();
  });

  it('logs an AI_ACCESS_GRANTED audit event', async () => {
    const req = makeReq({ id: 7, email: 'organizer@example.com', role_id: 2 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    expect(logAuditEvent).toHaveBeenCalledOnce();
    const call = vi.mocked(logAuditEvent).mock.calls[0][0];
    expect(call.action).toBe(AUDIT_ACTIONS.AI_ACCESS_GRANTED);
    expect(call.userId).toBe(7);
    expect(call.email).toBe('organizer@example.com');
    expect(call.severity).toBe('INFO');
  });

  it('logs an AI_ACCESS_GRANTED audit event for Admin role', async () => {
    const req = makeReq({ id: 1, email: 'admin@example.com', role_id: 3 });
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    const call = vi.mocked(logAuditEvent).mock.calls[0][0];
    expect(call.action).toBe(AUDIT_ACTIONS.AI_ACCESS_GRANTED);
    expect(call.context).toMatchObject({ roleId: 3 });
  });

  it('includes path and method in the grant audit context', async () => {
    const req = makeReq(
      { id: 7, email: 'organizer@example.com', role_id: 2 },
      { path: '/api/ai/budget-insight', method: 'POST' } as Partial<Request>,
    );
    const res = makeRes();
    const next = vi.fn();

    await requireAiAccess(req, res, next as unknown as NextFunction);

    const call = vi.mocked(logAuditEvent).mock.calls[0][0];
    expect(call.context).toMatchObject({
      path: '/api/ai/budget-insight',
      method: 'POST',
      roleId: 2,
    });
  });
});

describe('AI_PERMISSION constant', () => {
  it('exports the canonical permission name', () => {
    expect(AI_PERMISSION).toBe('ai.access');
  });
});
