/**
 * RSVP import template endpoint tests — Story #664, Item 12
 *
 * Verifies the downloadable CSV template endpoint returns:
 * - a CSV attachment response
 * - the expected import header columns
 * - a stable filename for the download
 */

import { describe, expect, it, vi } from 'vitest';

type MockDb = {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
};

let mockDb: MockDb;

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));

vi.mock('../src/utils/event-access', () => ({
  requireEventAccess: vi.fn().mockResolvedValue({ id: 1, created_by: 1 }),
}));

import { exportRsvpsImportTemplateCsv } from '../src/controllers/rsvps-controller.js';

function makeRes() {
  const res: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    status: (code: number) => typeof res;
    json: (data: unknown) => typeof res;
    setHeader: (name: string, value: string) => void;
    send: (data: unknown) => typeof res;
  } = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

describe('exportRsvpsImportTemplateCsv', () => {
  it('returns a CSV attachment with importable guest headers', async () => {
    mockDb = {
      get: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };

    const req = {
      params: { eventId: '123' },
      query: {},
      body: {},
      user: { id: 1, email: 'organizer@test.com', role_id: 2 },
    } as unknown as import('express').Request;
    const res = makeRes();

    await exportRsvpsImportTemplateCsv(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toContain('text/csv');
    expect(res.headers['Content-Disposition']).toContain('event-123-rsvp-import-template.csv');
    expect(String(res.body)).toBe(
      'name,email,phone,guests,status,notes,dietary_restriction,accessibility_needs,plus_one,plus_one_name,guest_group,company,title,relation_type,age_group,address_line1,address_line2,city,state_region,postal_code,country,emergency_contact_name,emergency_contact_phone,meal_choice\n',
    );
  });
});
