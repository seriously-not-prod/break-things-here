/**
 * Integration test: Custom report builder (#812)
 *
 * Covers acceptance criteria:
 *   ✅ buildReport returns columns + rows for guests domain (RSVP-status report)
 *   ✅ filters are applied (status = 'Going')
 *   ✅ sort is applied
 *   ✅ unknown fields are silently dropped from SELECT
 *   ✅ invalid filter operator is silently skipped
 *   ✅ getDomainFieldMeta returns correct shape for all domains
 *   ✅ getAllDomains returns all five domains
 *   ✅ runReport controller returns 400 for unknown domain
 *   ✅ saveReport controller returns 400 when name is missing
 *   ✅ getDomains controller returns domains array
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockAll = vi.fn();
const mockRun = vi.fn().mockResolvedValue({ lastID: 99, changes: 1 });
const mockGet = vi.fn();

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => ({
    all: mockAll,
    run: mockRun,
    get: mockGet,
    exec: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: vi.fn().mockResolvedValue({ id: 1, name: 'Test Event' }),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('exceljs', () => {
  const mockSheet = {
    addRow: vi.fn(),
    getRow: vi.fn().mockReturnValue({ font: {} }),
    columns: [],
    eachCell: vi.fn(),
  };
  return {
    default: class {
      addWorksheet() { return mockSheet; }
      xlsx = { write: vi.fn().mockResolvedValue(undefined) };
    },
  };
});

import {
  buildReport,
  getDomainFieldMeta,
  getAllDomains,
} from '../src/services/reports/build-report.js';
import { getDomains, runReport, saveReport } from '../src/controllers/reports-builder-controller.js';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    send(body: unknown) { this.body = body; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; return this; },
    end() { return this; },
    write: vi.fn(),
  };
  return res;
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: 1, email: 'test@example.com', role_id: 1 },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('build-report service (#812)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockResolvedValue([]);
  });

  describe('getAllDomains', () => {
    it('returns all five domains', () => {
      const domains = getAllDomains();
      expect(domains).toEqual(['events', 'guests', 'budget', 'tasks', 'vendors']);
    });
  });

  describe('getDomainFieldMeta', () => {
    it('returns correct shape for guests domain', () => {
      const fields = getDomainFieldMeta('guests');
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0]).toMatchObject({ key: expect.any(String), label: expect.any(String), filterable: expect.any(Boolean) });
    });

    it('returns filterable=true for status field in guests', () => {
      const fields = getDomainFieldMeta('guests');
      const status = fields.find((f) => f.key === 'status');
      expect(status?.filterable).toBe(true);
    });

    it('returns empty array for unknown domain', () => {
      const fields = getDomainFieldMeta('unknown' as never);
      expect(fields).toEqual([]);
    });
  });

  describe('buildReport — guests domain (RSVP-status report)', () => {
    it('queries db.all with event scoped WHERE clause', async () => {
      const rows = [
        { guest_name: 'Alice', email: 'alice@ex.com', status: 'Going' },
        { guest_name: 'Bob',   email: 'bob@ex.com',   status: 'Going' },
      ];
      mockAll.mockResolvedValue(rows);

      const result = await buildReport({
        domain: 'guests',
        eventId: 42,
        fields: ['guest_name', 'email', 'status'],
      });

      expect(mockAll).toHaveBeenCalledOnce();
      const [sql, params] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('r.event_id = $1');
      expect(params[0]).toBe(42);
      expect(result.rows).toHaveLength(2);
      expect(result.columns).toContain('RSVP Status');
    });

    it('applies = filter for RSVP status', async () => {
      mockAll.mockResolvedValue([]);

      await buildReport({
        domain: 'guests',
        eventId: 1,
        fields: ['guest_name', 'status'],
        filters: [{ field: 'status', operator: '=', value: 'Going' }],
      });

      const [sql, params] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("r.status = $");
      expect(params).toContain('Going');
    });

    it('applies contains filter correctly', async () => {
      mockAll.mockResolvedValue([]);

      await buildReport({
        domain: 'guests',
        eventId: 1,
        fields: ['guest_name'],
        filters: [{ field: 'guest_name', operator: 'contains', value: 'alice' }],
      });

      const [sql, params] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ILIKE');
      expect(params.find((p) => String(p).includes('%alice%'))).toBeDefined();
    });

    it('silently drops unknown field names from SELECT', async () => {
      mockAll.mockResolvedValue([]);

      await buildReport({
        domain: 'guests',
        eventId: 1,
        fields: ['guest_name', 'non_existent_field', 'status'],
      });

      const [sql] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('non_existent_field');
      expect(sql).toContain('"guest_name"');
    });

    it('silently skips filter with invalid operator', async () => {
      mockAll.mockResolvedValue([]);

      await buildReport({
        domain: 'guests',
        eventId: 1,
        fields: ['status'],
        filters: [{ field: 'status', operator: 'INJECT' as never, value: "'; DROP TABLE users; --" }],
      });

      const [sql] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).not.toContain('INJECT');
      expect(sql).not.toContain('DROP TABLE');
    });

    it('applies sort correctly', async () => {
      mockAll.mockResolvedValue([]);

      await buildReport({
        domain: 'guests',
        eventId: 1,
        fields: ['guest_name', 'status'],
        sort: { field: 'guest_name', direction: 'asc' },
      });

      const [sql] = mockAll.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ORDER BY r.guest_name ASC');
    });

    it('throws when no valid fields are resolved', async () => {
      await expect(
        buildReport({ domain: 'guests', eventId: 1, fields: ['bogus', 'invalid'] }),
      ).rejects.toThrow('No valid fields selected');
    });
  });

  describe('buildReport — all domains resolve without error', () => {
    const domains = ['events', 'guests', 'budget', 'tasks', 'vendors'] as const;
    for (const domain of domains) {
      it(`runs for domain: ${domain}`, async () => {
        mockAll.mockResolvedValue([]);
        await expect(
          buildReport({ domain, eventId: 1, fields: [] }), // [] → use all fields
        ).resolves.toBeDefined();
      });
    }
  });
});

describe('reports-builder-controller (#812)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAll.mockResolvedValue([]);
  });

  describe('getDomains', () => {
    it('returns domains array for authenticated user', () => {
      const req = makeReq();
      const res = makeRes();
      getDomains(req, res as unknown as Response);
      expect(res.statusCode).toBe(200);
      const body = res.body as { domains: Array<{ domain: string }> };
      expect(body.domains.map((d) => d.domain)).toContain('guests');
    });

    it('returns 401 when unauthenticated', () => {
      const req = makeReq({ user: undefined } as never);
      const res = makeRes();
      getDomains(req, res as unknown as Response);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('runReport', () => {
    it('returns 400 for unknown domain', async () => {
      const req = makeReq({ params: { eventId: '1' }, body: { domain: 'bogus' } });
      const res = makeRes();
      await runReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for invalid format', async () => {
      const req = makeReq({ params: { eventId: '1' }, body: { domain: 'guests', format: 'docx' } });
      const res = makeRes();
      await runReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(400);
    });

    it('returns JSON result for valid domain', async () => {
      mockAll.mockResolvedValue([{ guest_name: 'Alice', status: 'Going' }]);
      const req = makeReq({
        params: { eventId: '5' },
        body: { domain: 'guests', fields: ['guest_name', 'status'], format: 'json' },
      });
      const res = makeRes();
      await runReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(200);
      const body = res.body as { domain: string; rows: unknown[] };
      expect(body.domain).toBe('guests');
      expect(body.rows).toHaveLength(1);
    });
  });

  describe('saveReport', () => {
    it('returns 400 when name is missing', async () => {
      const req = makeReq({ params: { eventId: '1' }, body: { domain: 'guests', frequency: 'one_off' } });
      const res = makeRes();
      await saveReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(400);
      expect((res.body as { error: string }).error).toContain('name');
    });

    it('returns 400 when domain is invalid', async () => {
      const req = makeReq({ params: { eventId: '1' }, body: { name: 'Test', domain: 'bogus', frequency: 'one_off' } });
      const res = makeRes();
      await saveReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when scheduled but no recipients', async () => {
      const req = makeReq({
        params: { eventId: '1' },
        body: { name: 'Daily Report', domain: 'guests', frequency: 'daily', recipients: [] },
      });
      const res = makeRes();
      await saveReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(400);
    });

    it('inserts and returns 201 for one_off save', async () => {
      mockGet.mockResolvedValue({ id: 99, report_type: 'custom_builder', frequency: 'one_off' });
      const req = makeReq({
        params: { eventId: '1' },
        body: { name: 'Quick Report', domain: 'guests', frequency: 'one_off', fields: ['guest_name'] },
      });
      const res = makeRes();
      await saveReport(req, res as unknown as Response);
      expect(res.statusCode).toBe(201);
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('custom_builder'),
        expect.arrayContaining([1]),
      );
    });
  });
});
