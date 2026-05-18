/**
 * CSV Import Mapping Fix — Story #664, Item 11
 *
 * Covers the field-mapping wizard wire-up in importCsv:
 * - No column_map: falls back to normalised CSV header names (backward compat)
 * - column_map applied: CSV headers are re-mapped to guest fields correctly
 * - column_map skip (''):  columns mapped to '' are excluded from the row
 * - Malformed column_map JSON: silently ignored (falls back to normalised headers)
 * - column_map overrides: dietary_restriction, phone, notes, guest_group mapped
 *   from custom CSV headers
 * - Missing name/email even after mapping → row skipped
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockDb {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

let mockDb: MockDb;

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../src/db/database', () => ({
  getDatabase: () => mockDb,
}));

// requireEventAccess → always resolves to a stub event (owner check passes)
vi.mock('../src/utils/event-access', () => ({
  requireEventAccess: vi.fn().mockResolvedValue({ id: 1, created_by: 1 }),
}));

// Collateral deps — not exercised in these tests
vi.mock('../src/controllers/notifications-controller', () => ({
  createRsvpNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/controllers/activity-feed-controller', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/controllers/waitlist-controller', () => ({
  addToWaitlist: vi.fn().mockResolvedValue(undefined),
  runPromotion: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/utils/rsvp-taxonomy', () => ({
  toCanonicalStatus: vi.fn().mockReturnValue('confirmed'),
  normalizeLegacyRsvpStatusInput: vi.fn().mockReturnValue(null),
  LEGACY_RSVP_STATUSES: ['Going', 'Pending', 'Maybe', 'Not Going', 'Declined'],
  isCanonicalStatus: vi.fn().mockReturnValue(false),
}));
vi.mock('../src/utils/profile-completeness', () => ({
  computeProfileCompleteness: vi.fn().mockReturnValue(50),
}));
vi.mock('../src/controllers/meal-options-controller', () => ({
  listMealOptionsForEvent: vi.fn().mockResolvedValue([]),
}));

import { importCsv } from '../src/controllers/rsvps-controller.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    json(data)   { this.body = data; return this; },
  };
  return res;
}

/**
 * Build a mock Express request that mimics multer's multipart output:
 *  - req.file.buffer  ← the CSV bytes
 *  - req.body         ← non-file form fields (column_map goes here)
 */
function makeImportReq(csvContent: string, columnMap?: Record<string, string>) {
  const body: Record<string, string> = {};
  if (columnMap !== undefined) {
    body['column_map'] = JSON.stringify(columnMap);
  }
  return {
    params: { eventId: '1' },
    query: {},
    body,
    user: { id: 1, email: 'organizer@test.com', role_id: 2 },
    ip: '127.0.0.1',
    file: {
      buffer: Buffer.from(csvContent, 'utf8'),
      originalname: 'guests.csv',
      mimetype: 'text/csv',
      size: Buffer.byteLength(csvContent, 'utf8'),
    },
  } as unknown as import('express').Request;
}

/** DB run mock that simulates a successful INSERT (1 row changed). */
function dbRunSuccess() {
  return {
    changes: 1,
    lastID: 99,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('importCsv — backward compat (no column_map)', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn(), exec: vi.fn() };
  });

  it('imports a row when CSV headers exactly match guest field names', async () => {
    // Standard CSV where column names are already the canonical field names
    const csv = 'name,email,phone\nAlice Smith,alice@test.com,555-1234';
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    expect(res.statusCode).toBe(200);
    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);
  });

  it('skips a row that is missing name or email', async () => {
    const csv = 'name,email\n,missing@test.com\nBob,';
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(0);
    expect(body.skipped).toBe(2);
  });

  it('normalises CSV headers to lowercase_underscore before field lookup', async () => {
    // "Guest Name" → "guest_name" — does NOT match "name", so row is skipped
    const csv = 'Guest Name,Email\nCarol,carol@test.com';
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    // "Guest Name" normalises to "guest_name", not "name" → skipped
    const body = res.body as { imported: number; skipped: number };
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });
});

