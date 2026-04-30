/**
 * Vendors API controller tests — issue #233
 *
 * Tests CRUD operations for vendors endpoints.
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
    send(data?: unknown) { this.body = data ?? null; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string> = {},
  body: Record<string, unknown> = {},
  user?: { id: number; email: string; role_id: number },
) {
  return { params, body, user } as unknown as import('express').Request;
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

import * as vendorsController from '../src/controllers/vendors-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VENDOR = {
  id: 1,
  event_id: 10,
  name: 'Catering Co.',
  category: 'Catering',
  contact_name: 'Bob',
  contact_email: 'bob@catering.co',
  contact_phone: '555-9876',
  cost: 2000.00,
  status: 'Confirmed',
  notes: 'Vegetarian options available',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('listVendors', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with vendors array', async () => {
    mockDb.all.mockResolvedValue([VENDOR]);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await vendorsController.listVendors(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ vendors: [VENDOR] });
  });

  it('returns empty array when no vendors exist', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ eventId: '99' });
    const res = makeRes();
    await vendorsController.listVendors(req, res as never);
    expect(res.body).toEqual({ vendors: [] });
  });

  it('queries with correct eventId', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ eventId: '42' });
    const res = makeRes();
    await vendorsController.listVendors(req, res as never);
    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining('event_id'),
      ['42'],
    );
  });
});

// ---------------------------------------------------------------------------

describe('createVendor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when name is missing', async () => {
    const req = makeReq({ eventId: '10' }, {});
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/name is required/i);
  });

  it('returns 400 when name is blank', async () => {
    const req = makeReq({ eventId: '10' }, { name: '   ' });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '999' }, { name: 'DJ Services' });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/event not found/i);
  });

  it('returns 201 with created vendor on success', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // event exists
    mockDb.run.mockResolvedValueOnce({ lastID: 1 });
    mockDb.get.mockResolvedValueOnce(VENDOR); // re-fetch
    const req = makeReq({ eventId: '10' }, {
      name: 'Catering Co.',
      category: 'Catering',
      cost: 2000,
      status: 'Confirmed',
    });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    expect(res.statusCode).toBe(201);
    expect((res.body as { vendor: typeof VENDOR }).vendor).toEqual(VENDOR);
  });

  it('defaults status to Pending when not provided', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 2 });
    mockDb.get.mockResolvedValueOnce({ ...VENDOR, status: 'Pending' });
    const req = makeReq({ eventId: '10' }, { name: 'Sound System Rentals' });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    // status is the 8th value (index 7)
    expect(values[7]).toBe('Pending');
  });

  it('trims whitespace from name', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 3 });
    mockDb.get.mockResolvedValueOnce(VENDOR);
    const req = makeReq({ eventId: '10' }, { name: '  DJ Max  ' });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    expect(values[1]).toBe('DJ Max');
  });

  it('lowercases contact_email', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 4 });
    mockDb.get.mockResolvedValueOnce(VENDOR);
    const req = makeReq({ eventId: '10' }, { name: 'DJ', contact_email: 'BOB@CATERING.CO' });
    const res = makeRes();
    await vendorsController.createVendor(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    expect(values[4]).toBe('bob@catering.co');
  });
});

// ---------------------------------------------------------------------------

describe('updateVendor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when vendor not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' }, { status: 'Confirmed' });
    const res = makeRes();
    await vendorsController.updateVendor(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    mockDb.get.mockResolvedValueOnce(VENDOR);
    const req = makeReq({ eventId: '10', id: '1' }, {});
    const res = makeRes();
    await vendorsController.updateVendor(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/no fields/i);
  });

  it('updates a single field and returns updated vendor', async () => {
    mockDb.get.mockResolvedValueOnce(VENDOR);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...VENDOR, status: 'Confirmed' });
    const req = makeReq({ eventId: '10', id: '1' }, { status: 'Confirmed' });
    const res = makeRes();
    await vendorsController.updateVendor(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { vendor: { status: string } }).vendor.status).toBe('Confirmed');
  });

  it('updates multiple fields', async () => {
    mockDb.get.mockResolvedValueOnce(VENDOR);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...VENDOR, name: 'New DJ', cost: 1500 });
    const req = makeReq({ eventId: '10', id: '1' }, { name: 'New DJ', cost: 1500 });
    const res = makeRes();
    await vendorsController.updateVendor(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('name = ');
    expect(sql).toContain('cost = ');
  });

  it('includes updated_at in UPDATE query', async () => {
    mockDb.get.mockResolvedValueOnce(VENDOR);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce(VENDOR);
    const req = makeReq({ eventId: '10', id: '1' }, { notes: 'Updated notes' });
    const res = makeRes();
    await vendorsController.updateVendor(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).not.toContain('updated_at');
  });
});

// ---------------------------------------------------------------------------

describe('deleteVendor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when vendor not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' });
    const res = makeRes();
    await vendorsController.deleteVendor(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('deletes vendor and returns success message', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    mockDb.run.mockResolvedValueOnce({});
    const req = makeReq({ eventId: '10', id: '1' });
    const res = makeRes();
    await vendorsController.deleteVendor(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/deleted/i);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM vendors'),
      ['1'],
    );
  });
});
