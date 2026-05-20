/**
 * BRD v2 — event custom fields controller tests (#541, #577).
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

// Bypass event access check — return a stub event.
vi.mock('../src/utils/event-access.js', () => ({
  requireEventAccess: async () => ({ id: 1, created_by: 7, deleted_at: null }),
}));

import {
  createField,
  deleteField,
  listFields,
  updateField,
} from '../src/controllers/event-custom-fields-controller.js';

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

describe('event custom fields controller', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn() };
  });

  it('lists fields for an event', async () => {
    const rows = [
      { id: 1, event_id: 1, field_key: 'theme', label: 'Theme', field_type: 'text', value: 'Retro', required: false, sort_order: 0, options: null, created_at: '', updated_at: '' },
    ];
    mockDb.all.mockResolvedValueOnce(rows);
    const req = makeReq({ eventId: '1' });
    const res = makeRes();
    await listFields(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ fields: rows });
  });

  it('rejects invalid field_key format', async () => {
    const req = makeReq(
      { eventId: '1' },
      { field_key: 'BadKey!', label: 'Theme', field_type: 'text' },
    );
    const res = makeRes();
    await createField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/field_key/) });
  });

  it('rejects unsupported field_type', async () => {
    const req = makeReq(
      { eventId: '1' },
      { field_key: 'theme', label: 'Theme', field_type: 'rich_text' },
    );
    const res = makeRes();
    await createField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('rejects select without options', async () => {
    const req = makeReq(
      { eventId: '1' },
      { field_key: 'tier', label: 'Tier', field_type: 'select' },
    );
    const res = makeRes();
    await createField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/options array/) });
  });

  it('creates a text field with initial value', async () => {
    mockDb.get
      .mockResolvedValueOnce(undefined) // dup check
      .mockResolvedValueOnce({
        id: 99,
        event_id: 1,
        field_key: 'theme',
        label: 'Theme',
        field_type: 'text',
        options: null,
        value: 'Retro',
        required: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      });
    mockDb.run.mockResolvedValueOnce({ lastID: 99, changes: 1 });

    const req = makeReq(
      { eventId: '1' },
      { field_key: 'theme', label: 'Theme', field_type: 'text', value: 'Retro' },
    );
    const res = makeRes();
    await createField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 99, value: 'Retro' });
  });

  it('rejects URL value with non-http scheme', async () => {
    mockDb.get.mockResolvedValueOnce(undefined);
    const req = makeReq(
      { eventId: '1' },
      {
        field_key: 'website',
        label: 'Website',
        field_type: 'url',
        value: 'javascript:alert(1)',
      },
    );
    const res = makeRes();
    await createField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(400);
  });

  it('updates value with type coercion', async () => {
    mockDb.get
      .mockResolvedValueOnce({
        id: 99,
        event_id: 1,
        field_key: 'guests',
        label: 'Guests',
        field_type: 'number',
        options: null,
        value: '12',
        required: false,
        sort_order: 0,
      })
      .mockResolvedValueOnce({
        id: 99,
        event_id: 1,
        field_key: 'guests',
        label: 'Guests',
        field_type: 'number',
        value: '24',
        required: false,
        sort_order: 0,
      });

    const req = makeReq({ eventId: '1', fieldId: '99' }, { value: '24' });
    const res = makeRes();
    await updateField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ value: '24' });
  });

  it('deletes a field', async () => {
    mockDb.get.mockResolvedValueOnce({ id: 99 });
    const req = makeReq({ eventId: '1', fieldId: '99' });
    const res = makeRes();
    await deleteField(req, res as unknown as import('express').Response);
    expect(res.statusCode).toBe(200);
    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM event_custom_fields WHERE id = ? AND event_id = ?',
      ['99', '1'],
    );
  });
});
