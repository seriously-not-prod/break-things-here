/**
 * Budget Category Planning Integration Tests
 * Tests create/update operations and validation for tax/gratuity/contingency planning rates
 * Issue #548: Budget planning controls (tax, gratuity, contingency)
 */

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
  capacity INTEGER,
  event_type TEXT,
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

CREATE TABLE IF NOT EXISTS budget_categories (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allocated_amount NUMERIC(10,2) DEFAULT 0,
  color TEXT,
  tax_rate NUMERIC(5,2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  gratuity_rate NUMERIC(5,2) DEFAULT 0 CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100),
  contingency_rate NUMERIC(5,2) DEFAULT 0 CHECK (contingency_rate >= 0 AND contingency_rate <= 100),
  -- #797 — selected vendor pick from compare dialog
  selected_vendor_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import { createCategory, updateCategory } from '../src/controllers/budget-controller.js';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
}

function makeRes(): MockResponse {
  const res: MockResponse = {
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
  user?: { id: number; email: string; role_id: number },
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
    `INSERT INTO events (title, date, location, created_by)
     VALUES ('Budget Test Event', '2031-06-15', 'Hall A', ?) RETURNING id`,
    [ownerId],
  );
  return Number(result.lastID);
}

describe('Budget Category Operations with Rate Calculations (#548)', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('creates a budget category with default rates (0%)', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Venue',
        allocated_amount: 10000,
        color: '#F97316',
      },
    );
    const res = makeRes();

    await createCategory(req, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      category: {
        name: 'Venue',
        allocated_amount: 10000,
        tax_rate: 0,
        gratuity_rate: 0,
        contingency_rate: 0,
        taxAmount: 0,
        gratuityAmount: 0,
        contingencyAmount: 0,
        plannedTotal: 10000,
      },
    });
  });

  it('creates a budget category with specified rates and calculates amounts', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Catering',
        allocated_amount: 5000,
        color: '#10B981',
        tax_rate: 8.25,
        gratuity_rate: 15,
        contingency_rate: 5,
      },
    );
    const res = makeRes();

    await createCategory(req, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    const { category } = res.body as { category: Record<string, unknown> };
    expect(category.allocated_amount).toBe(5000);
    expect(category.tax_rate).toBe(8.25);
    expect(category.gratuity_rate).toBe(15);
    expect(category.contingency_rate).toBe(5);
    // Verify calculations: 5000 * 8.25% = 412.5, 5000 * 15% = 750, 5000 * 5% = 250
    expect(category.taxAmount).toBe(412.5);
    expect(category.gratuityAmount).toBe(750);
    expect(category.contingencyAmount).toBe(250);
    expect(category.plannedTotal).toBe(6412.5); // 5000 + 412.5 + 750 + 250
  });

  it('rejects category creation with invalid rates', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    // Tax rate > 100
    const invalidTaxReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Test',
        allocated_amount: 1000,
        tax_rate: 101,
      },
    );
    const invalidTaxRes = makeRes();
    await createCategory(invalidTaxReq, invalidTaxRes as unknown as Response);
    expect(invalidTaxRes.statusCode).toBe(400);
    expect(invalidTaxRes.body).toMatchObject({ error: expect.stringContaining('tax') });

    // Negative gratuity rate
    const negativeGratReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Test',
        allocated_amount: 1000,
        gratuity_rate: -5,
      },
    );
    const negativeGratRes = makeRes();
    await createCategory(negativeGratReq, negativeGratRes as unknown as Response);
    expect(negativeGratRes.statusCode).toBe(400);
    expect(negativeGratRes.body).toMatchObject({ error: expect.stringContaining('gratuity') });
  });

  it('updates budget category rates and recalculates amounts', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    // Create with initial rates
    const createReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Venue',
        allocated_amount: 10000,
        tax_rate: 5,
        gratuity_rate: 10,
        contingency_rate: 0,
      },
    );
    const createRes = makeRes();
    await createCategory(createReq, createRes as unknown as Response);

    const categoryId = (createRes.body as { category: { id: number } }).category.id;

    // Update with new rates
    const updateReq = makeReq(
      { eventId: String(eventId), id: String(categoryId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Venue',
        allocated_amount: 10000,
        tax_rate: 8.25,
        gratuity_rate: 15,
        contingency_rate: 10,
      },
    );
    const updateRes = makeRes();

    await updateCategory(updateReq, updateRes as unknown as Response);

    expect(updateRes.statusCode).toBe(200);
    const { category } = updateRes.body as { category: Record<string, unknown> };
    expect(category.tax_rate).toBe(8.25);
    expect(category.gratuity_rate).toBe(15);
    expect(category.contingency_rate).toBe(10);
    // Verify recalculated amounts
    expect(category.taxAmount).toBe(825); // 10000 * 8.25%
    expect(category.gratuityAmount).toBe(1500); // 10000 * 15%
    expect(category.contingencyAmount).toBe(1000); // 10000 * 10%
    expect(category.plannedTotal).toBe(13325); // 10000 + 825 + 1500 + 1000
  });

  it('rejects category update with invalid rates', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    // Create
    const createReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Test',
        allocated_amount: 1000,
      },
    );
    const createRes = makeRes();
    await createCategory(createReq, createRes as unknown as Response);
    const categoryId = (createRes.body as { category: { id: number } }).category.id;

    // Try to update with contingency_rate > 100
    const updateReq = makeReq(
      { eventId: String(eventId), id: String(categoryId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Test',
        allocated_amount: 1000,
        contingency_rate: 150,
      },
    );
    const updateRes = makeRes();

    await updateCategory(updateReq, updateRes as unknown as Response);

    expect(updateRes.statusCode).toBe(400);
    expect(updateRes.body).toMatchObject({ error: expect.stringContaining('contingency') });
  });

  it('preserves existing rates when update omits them', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    // Create with rates
    const createReq = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Catering',
        allocated_amount: 5000,
        tax_rate: 8,
        gratuity_rate: 12,
        contingency_rate: 3,
      },
    );
    const createRes = makeRes();
    await createCategory(createReq, createRes as unknown as Response);
    const categoryId = (createRes.body as { category: { id: number } }).category.id;

    // Update only name
    const updateReq = makeReq(
      { eventId: String(eventId), id: String(categoryId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Catering Services',
        allocated_amount: 5000,
      },
    );
    const updateRes = makeRes();

    await updateCategory(updateReq, updateRes as unknown as Response);

    expect(updateRes.statusCode).toBe(200);
    const { category } = updateRes.body as { category: Record<string, unknown> };
    expect(category.name).toBe('Catering Services');
    // Rates should be preserved
    expect(category.tax_rate).toBe(8);
    expect(category.gratuity_rate).toBe(12);
    expect(category.contingency_rate).toBe(3);
  });

  it('correctly rounds floating point calculations', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const eventId = await seedEvent(ownerId);

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      {
        name: 'Test',
        allocated_amount: 199.99,
        tax_rate: 7.875,
        gratuity_rate: 0,
        contingency_rate: 0,
      },
    );
    const res = makeRes();

    await createCategory(req, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    const { category } = res.body as { category: Record<string, unknown> };
    // 199.99 * 7.875% = 15.7649375 ≈ 15.76 (rounded to cents)
    expect(category.taxAmount).toBe(15.76);
    expect(category.plannedTotal).toBe(215.75); // 199.99 + 15.76
  });
});
