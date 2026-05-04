/**
 * Expense categories controller tests — issue #235
 *
 * Tests CRUD for /api/expense-categories.
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
  return { params, body } as unknown as import('express').Request;
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

import * as categoriesController from '../src/controllers/expense-categories-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CATEGORY = {
  id: 1,
  name: 'Catering',
  description: 'Food and beverage expenses',
  color: '#6366f1',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('listCategories', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with categories array', async () => {
    mockDb.all.mockResolvedValue([CATEGORY]);
    const req = makeReq();
    const res = makeRes();
    await categoriesController.listCategories(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ categories: [CATEGORY] });
  });

  it('returns empty array when no categories', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await categoriesController.listCategories(req, res as never);
    expect(res.body).toEqual({ categories: [] });
  });

  it('orders by name ascending', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    await categoriesController.listCategories(req, res as never);
    const sql = mockDb.all.mock.calls[0][0] as string;
    expect(sql).toContain('ORDER BY name ASC');
  });
});

// ---------------------------------------------------------------------------

describe('createCategory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when name is missing', async () => {
    const req = makeReq({}, {});
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/name is required/i);
  });

  it('returns 400 when name is blank', async () => {
    const req = makeReq({}, { name: '   ' });
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when name already exists', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1 }); // existing
    const req = makeReq({}, { name: 'Catering' });
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    expect(res.statusCode).toBe(409);
    expect((res.body as { error: string }).error).toMatch(/already exists/i);
  });

  it('returns 201 with created category on success', async () => {
    mockDb.get.mockResolvedValueOnce(null);          // no duplicate
    mockDb.run.mockResolvedValueOnce({ lastID: 1 });
    mockDb.get.mockResolvedValueOnce(CATEGORY);      // re-fetch
    const req = makeReq({}, { name: 'Catering', description: 'Food', color: '#6366f1' });
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    expect(res.statusCode).toBe(201);
    expect((res.body as { category: typeof CATEGORY }).category).toEqual(CATEGORY);
  });

  it('defaults color to #6366f1 when not provided', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockDb.run.mockResolvedValueOnce({ lastID: 2 });
    mockDb.get.mockResolvedValueOnce(CATEGORY);
    const req = makeReq({}, { name: 'Transport' });
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    const values = mockDb.run.mock.calls[0][1] as unknown[];
    expect(values[2]).toBe('#6366f1');
  });

  it('trims name whitespace', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    mockDb.run.mockResolvedValueOnce({ lastID: 3 });
    mockDb.get.mockResolvedValueOnce(CATEGORY);
    const req = makeReq({}, { name: '  AV Equipment  ' });
    const res = makeRes();
    await categoriesController.createCategory(req, res as never);
    const values = mockDb.run.mock.calls[0][1] as unknown[];
    expect(values[0]).toBe('AV Equipment');
  });
});

// ---------------------------------------------------------------------------

describe('updateCategory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when category not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ id: '999' }, { name: 'New Name' });
    const res = makeRes();
    await categoriesController.updateCategory(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    mockDb.get.mockResolvedValueOnce(CATEGORY);
    const req = makeReq({ id: '1' }, {});
    const res = makeRes();
    await categoriesController.updateCategory(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/no fields/i);
  });

  it('updates name and returns updated category', async () => {
    mockDb.get.mockResolvedValueOnce(CATEGORY);              // category found
    mockDb.get.mockResolvedValueOnce(null);                  // duplicate check: no duplicate
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...CATEGORY, name: 'Décor' });
    const req = makeReq({ id: '1' }, { name: 'Décor' });
    const res = makeRes();
    await categoriesController.updateCategory(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { category: { name: string } }).category.name).toBe('Décor');
  });

  it('updates color field', async () => {
    mockDb.get.mockResolvedValueOnce(CATEGORY);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...CATEGORY, color: '#ff5733' });
    const req = makeReq({ id: '1' }, { color: '#ff5733' });
    const res = makeRes();
    await categoriesController.updateCategory(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('color = ?');
    expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
  });
});

// ---------------------------------------------------------------------------

describe('deleteCategory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when category not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ id: '999' });
    const res = makeRes();
    await categoriesController.deleteCategory(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('deletes category and returns success message', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    mockDb.run.mockResolvedValueOnce({});
    const req = makeReq({ id: '1' });
    const res = makeRes();
    await categoriesController.deleteCategory(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/deleted/i);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM expense_categories'),
      ['1'],
    );
  });
});
