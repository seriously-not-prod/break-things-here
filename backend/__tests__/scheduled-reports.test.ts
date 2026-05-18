/**
 * BRD v2 — scheduled reports controller tests (#562).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockDb {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

let mockDb: MockDb;

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));
vi.mock('../src/db/database.js', () => ({
  getDatabase: () => mockDb,
}));

vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: async () => ({ id: 1, created_by: 7, deleted_at: null }),
}));

import {
  createReport,
  recordDelivery,
  renderReport,
} from '../src/controllers/reports-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
) {
  return {
    params,
    query: {},
    body,
    user: { id: 7, email: 'owner@test.com', role_id: 2 },
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

describe('reports controller', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('rejects unknown report type', async () => {
    const req = makeReq(
      { eventId: '1' },
      { reportType: 'mystery', frequency: 'weekly', recipients: ['a@b.com'] },
    );
    const res = makeRes();
    await createReport(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty recipients', async () => {
    const req = makeReq(
      { eventId: '1' },
      { reportType: 'rsvp_summary', frequency: 'weekly', recipients: [] },
    );
    const res = makeRes();
    await createReport(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid email addresses', async () => {
    const req = makeReq(
      { eventId: '1' },
      { reportType: 'rsvp_summary', frequency: 'daily', recipients: ['not-an-email'] },
    );
    const res = makeRes();
    await createReport(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('creates a valid report and computes next_run_at', async () => {
    mockDb.run.mockResolvedValueOnce({ lastID: 33, changes: 1 });
    mockDb.get.mockResolvedValueOnce({
      id: 33,
      event_id: 1,
      report_type: 'rsvp_summary',
      frequency: 'weekly',
      recipients: ['ops@example.com'],
      filters: null,
      next_run_at: '2026-05-19T06:00:00.000Z',
      last_run_at: null,
      is_active: true,
      created_at: '',
    });

    const req = makeReq(
      { eventId: '1' },
      {
        reportType: 'rsvp_summary',
        frequency: 'weekly',
        recipients: ['ops@example.com'],
      },
    );
    const res = makeRes();
    await createReport(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 33, report_type: 'rsvp_summary' });
  });

  it('renders an rsvp_summary payload', async () => {
    mockDb.get
      .mockResolvedValueOnce({ id: 1, report_type: 'rsvp_summary', filters: null })
      .mockResolvedValueOnce({
        going: 12,
        maybe: 3,
        pending: 1,
        declined: 2,
        checked_in: 5,
        total: 18,
      });
    const req = makeReq({ eventId: '1', reportId: '1' });
    const res = makeRes();
    await renderReport(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    const body = res.body as { payload: { counts: { total: number } } };
    expect(body.payload.counts.total).toBe(18);
  });

  it('recordDelivery validates status', async () => {
    const req = makeReq({ eventId: '1', reportId: '1' }, { status: 'kaboom' });
    const res = makeRes();
    await recordDelivery(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });
});
