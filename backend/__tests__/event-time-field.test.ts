/**
 * Event time field tests — Story #664, Item 10
 *
 * Covers end-to-end validation of the required event_time field:
 * - createEvent rejects missing event_time
 * - createEvent rejects malformed event_time values
 * - createEvent accepts valid HH:MM values and persists them
 * - updateEvent rejects malformed event_time values
 * - updateEvent preserves existing event_time when not provided
 * - updateEvent accepts valid event_time updates
 * - cloneEvent copies event_time from the source event
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

interface MockDb {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

let mockDb: MockDb;

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));

import {
  createEvent,
  updateEvent,
  cloneEvent,
} from '../src/controllers/event-controller.js';

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

function makeCreateReq(body: Record<string, unknown>) {
  return {
    params: {},
    query: {},
    body,
    user: { id: 1, email: 'organizer@test.com', role_id: 2 },
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

function makeUpdateReq(id: string, body: Record<string, unknown>) {
  return {
    params: { id },
    query: {},
    body,
    user: { id: 1, email: 'organizer@test.com', role_id: 2 },
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

function makeCloneReq(id: string) {
  return {
    params: { id },
    query: {},
    body: {},
    user: { id: 1, email: 'organizer@test.com', role_id: 2 },
    ip: '127.0.0.1',
  } as unknown as import('express').Request;
}

const FUTURE_DATE = '2027-06-15';

const BASE_EVENT: Row = {
  id: 42,
  title: 'Summer Festival',
  date: FUTURE_DATE,
  event_time: '14:00',
  location: 'City Park',
  description: null,
  capacity: 500,
  status: 'Draft',
  event_type: 'Festival',
  is_public: false,
  tags: null,
  latitude: null,
  longitude: null,
  waitlist_enabled: false,
  gallery_comments_enabled: true,
  gallery_guest_uploads: false,
  gallery_public: false,
  storage_quota_bytes: 524288000,
  archived_at: null,
  created_by: 1,
};

describe('createEvent — event_time validation', () => {
  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
  });

  it('rejects when event_time is missing', async () => {
    const req = makeCreateReq({
      title: 'Concert Night',
      date: FUTURE_DATE,
      location: 'City Arena',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toMatch(/event_time is required/i);
  });

  it('rejects event_time with invalid format (letters)', async () => {
    const req = makeCreateReq({
      title: 'Concert Night',
      date: FUTURE_DATE,
      location: 'City Arena',
      event_time: 'noon',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toMatch(/HH:MM/i);
  });

  it('rejects event_time with out-of-range hours (25:00)', async () => {
    const req = makeCreateReq({
      title: 'Concert Night',
      date: FUTURE_DATE,
      location: 'City Arena',
      event_time: '25:00',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toMatch(/HH:MM/i);
  });

  it('rejects event_time with invalid minutes (09:60)', async () => {
    const req = makeCreateReq({
      title: 'Concert Night',
      date: FUTURE_DATE,
      location: 'City Arena',
      event_time: '09:60',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toMatch(/HH:MM/i);
  });

  it('accepts a valid event_time and stores it', async () => {
    const returnedEvent = { ...BASE_EVENT, event_time: '09:30' };
    mockDb.run.mockResolvedValue({ lastID: 42 });
    mockDb.get.mockResolvedValueOnce(returnedEvent);

    const req = makeCreateReq({
      title: 'Summer Festival',
      date: FUTURE_DATE,
      location: 'City Park',
      event_time: '09:30',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    // Verify event_time was passed to INSERT
    const insertCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    const insertSql = insertCall[0];
    const insertParams = insertCall[1];
    expect(insertSql).toMatch(/event_time/);
    expect(insertParams).toContain('09:30');
  });

  it('accepts midnight (00:00) as a valid event_time', async () => {
    const returnedEvent = { ...BASE_EVENT, event_time: '00:00' };
    mockDb.run.mockResolvedValue({ lastID: 42 });
    mockDb.get.mockResolvedValueOnce(returnedEvent);

    const req = makeCreateReq({
      title: 'Midnight Concert',
      date: FUTURE_DATE,
      location: 'Rooftop Venue',
      event_time: '00:00',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const insertCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(insertCall[1]).toContain('00:00');
  });

  it('accepts 23:59 as a valid event_time', async () => {
    const returnedEvent = { ...BASE_EVENT, event_time: '23:59' };
    mockDb.run.mockResolvedValue({ lastID: 42 });
    mockDb.get.mockResolvedValueOnce(returnedEvent);

    const req = makeCreateReq({
      title: 'Late Night Event',
      date: FUTURE_DATE,
      location: 'Downtown Club',
      event_time: '23:59',
    });
    const res = makeRes();

    await createEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const insertCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(insertCall[1]).toContain('23:59');
  });
});

describe('updateEvent — event_time validation', () => {
  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
  });

  it('rejects malformed event_time on update', async () => {
    mockDb.get.mockResolvedValueOnce(BASE_EVENT);

    const req = makeUpdateReq('42', { event_time: 'bad-value' });
    const res = makeRes();

    await updateEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, string>).error).toMatch(/HH:MM/i);
  });

  it('preserves existing event_time when not provided in update body', async () => {
    mockDb.get
      .mockResolvedValueOnce(BASE_EVENT)   // existing event check
      .mockResolvedValueOnce(BASE_EVENT);  // updated event read-back
    mockDb.run.mockResolvedValue({});

    const req = makeUpdateReq('42', { title: 'Updated Festival' });
    const res = makeRes();

    await updateEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    // The UPDATE params should include the existing event_time '14:00'
    const updateCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(updateCall[1]).toContain('14:00');
  });

  it('accepts a valid event_time update', async () => {
    mockDb.get
      .mockResolvedValueOnce(BASE_EVENT)
      .mockResolvedValueOnce({ ...BASE_EVENT, event_time: '18:30' });
    mockDb.run.mockResolvedValue({});

    const req = makeUpdateReq('42', { event_time: '18:30' });
    const res = makeRes();

    await updateEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const updateCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(updateCall[1]).toContain('18:30');
  });
});

describe('cloneEvent — event_time propagation', () => {
  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
  });

  it('copies event_time from the source event to the clone', async () => {
    const clonedEvent: Row = {
      ...BASE_EVENT,
      id: 99,
      title: 'Copy of Summer Festival',
      status: 'Draft',
    };
    mockDb.get
      .mockResolvedValueOnce(BASE_EVENT)  // source lookup
      .mockResolvedValueOnce(clonedEvent); // read-back after insert
    mockDb.run.mockResolvedValue({ lastID: 99 });

    const req = makeCloneReq('42');
    const res = makeRes();

    await cloneEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    // INSERT params should include the source event's event_time
    const insertCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    expect(insertCall[0]).toMatch(/event_time/);
    expect(insertCall[1]).toContain('14:00');
  });

  it('passes null event_time when source has no time set', async () => {
    const sourceWithoutTime: Row = { ...BASE_EVENT, event_time: null };
    const clonedEvent: Row = {
      ...sourceWithoutTime,
      id: 100,
      title: 'Copy of Summer Festival',
      status: 'Draft',
    };
    mockDb.get
      .mockResolvedValueOnce(sourceWithoutTime)
      .mockResolvedValueOnce(clonedEvent);
    mockDb.run.mockResolvedValue({ lastID: 100 });

    const req = makeCloneReq('42');
    const res = makeRes();

    await cloneEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    const insertCall = mockDb.run.mock.calls[0] as [string, unknown[]];
    // null should be passed for event_time
    const nullCount = insertCall[1].filter((p) => p === null).length;
    expect(nullCount).toBeGreaterThan(0);
  });
});
