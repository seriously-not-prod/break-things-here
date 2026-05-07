/**
 * Clone event controller tests — BRD 3.2.1
 *
 * Covers:
 * - Cloning creates a new event with status Draft and title "Copy of X"
 * - Original event remains unchanged
 * - Optional task cloning when includeTasks=true
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

import { cloneEvent } from '../src/controllers/event-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

function makeReq(
  params: Record<string, string>,
  query: Record<string, string> = {},
  user = { id: 7, email: 'owner@test.com', role_id: 2 },
) {
  return { params, query, body: {}, user, ip: '127.0.0.1' } as unknown as import('express').Request;
}

describe('cloneEvent', () => {
  beforeEach(() => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
  });

  it('creates a new draft event while leaving the original unchanged', async () => {
    const sourceEvent: Row = {
      id: 12,
      title: 'Festival Launch',
      date: '2026-08-10',
      location: 'Main Square',
      description: 'Original description',
      capacity: 250,
      status: 'Active',
      cover_image_url: '/img/original.jpg',
      event_type: 'Concert',
      is_public: true,
      rsvp_deadline: null,
      tags: 'music,summer',
      created_by: 7,
    };
    const clonedEvent: Row = {
      ...sourceEvent,
      id: 44,
      title: 'Copy of Festival Launch',
      status: 'Draft',
      created_by: 7,
    };

    mockDb.get
      .mockResolvedValueOnce(sourceEvent)
      .mockResolvedValueOnce(clonedEvent);
    mockDb.run
      .mockResolvedValueOnce({ lastID: 44, changes: 1 })
      .mockResolvedValueOnce({ lastID: undefined, changes: 1 });

    const req = makeReq({ id: '12' });
    const res = makeRes();

    await cloneEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(clonedEvent);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO events'),
      [
        'Copy of Festival Launch',
        '2026-08-10',
        'Main Square',
        'Original description',
        250,
        '/img/original.jpg',
        'Concert',
        true,
        null,
        'music,summer',
        7,
      ],
    );
    expect(sourceEvent['title']).toBe('Festival Launch');
    expect(sourceEvent['status']).toBe('Active');
  });

  it('copies tasks when includeTasks=true', async () => {
    const sourceEvent: Row = {
      id: 12,
      title: 'Festival Launch',
      date: '2026-08-10',
      location: 'Main Square',
      description: 'Original description',
      capacity: 250,
      status: 'Active',
      cover_image_url: '/img/original.jpg',
      event_type: 'Concert',
      is_public: true,
      rsvp_deadline: null,
      tags: 'music,summer',
      created_by: 7,
    };
    const taskRow: Row = {
      id: 90,
      title: 'Book vendors',
      notes: 'Need food and drink stands',
      assignee_name: 'Owner',
      due_date: '2026-08-01',
      status: 'Pending',
      priority: 'High',
    };
    const clonedEvent: Row = {
      ...sourceEvent,
      id: 45,
      title: 'Copy of Festival Launch',
      status: 'Draft',
      created_by: 7,
    };

    mockDb.get
      .mockResolvedValueOnce(sourceEvent)
      .mockResolvedValueOnce(clonedEvent);
    mockDb.all.mockResolvedValueOnce([taskRow]);
    mockDb.run
      .mockResolvedValueOnce({ lastID: 45, changes: 1 })
      .mockResolvedValueOnce({ lastID: undefined, changes: 1 })
      .mockResolvedValueOnce({ lastID: undefined, changes: 1 });

    const req = makeReq({ id: '12' }, { includeTasks: 'true' });
    const res = makeRes();

    await cloneEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(201);
    expect(mockDb.all).toHaveBeenCalledWith('SELECT * FROM tasks WHERE event_id = ?', ['12']);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tasks'),
      [
        45,
        'Book vendors',
        'Need food and drink stands',
        'Owner',
        '2026-08-01',
        'Pending',
        'High',
        7,
      ],
    );
  });

  it('returns 404 when the source event does not exist', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);

    const req = makeReq({ id: '9999' });
    const res = makeRes();

    await cloneEvent(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Event not found' });
  });
});
