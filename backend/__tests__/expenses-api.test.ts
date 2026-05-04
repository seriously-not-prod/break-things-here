/**
 * Expenses controller tests — issue #234 / #235
 *
 * Tests CRUD for /api/events/:eventId/expenses.
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

import * as expensesController from '../src/controllers/expenses-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const EXPENSE = {
  id: 1,
  event_id: 10,
  category_id: 2,
  title: 'Catering deposit',
  amount: 1500.00,
  paid_by: 'Alice',
  receipt_url: null,
  status: 'Pending',
  notes: null,
  category_name: 'Catering',
  category_color: '#6366f1',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('listExpenses', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with expenses array', async () => {
    mockDb.all.mockResolvedValue([EXPENSE]);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await expensesController.listExpenses(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ expenses: [EXPENSE] });
  });

  it('returns empty array when no expenses', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ eventId: '99' });
    const res = makeRes();
    await expensesController.listExpenses(req, res as never);
    expect(res.body).toEqual({ expenses: [] });
  });

  it('joins category name and color', async () => {
    mockDb.all.mockResolvedValue([EXPENSE]);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await expensesController.listExpenses(req, res as never);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('LEFT JOIN expense_categories');
  });
});

// ---------------------------------------------------------------------------

describe('createExpense', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when title is missing', async () => {
    const req = makeReq({ eventId: '10' }, { amount: 100 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/title is required/i);
  });

  it('returns 400 when amount is missing', async () => {
    const req = makeReq({ eventId: '10' }, { title: 'DJ fee' });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/amount is required/i);
  });

  it('returns 400 when amount is negative', async () => {
    const req = makeReq({ eventId: '10' }, { title: 'DJ fee', amount: -50 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/non-negative/i);
  });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '999' }, { title: 'DJ fee', amount: 500 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when category_id does not exist', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // event exists
    mockDb.get.mockResolvedValueOnce(null);         // category not found
    const req = makeReq({ eventId: '10' }, { title: 'DJ fee', amount: 500, category_id: 999 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/category not found/i);
  });

  it('returns 201 with created expense on success', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });  // event
    mockDb.get.mockResolvedValueOnce({ id: 2 });   // category
    mockDb.run.mockResolvedValueOnce({ lastID: 1 });
    mockDb.get.mockResolvedValueOnce(EXPENSE);     // re-fetch
    const req = makeReq({ eventId: '10' }, { title: 'Catering deposit', amount: 1500, category_id: 2 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(201);
    expect((res.body as { expense: typeof EXPENSE }).expense).toEqual(EXPENSE);
  });

  it('defaults status to Pending when not provided', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 2 });
    mockDb.get.mockResolvedValueOnce(EXPENSE);
    const req = makeReq({ eventId: '10' }, { title: 'Tables', amount: 200 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    const values = mockDb.run.mock.calls[0][1] as unknown[];
    // status is at index 6: [eventId, category_id, title, amount, paid_by, receipt_url, status, notes]
    expect(values[6]).toBe('Pending');
  });

  it('accepts zero amount', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 3 });
    mockDb.get.mockResolvedValueOnce({ ...EXPENSE, amount: 0 });
    const req = makeReq({ eventId: '10' }, { title: 'Free item', amount: 0 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    expect(res.statusCode).toBe(201);
  });

  it('trims title whitespace', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 4 });
    mockDb.get.mockResolvedValueOnce(EXPENSE);
    const req = makeReq({ eventId: '10' }, { title: '  Sound check  ', amount: 300 });
    const res = makeRes();
    await expensesController.createExpense(req, res as never);
    const values = mockDb.run.mock.calls[0][1] as unknown[];
    expect(values[2]).toBe('Sound check');
  });
});

// ---------------------------------------------------------------------------

describe('updateExpense', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when expense not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' }, { status: 'Approved' });
    const res = makeRes();
    await expensesController.updateExpense(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    mockDb.get.mockResolvedValueOnce(EXPENSE);          // expense found
    mockDb.get.mockResolvedValueOnce({ id: 10, created_by: 1 }); // event found
    const req = makeReq({ eventId: '10', id: '1' }, {});
    const res = makeRes();
    await expensesController.updateExpense(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/no fields/i);
  });

  it('updates status field', async () => {
    mockDb.get.mockResolvedValueOnce(EXPENSE);          // expense found
    mockDb.get.mockResolvedValueOnce({ id: 10, created_by: 1 }); // event found
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...EXPENSE, status: 'Approved' });
    const req = makeReq({ eventId: '10', id: '1' }, { status: 'Approved' });
    const res = makeRes();
    await expensesController.updateExpense(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { expense: { status: string } }).expense.status).toBe('Approved');
  });

  it('updates amount and includes updated_at', async () => {
    mockDb.get.mockResolvedValueOnce(EXPENSE);          // expense found
    mockDb.get.mockResolvedValueOnce({ id: 10, created_by: 1 }); // event found
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...EXPENSE, amount: 2000 });
    const req = makeReq({ eventId: '10', id: '1' }, { amount: 2000 });
    const res = makeRes();
    await expensesController.updateExpense(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('amount = ');
    expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
  });

  it('returns updated expense with category join', async () => {
    mockDb.get.mockResolvedValueOnce(EXPENSE);          // expense found
    mockDb.get.mockResolvedValueOnce({ id: 10, created_by: 1 }); // event found
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...EXPENSE, notes: 'Paid in full' }); // re-fetch
    const req = makeReq({ eventId: '10', id: '1' }, { notes: 'Paid in full' });
    const res = makeRes();
    await expensesController.updateExpense(req, res as never);
    // calls[2] is the re-fetch (calls[0]=expense, calls[1]=event, calls[2]=re-fetch)
    const fetchSql = mockDb.get.mock.calls[2][0] as string;
    expect(fetchSql).toContain('LEFT JOIN expense_categories');
  });
});

// ---------------------------------------------------------------------------

describe('deleteExpense', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when expense not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' });
    const res = makeRes();
    await expensesController.deleteExpense(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('deletes expense and returns success message', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1 });              // expense found
    mockDb.get.mockResolvedValueOnce({ id: 10, created_by: 1 }); // event found
    mockDb.run.mockResolvedValueOnce({});
    const req = makeReq({ eventId: '10', id: '1' });
    const res = makeRes();
    await expensesController.deleteExpense(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/deleted/i);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM expenses'),
      ['1', '10'],
    );
  });
});
