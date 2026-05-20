import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL DEFAULT 'x',
  display_name TEXT NOT NULL DEFAULT '',
  role_id INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_members (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  website TEXT,
  status TEXT DEFAULT 'Contacted',
  quoted_amount NUMERIC(10,2),
  contract_file TEXT,
  notes TEXT,
  rating INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_favorites (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id, user_id)
);

CREATE TABLE IF NOT EXISTS vendor_bookings (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested',
  contract_signed_at TIMESTAMP,
  service_start_at TIMESTAMP,
  service_end_at TIMESTAMP,
  total_amount NUMERIC(10,2),
  currency_code TEXT DEFAULT 'USD',
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS vendor_payment_schedules (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_booking_id INTEGER REFERENCES vendor_bookings(id) ON DELETE SET NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import {
  createVendorPaymentSchedule,
  getVendorBooking,
  listFavoriteVendors,
  listVendors,
  setVendorFavorite,
  upsertVendorBooking,
} from '../src/controllers/vendors-controller.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
}

function makeRes(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number): MockResponse {
      this.statusCode = code;
      return this;
    },
    json(data: unknown): MockResponse {
      this.body = data;
      return this;
    },
  };
}

function makeReq(
  params: Record<string, string>,
  user: { id: number; email: string; role_id: number },
  body: Record<string, unknown> = {},
): Request {
  return { params, body, query: {}, user } as unknown as Request;
}

async function seedUser(email: string, roleId: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO users (email, display_name, role_id) VALUES (?, ?, ?) RETURNING id`,
    [email, email, roleId],
  );
  return Number(result.lastID);
}

async function seedEvent(ownerId: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO events (title, date, location, created_by) VALUES ('Vendor Event', '2031-08-01', 'Hall B', ?) RETURNING id`,
    [ownerId],
  );
  return Number(result.lastID);
}

async function seedVendor(eventId: number, ownerId: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO vendors (event_id, name, category, created_by) VALUES (?, 'Stage Crew Co', 'Logistics', ?) RETURNING id`,
    [eventId, ownerId],
  );
  return Number(result.lastID);
}

describe('brd-v2 story 531 vendor lifecycle workflow', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('marks vendors as favorites and lists user favorites', async () => {
    const ownerId = await seedUser('owner-vendor@test.dev', 2);
    const eventId = await seedEvent(ownerId);
    const vendorId = await seedVendor(eventId, ownerId);

    const setReq = makeReq(
      { eventId: String(eventId), id: String(vendorId) },
      { id: ownerId, email: 'owner-vendor@test.dev', role_id: 2 },
      { favorite: true },
    );
    const setRes = makeRes();
    await setVendorFavorite(setReq, setRes as unknown as Response);

    expect(setRes.statusCode).toBe(200);
    expect(setRes.body).toMatchObject({ vendorId, favorite: true });

    const listReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner-vendor@test.dev', role_id: 2 },
    );
    const listRes = makeRes();
    await listFavoriteVendors(listReq, listRes as unknown as Response);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toMatchObject({
      favorites: [
        {
          vendor_id: vendorId,
        },
      ],
    });

    const vendorsReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner-vendor@test.dev', role_id: 2 },
    );
    const vendorsRes = makeRes();
    await listVendors(vendorsReq, vendorsRes as unknown as Response);

    expect(vendorsRes.statusCode).toBe(200);
    expect(vendorsRes.body).toMatchObject({
      vendors: [
        {
          id: vendorId,
          is_favorite: true,
        },
      ],
    });
  });

  it('upserts booking lifecycle states and returns current booking', async () => {
    const ownerId = await seedUser('owner-booking@test.dev', 2);
    const eventId = await seedEvent(ownerId);
    const vendorId = await seedVendor(eventId, ownerId);

    const upsertReq = makeReq(
      { eventId: String(eventId), id: String(vendorId) },
      { id: ownerId, email: 'owner-booking@test.dev', role_id: 2 },
      {
        status: 'contracted',
        total_amount: 2400.5,
        currency_code: 'USD',
        notes: 'Signed for two days',
      },
    );
    const upsertRes = makeRes();
    await upsertVendorBooking(upsertReq, upsertRes as unknown as Response);

    expect(upsertRes.statusCode).toBe(200);
    expect(upsertRes.body).toMatchObject({
      booking: {
        event_id: eventId,
        vendor_id: vendorId,
        status: 'contracted',
        currency_code: 'USD',
      },
    });

    const readReq = makeReq(
      { eventId: String(eventId), id: String(vendorId) },
      { id: ownerId, email: 'owner-booking@test.dev', role_id: 2 },
    );
    const readRes = makeRes();
    await getVendorBooking(readReq, readRes as unknown as Response);

    expect(readRes.statusCode).toBe(200);
    expect(readRes.body).toMatchObject({
      booking: {
        status: 'contracted',
      },
    });
  });

  it('validates payment schedules and links to vendor booking', async () => {
    const ownerId = await seedUser('owner-payment@test.dev', 2);
    const eventId = await seedEvent(ownerId);
    const vendorId = await seedVendor(eventId, ownerId);

    const booking = await testDb.run(
      `INSERT INTO vendor_bookings (event_id, vendor_id, status, created_by, updated_by)
       VALUES (?, ?, 'approved', ?, ?) RETURNING id`,
      [eventId, vendorId, ownerId, ownerId],
    );

    const invalidReq = makeReq(
      { eventId: String(eventId), id: String(vendorId) },
      { id: ownerId, email: 'owner-payment@test.dev', role_id: 2 },
      { due_date: '2031-09-10', amount: -1 },
    );
    const invalidRes = makeRes();
    await createVendorPaymentSchedule(invalidReq, invalidRes as unknown as Response);
    expect(invalidRes.statusCode).toBe(400);

    const validReq = makeReq(
      { eventId: String(eventId), id: String(vendorId) },
      { id: ownerId, email: 'owner-payment@test.dev', role_id: 2 },
      {
        due_date: '2031-09-10',
        amount: 700,
        status: 'pending',
        vendor_booking_id: booking.lastID,
        note: 'Deposit milestone',
      },
    );
    const validRes = makeRes();
    await createVendorPaymentSchedule(validReq, validRes as unknown as Response);

    expect(validRes.statusCode).toBe(201);
    expect(validRes.body).toMatchObject({
      schedule: {
        event_id: eventId,
        vendor_id: vendorId,
        amount: '700.00',
        status: 'pending',
      },
    });
  });
});
