/**
 * Venues API controller tests — issue #232
 *
 * Tests CRUD operations for venues endpoints.
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

import * as venuesController from '../src/controllers/venues-controller.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VENUE = {
  id: 1,
  event_id: 10,
  name: 'Grand Hall',
  address: '123 Main St',
  city: 'Springfield',
  capacity: 500,
  contact_name: 'Alice',
  contact_email: 'alice@example.com',
  contact_phone: '555-1234',
  status: 'Confirmed',
  notes: 'Parking available',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------

describe('listVenues', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with venues array', async () => {
    mockDb.all.mockResolvedValue([VENUE]);
    const req = makeReq({ eventId: '10' });
    const res = makeRes();
    await venuesController.listVenues(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ venues: [VENUE] });
  });

  it('returns empty array when no venues exist', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ eventId: '99' });
    const res = makeRes();
    await venuesController.listVenues(req, res as never);
    expect(res.body).toEqual({ venues: [] });
  });

  it('queries with correct eventId', async () => {
    mockDb.all.mockResolvedValue([]);
    const req = makeReq({ eventId: '42' });
    const res = makeRes();
    await venuesController.listVenues(req, res as never);
    expect(mockDb.all).toHaveBeenCalledWith(
      expect.stringContaining('event_id'),
      ['42'],
    );
  });
});

// ---------------------------------------------------------------------------

describe('createVenue', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when name is missing', async () => {
    const req = makeReq({ eventId: '10' }, {});
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/name is required/i);
  });

  it('returns 400 when name is blank', async () => {
    const req = makeReq({ eventId: '10' }, { name: '   ' });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when event not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '999' }, { name: 'Ballroom' });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/event not found/i);
  });

  it('returns 201 with created venue on success', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 }); // event exists
    mockDb.run.mockResolvedValueOnce({ lastID: 1 });
    mockDb.get.mockResolvedValueOnce(VENUE); // re-fetch
    const req = makeReq({ eventId: '10' }, {
      name: 'Grand Hall',
      address: '123 Main St',
      city: 'Springfield',
      capacity: 500,
      status: 'Confirmed',
    });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    expect(res.statusCode).toBe(201);
    expect((res.body as { venue: typeof VENUE }).venue).toEqual(VENUE);
  });

  it('defaults status to Tentative when not provided', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 1 });
    mockDb.get.mockResolvedValueOnce({ ...VENUE, status: 'Tentative' });
    const req = makeReq({ eventId: '10' }, { name: 'Back Room' });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    // status is at index 8: [eventId, name, address, city, capacity, contact_name, contact_email, contact_phone, status, notes]
    expect(values[8]).toBe('Tentative');
  });

  it('trims whitespace from name', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 2 });
    mockDb.get.mockResolvedValueOnce({ ...VENUE, name: 'Ballroom' });
    const req = makeReq({ eventId: '10' }, { name: '  Ballroom  ' });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    expect(values[1]).toBe('Ballroom');
  });

  it('lowercases contact_email', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 10 });
    mockDb.run.mockResolvedValueOnce({ lastID: 3 });
    mockDb.get.mockResolvedValueOnce(VENUE);
    const req = makeReq({ eventId: '10' }, { name: 'Hall', contact_email: 'ALICE@Example.com' });
    const res = makeRes();
    await venuesController.createVenue(req, res as never);
    const runCall = mockDb.run.mock.calls[0];
    const values = runCall[1] as unknown[];
    expect(values[6]).toBe('alice@example.com');
  });
});

// ---------------------------------------------------------------------------

describe('updateVenue', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when venue not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' }, { status: 'Confirmed' });
    const res = makeRes();
    await venuesController.updateVenue(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    mockDb.get.mockResolvedValueOnce(VENUE);
    const req = makeReq({ eventId: '10', id: '1' }, {});
    const res = makeRes();
    await venuesController.updateVenue(req, res as never);
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/no fields/i);
  });

  it('updates a single field and returns updated venue', async () => {
    mockDb.get.mockResolvedValueOnce(VENUE);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...VENUE, status: 'Confirmed' });
    const req = makeReq({ eventId: '10', id: '1' }, { status: 'Confirmed' });
    const res = makeRes();
    await venuesController.updateVenue(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { venue: { status: string } }).venue.status).toBe('Confirmed');
  });

  it('updates multiple fields', async () => {
    mockDb.get.mockResolvedValueOnce(VENUE);
    mockDb.run.mockResolvedValueOnce({});
    mockDb.get.mockResolvedValueOnce({ ...VENUE, name: 'New Hall', capacity: 200 });
    const req = makeReq({ eventId: '10', id: '1' }, { name: 'New Hall', capacity: 200 });
    const res = makeRes();
    await venuesController.updateVenue(req, res as never);
    const sql = mockDb.run.mock.calls[0][0] as string;
    expect(sql).toContain('name = ');
    expect(sql).toContain('capacity = ');
    expect(sql).toContain('updated_at = CURRENT_TIMESTAMP');
  });
});

// ---------------------------------------------------------------------------

describe('deleteVenue', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 404 when venue not found', async () => {
    mockDb.get.mockResolvedValueOnce(null);
    const req = makeReq({ eventId: '10', id: '999' });
    const res = makeRes();
    await venuesController.deleteVenue(req, res as never);
    expect(res.statusCode).toBe(404);
  });

  it('deletes venue and returns success message', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 1 });
    mockDb.run.mockResolvedValueOnce({});
    const req = makeReq({ eventId: '10', id: '1' });
    const res = makeRes();
    await venuesController.deleteVenue(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { message: string }).message).toMatch(/deleted/i);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM venues'),
      ['1'],
    );
  });
});
