/**
 * Budget controller tests — issue #234
 *
 * Tests GET /api/events/:eventId/budget and PUT /api/events/:eventId/budget.
 * No real database required — getDatabase is mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock req/res helpers
// ---------------------------------------------------------------------------
function makeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return { params, body, user: { id: 1, email: 'admin@test.com', role_id: 3 } } as unknown as import('express').Request;
}

// ---------------------------------------------------------------------------
// Mock db
// ---------------------------------------------------------------------------
const mockDb = {
  all: vi.fn(),
  get: vi.fn(),
  run: vi.fn(),
  exec: vi.fn(),
};

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => mockDb,
}));

import * as budgetsController from '../src/controllers/budgets-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const BUDGET = {
  id: 1,
  event_id: 10,
  total_budget: 5000.00,
  currency: 'USD',
  notes: 'Initial budget',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const BREAKDOWN = [
  { category: 'Catering', color: '#6366f1', amount: 2000 },
  { category: 'AV', color: '#f59e0b', amount: 500 },
];

// ---------------------------------------------------------------------------

describe('getBudget', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '999' });
    const res = makeRes();
    await budgetsController.getBudget(req, res as never);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/event not found/i);
  });

  it('returns null budget when none set yet', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });   // event exists
    mockDb.get.mockResolvedValueOnce(null);           // no budget
    mockDb.get.mockResolvedValueOnce({ total: 0 });  // total_spent
    mockDb.all.mockResolvedValueOnce([]);             // breakdown
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await budgetsController.getBudget(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { budget: null }).budget).toBeNull();
  });

  it('returns budget with summary when budget exists', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.get.mockResolvedValueOnce(BUDGET);
    mockDb.get.mockResolvedValueOnce({ total: 2500 });
    mockDb.all.mockResolvedValueOnce(BREAKDOWN);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await budgetsController.getBudget(req, res as never);
    const body = res.body as { budget: typeof BUDGET; summary: { total_budget: number; total_spent: number; remaining: number }; breakdown: typeof BREAKDOWN };
    expect(body.budget).toEqual(BUDGET);
    expect(body.summary.total_budget).toBe(5000);
    expect(body.summary.total_spent).toBe(2500);
    expect(body.summary.remaining).toBe(2500);
  });

  it('returns breakdown by category', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.get.mockResolvedValueOnce(BUDGET);
    mockDb.get.mockResolvedValueOnce({ total: 2500 });
    mockDb.all.mockResolvedValueOnce(BREAKDOWN);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await budgetsController.getBudget(req, res as never);
    expect((res.body as { breakdown: typeof BREAKDOWN }).breakdown).toEqual(BREAKDOWN);
  });

  it('calculates remaining correctly when over budget', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.get.mockResolvedValueOnce({ ...BUDGET, total_budget: 1000 });
    mockDb.get.mockResolvedValueOnce({ total: 1500 });
    mockDb.all.mockResolvedValueOnce([]);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await budgetsController.getBudget(req, res as never);
    expect((res.body as { summary: { remaining: number } }).summary.remaining).toBe(-500);
  });
});

// ---------------------------------------------------------------------------

describe('upsertBudget', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when total_budget is missing', async () => {
    const req = makeReq({ eventId: '10' }, {});
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/total_budget is required/i);
  });

  it('returns 400 when total_budget is negative', async () => {
    const req = makeReq({ eventId: '10' }, { total_budget: -100 });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/non-negative/i);
  });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '999' }, { total_budget: 5000 });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('creates budget and returns it on success', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // event
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce(BUDGET); // re-fetch
    const req = makeReq({ eventId: '10' }, { total_budget: 5000, currency: 'USD' });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { budget: typeof BUDGET }).budget).toEqual(BUDGET);
  });

  it('defaults currency to USD when not provided', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce(BUDGET);
    const req = makeReq({ eventId: '10' }, { total_budget: 3000 });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    expect(values[2]).toBe('USD');
  });

  it('uses ON CONFLICT DO UPDATE (upsert pattern)', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce(BUDGET);
    const req = makeReq({ eventId: '10' }, { total_budget: 9000 });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('DO UPDATE');
  });

  it('accepts zero as a valid budget', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...BUDGET, total_budget: 0 });
    const req = makeReq({ eventId: '10' }, { total_budget: 0 });
    const res = makeRes();
    await budgetsController.upsertBudget(req, res as never);
    expect(res.statusCode).toBe(200);
  });
});
