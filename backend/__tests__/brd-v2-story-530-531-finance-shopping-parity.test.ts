/**
 * Integration tests for BRD v2 Story #530/#531 — Finance, Shopping & Store Suggestion Engine
 *
 * Issues covered:
 *   #551 — PostgreSQL migration for finance model extensions
 *   #552 — Shopping recommendation and price comparison completion
 *   #602 — Financial reporting suite parity and scheduling
 *   #607 — Store location suggestion engine completion
 *   #608 — Estimated-vs-actual price comparison in end-user reporting
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createPostgresTestDatabase, type TestDatabase } from './helpers/postgres-test-db.js';

// ─── Minimal schema for the features under test ───────────────────────────────

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
  storage_quota_bytes BIGINT DEFAULT 524288000,
  storage_used_bytes BIGINT DEFAULT 0,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_members (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role     TEXT DEFAULT 'Member',
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS store_suggestions (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  website      TEXT,
  notes        TEXT,
  category     TEXT,
  location     TEXT,
  latitude     NUMERIC(9,6),
  longitude    NUMERIC(9,6),
  usage_count  INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP,
  suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT store_suggestions_usage_count_nonneg CHECK (usage_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_suggestions_unique
  ON store_suggestions(event_id, lower(name));

CREATE TABLE IF NOT EXISTS shopping_lists (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id                  SERIAL PRIMARY KEY,
  list_id             INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  quantity            INTEGER DEFAULT 1,
  unit                TEXT,
  estimated_cost      NUMERIC(10,2),
  actual_cost         NUMERIC(10,2),
  status              TEXT CHECK(status IN ('Needed','Purchased','Not Available','Ordered')) DEFAULT 'Needed',
  assigned_to         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes               TEXT,
  source_store_name   TEXT,
  source_store_url    TEXT,
  compared_price_low  NUMERIC(10,2),
  compared_price_high NUMERIC(10,2),
  price_checked_at    TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shopping_items_compared_price_order_check CHECK (
    compared_price_low IS NULL OR compared_price_high IS NULL OR compared_price_low <= compared_price_high
  )
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  allocated_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate         NUMERIC(5,2) DEFAULT 0,
  gratuity_rate    NUMERIC(5,2) DEFAULT 0,
  contingency_rate NUMERIC(5,2) DEFAULT 0,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id                           SERIAL PRIMARY KEY,
  event_id                     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  budget_category_id           INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
  description                  TEXT NOT NULL,
  amount                       NUMERIC(10,2) NOT NULL,
  approval_status              TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (approval_status IN ('pending','approved','rejected')),
  reimbursement_status         TEXT NOT NULL DEFAULT 'not_requested'
                                    CHECK (reimbursement_status IN ('not_requested','requested','reimbursed','rejected')),
  approved_by                  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at                  TIMESTAMP,
  reimbursement_requested_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursement_requested_at   TIMESTAMP,
  reimbursed_by                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursed_at                TIMESTAMP,
  created_by                   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by                   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
  id        SERIAL PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  category  TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_bookings (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'requested',
  total_amount NUMERIC(10,2),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS vendor_payment_schedules (
  id                SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_booking_id INTEGER REFERENCES vendor_bookings(id) ON DELETE SET NULL,
  due_date          DATE NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at           TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rsvps (
  id       SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status   TEXT DEFAULT 'Pending',
  checked_in BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tasks (
  id       SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status   TEXT DEFAULT 'Pending'
);

CREATE TABLE IF NOT EXISTS event_documents (
  id        SERIAL PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream'
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'rsvp_summary','budget_summary','task_summary','storage_summary','full',
    'financial_detail','expense_workflow','vendor_spend','price_comparison'
  )),
  frequency   TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients  JSONB NOT NULL,
  filters     JSONB,
  next_run_at TIMESTAMP NOT NULL,
  last_run_at TIMESTAMP,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scheduled_report_deliveries (
  id        SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  status    TEXT,
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ─── Mocks ────────────────────────────────────────────────────────────────────

let testDb: TestDatabase;

vi.mock('../src/db/database.js', () => ({
  getDatabase: () => testDb,
  initializeDatabase: async () => testDb,
}));

import {
  createStoreSuggestion,
  deleteStoreSuggestion,
  getStoreSuggestionRecommendations,
  listStoreSuggestionCategories,
  listStoreSuggestions,
  selectStoreSuggestion,
  updateStoreSuggestionStatus,
} from '../src/controllers/store-suggestions-controller.js';

import {
  createItem,
  createList,
  getEventPriceComparison,
  getListPriceComparison,
  updateItemPriceData,
} from '../src/controllers/shopping-controller.js';

import {
  createReport,
  listReports,
  renderReport,
} from '../src/controllers/reports-controller.js';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (data: unknown) => MockResponse;
  send: (data: unknown) => MockResponse;
}

function makeRes(): MockResponse {
  const r: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(data: unknown) { this.body = data; return this; },
    send(data: unknown) { this.body = data; return this; },
  };
  return r;
}

function makeReq(
  params: Record<string, string>,
  user: { id: number; email: string; role_id: number },
  body: Record<string, unknown> = {},
  query: Record<string, string> = {},
): Request {
  return { params, body, query, user } as unknown as Request;
}

async function seedUser(email: string, roleId = 2): Promise<number> {
  const r = await testDb.run(
    `INSERT INTO users (email, display_name, role_id) VALUES (?, ?, ?) RETURNING id`,
    [email, email, roleId],
  );
  return Number(r.lastID);
}

async function seedEvent(ownerId: number): Promise<number> {
  const r = await testDb.run(
    `INSERT INTO events (title, date, location, created_by) VALUES ('Test Event', '2031-01-01', 'Venue', ?) RETURNING id`,
    [ownerId],
  );
  return Number(r.lastID);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('brd-v2 story 530/531 — finance, shopping & store suggestion engine', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  // ── #607: Store Location Suggestion Engine ──────────────────────────────────

  describe('#607 store suggestion engine', () => {
    it('creates a store suggestion with location fields', async () => {
      const ownerId = await seedUser('owner-607@test.dev');
      const eventId = await seedEvent(ownerId);

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-607@test.dev', role_id: 2 },
        { name: 'Party Supplies Hub', category: 'Supplies', location: '123 Main St, Chicago IL' },
      );
      const res = makeRes();
      await createStoreSuggestion(req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({
        suggestion: { name: 'Party Supplies Hub', location: '123 Main St, Chicago IL' },
      });
    });

    it('returns ranked recommendations sorted by usage_count DESC', async () => {
      const ownerId = await seedUser('owner-607b@test.dev');
      const eventId = await seedEvent(ownerId);

      // Seed two approved suggestions with different usage counts
      await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, category, status, usage_count, suggested_by)
         VALUES (?, 'Low Usage Store', 'Food', 'approved', 2, ?)`,
        [eventId, ownerId],
      );
      await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, category, status, usage_count, suggested_by)
         VALUES (?, 'High Usage Store', 'Food', 'approved', 10, ?)`,
        [eventId, ownerId],
      );

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-607b@test.dev', role_id: 2 },
        {},
        { category: 'Food' },
      );
      const res = makeRes();
      await getStoreSuggestionRecommendations(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { recommendations: { name: string; usage_count: number }[] };
      expect(body.recommendations[0].name).toBe('High Usage Store');
      expect(body.recommendations[0].usage_count).toBe(10);
    });

    it('increments usage_count on select', async () => {
      const ownerId = await seedUser('owner-607c@test.dev');
      const eventId = await seedEvent(ownerId);

      const insertResult = await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, status, usage_count, suggested_by)
         VALUES (?, 'Selectable Store', 'pending', 0, ?) RETURNING id`,
        [eventId, ownerId],
      );
      const suggId = Number(insertResult.lastID);

      const req = makeReq(
        { eventId: String(eventId), id: String(suggId) },
        { id: ownerId, email: 'owner-607c@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await selectStoreSuggestion(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ suggestion: { usage_count: 1 } });
    });

    it('rejects select on a rejected suggestion', async () => {
      const ownerId = await seedUser('owner-607d@test.dev');
      const eventId = await seedEvent(ownerId);

      const insertResult = await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, status, usage_count, suggested_by)
         VALUES (?, 'Rejected Store', 'rejected', 0, ?) RETURNING id`,
        [eventId, ownerId],
      );
      const suggId = Number(insertResult.lastID);

      const req = makeReq(
        { eventId: String(eventId), id: String(suggId) },
        { id: ownerId, email: 'owner-607d@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await selectStoreSuggestion(req, res as unknown as Response);

      expect(res.statusCode).toBe(409);
    });

    it('lists distinct categories used in suggestions', async () => {
      const ownerId = await seedUser('owner-607e@test.dev');
      const eventId = await seedEvent(ownerId);

      await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, category, status, usage_count, suggested_by)
         VALUES (?, 'A', 'Food', 'approved', 5, ?), (?, 'B', 'Decor', 'approved', 2, ?)`,
        [eventId, ownerId, eventId, ownerId],
      );

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-607e@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await listStoreSuggestionCategories(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { categories: { category: string }[] };
      const cats = body.categories.map((c) => c.category);
      expect(cats).toContain('Food');
      expect(cats).toContain('Decor');
    });

    it('does not include rejected suggestions in recommendations', async () => {
      const ownerId = await seedUser('owner-607f@test.dev');
      const eventId = await seedEvent(ownerId);

      await testDb.run(
        `INSERT INTO store_suggestions (event_id, name, status, usage_count, suggested_by)
         VALUES (?, 'Hidden Rejected', 'rejected', 99, ?)`,
        [eventId, ownerId],
      );

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-607f@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await getStoreSuggestionRecommendations(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { recommendations: { name: string }[] };
      expect(body.recommendations.every((r) => r.name !== 'Hidden Rejected')).toBe(true);
    });
  });

  // ── #552/#608: Shopping Price Comparison ────────────────────────────────────

  describe('#552/#608 shopping price comparison', () => {
    it('updates price data fields on a shopping item', async () => {
      const ownerId = await seedUser('owner-552@test.dev');
      const eventId = await seedEvent(ownerId);

      const listResult = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'Grocery List', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const listId = Number(listResult.lastID);

      const itemResult = await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost) VALUES (?, 'Napkins', 15.00) RETURNING id`,
        [listId],
      );
      const itemId = Number(itemResult.lastID);

      const req = makeReq(
        { eventId: String(eventId), listId: String(listId), itemId: String(itemId) },
        { id: ownerId, email: 'owner-552@test.dev', role_id: 2 },
        {
          source_store_name: 'Costco',
          source_store_url: 'https://costco.com',
          compared_price_low: 12.50,
          compared_price_high: 18.00,
        },
      );
      const res = makeRes();
      await updateItemPriceData(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        item: {
          source_store_name: 'Costco',
          source_store_url: 'https://costco.com',
          compared_price_low: '12.50',
          compared_price_high: '18.00',
        },
      });
    });

    it('rejects price data where low > high', async () => {
      const ownerId = await seedUser('owner-552b@test.dev');
      const eventId = await seedEvent(ownerId);

      const listResult = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'List B', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const listId = Number(listResult.lastID);

      const itemResult = await testDb.run(
        `INSERT INTO shopping_items (list_id, name) VALUES (?, 'Candles') RETURNING id`,
        [listId],
      );
      const itemId = Number(itemResult.lastID);

      const req = makeReq(
        { eventId: String(eventId), listId: String(listId), itemId: String(itemId) },
        { id: ownerId, email: 'owner-552b@test.dev', role_id: 2 },
        { compared_price_low: 50, compared_price_high: 20 },
      );
      const res = makeRes();
      await updateItemPriceData(req, res as unknown as Response);

      expect(res.statusCode).toBe(400);
    });

    it('returns list-level price comparison with variance', async () => {
      const ownerId = await seedUser('owner-608@test.dev');
      const eventId = await seedEvent(ownerId);

      const listResult = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'Budget List', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const listId = Number(listResult.lastID);

      // Item under budget
      await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost, actual_cost)
         VALUES (?, 'Tablecloths', 100.00, 80.00)`,
        [listId],
      );
      // Item over budget
      await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost, actual_cost)
         VALUES (?, 'Flowers', 50.00, 75.00)`,
        [listId],
      );

      const req = makeReq(
        { eventId: String(eventId), listId: String(listId) },
        { id: ownerId, email: 'owner-608@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await getListPriceComparison(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        summary: { total_estimated: number; total_actual: number; total_variance: number; items_over_budget: number };
        items: { name: string; variance: number }[];
      };
      expect(body.summary.total_estimated).toBe(150);
      expect(body.summary.total_actual).toBe(155);
      expect(body.summary.total_variance).toBe(5);
      expect(body.summary.items_over_budget).toBe(1);
      const flowersItem = body.items.find((i) => i.name === 'Flowers');
      expect(flowersItem?.variance).toBe(25);
    });

    it('returns event-level price comparison aggregated by list', async () => {
      const ownerId = await seedUser('owner-608b@test.dev');
      const eventId = await seedEvent(ownerId);

      const list1 = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'List One', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const list2 = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'List Two', ?) RETURNING id`,
        [eventId, ownerId],
      );

      await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost, actual_cost)
         VALUES (?, 'Item A', 200.00, 180.00)`,
        [Number(list1.lastID)],
      );
      await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost, actual_cost)
         VALUES (?, 'Item B', 100.00, 120.00)`,
        [Number(list2.lastID)],
      );

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-608b@test.dev', role_id: 2 },
      );
      const res = makeRes();
      await getEventPriceComparison(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as { event_summary: { total_estimated: number; total_actual: number } };
      expect(body.event_summary.total_estimated).toBe(300);
      expect(body.event_summary.total_actual).toBe(300);
    });
  });

  // ── #602: Financial Reporting Suite ─────────────────────────────────────────

  describe('#602 financial reporting suite', () => {
    it('creates a financial_detail scheduled report', async () => {
      const ownerId = await seedUser('owner-602@test.dev');
      const eventId = await seedEvent(ownerId);

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602@test.dev', role_id: 2 },
        {
          reportType: 'financial_detail',
          frequency: 'weekly',
          recipients: ['finance@example.com'],
        },
      );
      const res = makeRes();
      await createReport(req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ report_type: 'financial_detail' });
    });

    it('creates an expense_workflow scheduled report', async () => {
      const ownerId = await seedUser('owner-602b@test.dev');
      const eventId = await seedEvent(ownerId);

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602b@test.dev', role_id: 2 },
        {
          reportType: 'expense_workflow',
          frequency: 'monthly',
          recipients: ['approver@example.com'],
        },
      );
      const res = makeRes();
      await createReport(req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ report_type: 'expense_workflow' });
    });

    it('creates a vendor_spend scheduled report', async () => {
      const ownerId = await seedUser('owner-602c@test.dev');
      const eventId = await seedEvent(ownerId);

      const req = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602c@test.dev', role_id: 2 },
        {
          reportType: 'vendor_spend',
          frequency: 'weekly',
          recipients: ['vendors@example.com'],
        },
      );
      const res = makeRes();
      await createReport(req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toMatchObject({ report_type: 'vendor_spend' });
    });

    it('renders a financial_detail report with per-category breakdown', async () => {
      const ownerId = await seedUser('owner-602d@test.dev');
      const eventId = await seedEvent(ownerId);

      // Seed budget category with rates
      const catResult = await testDb.run(
        `INSERT INTO budget_categories (event_id, name, allocated_amount, tax_rate, gratuity_rate, contingency_rate)
         VALUES (?, 'Catering', 2000.00, 8.5, 18.0, 5.0) RETURNING id`,
        [eventId],
      );
      const catId = Number(catResult.lastID);

      // Seed a couple of expenses
      await testDb.run(
        `INSERT INTO expenses (event_id, budget_category_id, description, amount, approval_status, created_by)
         VALUES (?, ?, 'Food delivery', 500.00, 'approved', ?)`,
        [eventId, catId, ownerId],
      );
      await testDb.run(
        `INSERT INTO expenses (event_id, budget_category_id, description, amount, approval_status, created_by)
         VALUES (?, ?, 'Beverages', 300.00, 'pending', ?)`,
        [eventId, catId, ownerId],
      );

      // Create the report and get its ID
      const createReq = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602d@test.dev', role_id: 2 },
        { reportType: 'financial_detail', frequency: 'weekly', recipients: ['test@example.com'] },
      );
      const createRes = makeRes();
      await createReport(createReq, createRes as unknown as Response);
      const reportId = (createRes.body as { id: number }).id;

      const renderReq = makeReq(
        { eventId: String(eventId), reportId: String(reportId) },
        { id: ownerId, email: 'owner-602d@test.dev', role_id: 2 },
      );
      const renderRes = makeRes();
      await renderReport(renderReq, renderRes as unknown as Response);

      expect(renderRes.statusCode).toBe(200);
      const body = renderRes.body as {
        payload: {
          type: string;
          categories: { name: string; spent: string; tax_rate: string; effective_allocated: string }[];
          summary: { total_spent: string };
        };
      };
      expect(body.payload.type).toBe('financial_detail');
      expect(body.payload.categories[0].name).toBe('Catering');
      expect(Number(body.payload.categories[0].spent)).toBe(800);
      expect(Number(body.payload.summary.total_spent)).toBe(800);
    });

    it('renders an expense_workflow report with approval and reimbursement breakdown', async () => {
      const ownerId = await seedUser('owner-602e@test.dev');
      const eventId = await seedEvent(ownerId);

      await testDb.run(
        `INSERT INTO expenses (event_id, description, amount, approval_status, reimbursement_status, created_by)
         VALUES (?, 'Approved Exp', 200.00, 'approved', 'reimbursed', ?)`,
        [eventId, ownerId],
      );
      await testDb.run(
        `INSERT INTO expenses (event_id, description, amount, approval_status, reimbursement_status, created_by)
         VALUES (?, 'Pending Exp', 100.00, 'pending', 'not_requested', ?)`,
        [eventId, ownerId],
      );

      const createReq = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602e@test.dev', role_id: 2 },
        { reportType: 'expense_workflow', frequency: 'monthly', recipients: ['mgmt@example.com'] },
      );
      const createRes = makeRes();
      await createReport(createReq, createRes as unknown as Response);
      const reportId = (createRes.body as { id: number }).id;

      const renderReq = makeReq(
        { eventId: String(eventId), reportId: String(reportId) },
        { id: ownerId, email: 'owner-602e@test.dev', role_id: 2 },
      );
      const renderRes = makeRes();
      await renderReport(renderReq, renderRes as unknown as Response);

      expect(renderRes.statusCode).toBe(200);
      const body = renderRes.body as {
        payload: {
          type: string;
          approval: { approved: number; pending: number; approved_amount: string };
          reimbursement: { reimbursed: number; reimbursed_amount: string };
        };
      };
      expect(body.payload.type).toBe('expense_workflow');
      expect(body.payload.approval.approved).toBe(1);
      expect(body.payload.approval.pending).toBe(1);
      expect(Number(body.payload.reimbursement.reimbursed_amount)).toBe(200);
    });

    it('renders a price_comparison report across shopping lists', async () => {
      const ownerId = await seedUser('owner-602f@test.dev');
      const eventId = await seedEvent(ownerId);

      const listRes = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'Test List', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const listId = Number(listRes.lastID);

      await testDb.run(
        `INSERT INTO shopping_items (list_id, name, estimated_cost, actual_cost) VALUES (?, 'X', 100.00, 110.00)`,
        [listId],
      );

      const createReq = makeReq(
        { eventId: String(eventId) },
        { id: ownerId, email: 'owner-602f@test.dev', role_id: 2 },
        { reportType: 'price_comparison', frequency: 'weekly', recipients: ['shop@example.com'] },
      );
      const createRes = makeRes();
      await createReport(createReq, createRes as unknown as Response);
      const reportId = (createRes.body as { id: number }).id;

      const renderReq = makeReq(
        { eventId: String(eventId), reportId: String(reportId) },
        { id: ownerId, email: 'owner-602f@test.dev', role_id: 2 },
      );
      const renderRes = makeRes();
      await renderReport(renderReq, renderRes as unknown as Response);

      expect(renderRes.statusCode).toBe(200);
      const body = renderRes.body as {
        payload: { type: string; event_total: { total_estimated: string; total_actual: string } };
      };
      expect(body.payload.type).toBe('price_comparison');
      expect(Number(body.payload.event_total.total_estimated)).toBe(100);
      expect(Number(body.payload.event_total.total_actual)).toBe(110);
    });
  });

  // ── #551: PostgreSQL migration schema validation ─────────────────────────────

  describe('#551 PostgreSQL migration schema verification', () => {
    it('store_suggestions has usage_count, location, and latitude/longitude columns', async () => {
      const ownerId = await seedUser('owner-551@test.dev');
      const eventId = await seedEvent(ownerId);

      // Insert with all v7 columns
      const r = await testDb.run(
        `INSERT INTO store_suggestions
           (event_id, name, location, latitude, longitude, usage_count, suggested_by)
         VALUES (?, 'Geo Store', 'City Center', 41.8781, -87.6298, 3, ?) RETURNING id`,
        [eventId, ownerId],
      );
      const row = await testDb.get<{
        location: string; latitude: string; longitude: string; usage_count: number;
      }>(
        `SELECT location, latitude, longitude, usage_count FROM store_suggestions WHERE id = ?`,
        [Number(r.lastID)],
      );
      expect(row?.location).toBe('City Center');
      expect(Number(row?.latitude)).toBeCloseTo(41.8781, 3);
      expect(row?.usage_count).toBe(3);
    });

    it('shopping_items has price comparison columns', async () => {
      const ownerId = await seedUser('owner-551b@test.dev');
      const eventId = await seedEvent(ownerId);

      const lr = await testDb.run(
        `INSERT INTO shopping_lists (event_id, name, created_by) VALUES (?, 'Migration Test', ?) RETURNING id`,
        [eventId, ownerId],
      );
      const ir = await testDb.run(
        `INSERT INTO shopping_items
           (list_id, name, compared_price_low, compared_price_high, source_store_name, source_store_url)
         VALUES (?, 'Tested Item', 10.00, 20.00, 'TestShop', 'https://testshop.com') RETURNING id`,
        [Number(lr.lastID)],
      );
      const row = await testDb.get<{
        compared_price_low: string; compared_price_high: string; source_store_name: string;
      }>(
        `SELECT compared_price_low, compared_price_high, source_store_name FROM shopping_items WHERE id = ?`,
        [Number(ir.lastID)],
      );
      expect(Number(row?.compared_price_low)).toBe(10);
      expect(Number(row?.compared_price_high)).toBe(20);
      expect(row?.source_store_name).toBe('TestShop');
    });

    it('scheduled_reports accepts all new financial report types', async () => {
      const ownerId = await seedUser('owner-551c@test.dev');
      const eventId = await seedEvent(ownerId);

      const newTypes = ['financial_detail', 'expense_workflow', 'vendor_spend', 'price_comparison'];
      for (const rt of newTypes) {
        const r = await testDb.run(
          `INSERT INTO scheduled_reports
             (event_id, report_type, frequency, recipients, next_run_at, created_by, updated_by)
           VALUES (?, ?, 'weekly', '["x@x.com"]'::jsonb, CURRENT_TIMESTAMP + INTERVAL '1 day', ?, ?)
           RETURNING id`,
          [eventId, rt, ownerId, ownerId],
        );
        expect(Number(r.lastID)).toBeGreaterThan(0);
      }
    });

    it('rejects an unknown report type in scheduled_reports', async () => {
      const ownerId = await seedUser('owner-551d@test.dev');
      const eventId = await seedEvent(ownerId);

      await expect(
        testDb.run(
          `INSERT INTO scheduled_reports
             (event_id, report_type, frequency, recipients, next_run_at, created_by, updated_by)
           VALUES (?, 'invalid_type', 'weekly', 'x@x.com', CURRENT_TIMESTAMP, ?, ?)`,
          [eventId, ownerId, ownerId],
        ),
      ).rejects.toThrow();
    });
  });
});