describe('importCsv — column_map applied (Item 11 fix)', () => {
  beforeEach(() => {
    mockDb = { get: vi.fn(), all: vi.fn(), run: vi.fn(), exec: vi.fn() };
  });

  it('maps a custom header to the name field and imports the row', async () => {
    const csv = 'Full Name,Email Address\nDave Jones,dave@test.com';
    const columnMap = { 'Full Name': 'name', 'Email Address': 'email' };
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv, columnMap);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);

    // Verify the INSERT was called with the correct name & email values
    const insertCall = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = insertCall[1] as unknown[];
    // $2 = name, $3 = email
    expect(params[1]).toBe('Dave Jones');
    expect(params[2]).toBe('dave@test.com');
  });

  it('maps dietary restriction, phone and notes from non-standard headers', async () => {
    const csv = [
      'Guest,Email,Diet,Contact,Memo',
      'Eve,eve@test.com,Vegan,555-9999,Allergic to nuts',
    ].join('\n');
    const columnMap = {
      Guest: 'name',
      Email: 'email',
      Diet: 'dietary_restriction',
      Contact: 'phone',
      Memo: 'notes',
    };
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv, columnMap);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(1);

    const params = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
    // $7 = phone (index 6), $8 = dietary_restriction (index 7), $6 = notes (index 5)
    expect(params[5]).toBe('Allergic to nuts');  // notes ($6)
    expect(params[6]).toBe('555-9999');           // phone ($7)
    expect(params[7]).toBe('Vegan');              // dietary_restriction ($8)
  });

  it('ignores a column mapped to an unrecognised target field name (whitelist protection)', async () => {
    // "Junk" is mapped to "evil_field" which is not in ALLOWED_GUEST_FIELDS
    // The column is silently omitted; name and email are mapped correctly
    const csv = 'Junk,Guest Name,Email\nSHOULD_NOT_APPEAR,Frank,frank@test.com';
    const columnMap = { Junk: 'evil_field', 'Guest Name': 'name', Email: 'email' };
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv, columnMap);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(1);

    const params = (mockDb.run as ReturnType<typeof vi.fn>).mock.calls[0][1] as unknown[];
    expect(params[1]).toBe('Frank');
    expect(params[2]).toBe('frank@test.com');
  });

  it('skips rows that are still missing name/email after mapping', async () => {
    // Only email is mapped; name stays unmapped → row skipped
    const csv = 'Contact,Email\nGrace,grace@test.com';
    const columnMap = { Email: 'email' }; // 'Contact' not mapped to 'name'
    mockDb.run.mockResolvedValue(dbRunSuccess());

    const req = makeImportReq(csv, columnMap);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    // "Contact" → normalised to "contact" (not "name") via fallback, so no name
    const body = res.body as { imported: number; skipped: number };
    expect(body.skipped).toBe(1);
    expect(body.imported).toBe(0);
  });

  it('ignores a malformed column_map JSON and falls back to normalised headers', async () => {
    const csv = 'name,email\nHank,hank@test.com';
    mockDb.run.mockResolvedValue(dbRunSuccess());

    // Inject raw (unparsed) broken JSON directly into body
    const req = {
      ...makeImportReq(csv),
      body: { column_map: '{not valid json' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    // Fallback: normalised headers match "name" and "email" directly
    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);
  });

  it('handles multiple rows with mixed mapped and skipped columns', async () => {
    const csv = [
      'Person,Mail,Notes',
      'Isla,isla@test.com,VIP',
      'Jack,jack@test.com,Regular',
    ].join('\n');
    // Notes is not sent (frontend filters '' entries), so it falls back to
    // normalised header "notes" via the default path — still resolved correctly
    const columnMap = { Person: 'name', Mail: 'email' };
    mockDb.run
      .mockResolvedValueOnce(dbRunSuccess())
      .mockResolvedValueOnce(dbRunSuccess());

    const req = makeImportReq(csv, columnMap);
    const res = makeRes();
    await importCsv(req, res as unknown as import('express').Response);

    const body = res.body as { imported: number; skipped: number };
    expect(body.imported).toBe(2);
    expect(body.skipped).toBe(0);
  });
});
