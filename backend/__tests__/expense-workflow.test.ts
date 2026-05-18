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

CREATE TABLE IF NOT EXISTS budget_categories (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allocated_amount NUMERIC(10,2) DEFAULT 0,
  color TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  vendor_name TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approval_note TEXT,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  reimbursement_status TEXT NOT NULL DEFAULT 'not_requested',
  reimbursement_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursement_requested_at TIMESTAMP,
  reimbursed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reimbursed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_workflow_events (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_state TEXT,
  to_state TEXT,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_receipt_ocr (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  receipt_text TEXT NOT NULL,
  extracted_title TEXT,
  extracted_amount NUMERIC(10,2),
  extracted_vendor_name TEXT,
  extracted_date TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'extracted',
  error_code TEXT,
  error_message TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expense_reconciliation_logs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  ocr_id INTEGER NOT NULL REFERENCES expense_receipt_ocr(id) ON DELETE RESTRICT,
  before_data JSONB NOT NULL,
  extracted_data JSONB NOT NULL,
  applied_data JSONB NOT NULL,
  overrides_count INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
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
  applyExpenseReceiptOcr,
  extractExpenseReceiptOcr,
  getExpenseWorkflowSummary,
  requestExpenseReimbursement,
  resolveExpenseReimbursement,
  reviewExpenseApproval,
} from '../src/controllers/budget-controller.js';

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
     VALUES ('Budget Event', '2031-06-15', 'Hall A', ?) RETURNING id`,
    [ownerId],
  );
  return Number(result.lastID);
}

async function seedCategory(eventId: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO budget_categories (event_id, name, allocated_amount)
     VALUES (?, 'Ops', 10000) RETURNING id`,
    [eventId],
  );
  return Number(result.lastID);
}

async function seedExpense(eventId: number, categoryId: number, createdBy: number): Promise<number> {
  const result = await testDb.run(
    `INSERT INTO expenses
      (event_id, category_id, title, amount, payment_status, created_by, updated_by)
     VALUES (?, ?, 'Vendor Deposit', 1200, 'pending', ?, ?) RETURNING id`,
    [eventId, categoryId, createdBy, createdBy],
  );
  return Number(result.lastID);
}

describe('expense approval and reimbursement workflow (#549 #599 #600)', () => {
  beforeEach(async () => {
    testDb = await createPostgresTestDatabase(SCHEMA_SQL);
  });

  afterEach(async () => {
    await testDb.close();
  });

  it('enforces owner/admin approval and records decision', async () => {
    const ownerId = await seedUser('owner@test.dev', 2);
    const memberId = await seedUser('member@test.dev', 1);
    const eventId = await seedEvent(ownerId);
    const categoryId = await seedCategory(eventId);
    const expenseId = await seedExpense(eventId, categoryId, memberId);
    await testDb.run(`INSERT INTO event_members (event_id, user_id) VALUES (?, ?)`, [eventId, memberId]);

    const forbidReq = makeReq(
      { eventId: String(eventId), id: String(expenseId) },
      { id: memberId, email: 'member@test.dev', role_id: 1 },
      { decision: 'approved' },
    );
    const forbidRes = makeRes();
    await reviewExpenseApproval(forbidReq, forbidRes as unknown as Response);
    expect(forbidRes.statusCode).toBe(403);

    const allowReq = makeReq(
      { eventId: String(eventId), id: String(expenseId) },
      { id: ownerId, email: 'owner@test.dev', role_id: 2 },
      { decision: 'approved', note: 'Looks good' },
    );
    const allowRes = makeRes();
    await reviewExpenseApproval(allowReq, allowRes as unknown as Response);

    expect(allowRes.statusCode).toBe(200);
    expect(allowRes.body).toMatchObject({
      expense: {
        id: expenseId,
        approval_status: 'approved',
        approval_note: 'Looks good',
      },
    });

    const audit = await testDb.get<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM expense_workflow_events
        WHERE expense_id = ? AND action = 'approval_reviewed'`,
      [expenseId],
    );
    expect(Number(audit?.count ?? '0')).toBe(1);
  });

  it('supports reimbursement request and owner resolution', async () => {
    const ownerId = await seedUser('owner2@test.dev', 2);
    const memberId = await seedUser('member2@test.dev', 1);
    const eventId = await seedEvent(ownerId);
    const categoryId = await seedCategory(eventId);
    const expenseId = await seedExpense(eventId, categoryId, memberId);
    await testDb.run(`INSERT INTO event_members (event_id, user_id) VALUES (?, ?)`, [eventId, memberId]);

    await testDb.run(
      `UPDATE expenses SET approval_status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [ownerId, expenseId],
    );

    const requestReq = makeReq(
      { eventId: String(eventId), id: String(expenseId) },
      { id: memberId, email: 'member2@test.dev', role_id: 1 },
    );
    const requestRes = makeRes();
    await requestExpenseReimbursement(requestReq, requestRes as unknown as Response);
    expect(requestRes.statusCode).toBe(200);
    expect(requestRes.body).toMatchObject({
      expense: {
        reimbursement_status: 'requested',
      },
    });

    const resolveReq = makeReq(
      { eventId: String(eventId), id: String(expenseId) },
      { id: ownerId, email: 'owner2@test.dev', role_id: 2 },
      { decision: 'reimbursed', note: 'Transferred today' },
    );
    const resolveRes = makeRes();
    await resolveExpenseReimbursement(resolveReq, resolveRes as unknown as Response);

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.body).toMatchObject({
      expense: {
        reimbursement_status: 'reimbursed',
        payment_status: 'paid',
      },
    });
  });

  it('returns workflow summary counts for reporting', async () => {
    const ownerId = await seedUser('owner3@test.dev', 2);
    const eventId = await seedEvent(ownerId);
    const categoryId = await seedCategory(eventId);

    const expenseA = await seedExpense(eventId, categoryId, ownerId);
    const expenseB = await seedExpense(eventId, categoryId, ownerId);
    await testDb.run(`UPDATE expenses SET approval_status = 'approved' WHERE id = ?`, [expenseA]);
    await testDb.run(`UPDATE expenses SET reimbursement_status = 'requested' WHERE id = ?`, [expenseA]);
    await testDb.run(`UPDATE expenses SET approval_status = 'rejected', reimbursement_status = 'rejected' WHERE id = ?`, [expenseB]);

    const req = makeReq(
      { eventId: String(eventId) },
      { id: ownerId, email: 'owner3@test.dev', role_id: 2 },
    );
    const res = makeRes();

    await getExpenseWorkflowSummary(req, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      summary: {
        approval: {
          pending: 0,
          approved: 1,
          rejected: 1,
        },
        reimbursement: {
          requested: 1,
          rejected: 1,
        },
      },
    });
  });

  it('extracts OCR fields and allows owner apply with reconciliation logs', async () => {
    const ownerId = await seedUser('owner4@test.dev', 2);
    const memberId = await seedUser('member4@test.dev', 1);
    const eventId = await seedEvent(ownerId);
    const categoryId = await seedCategory(eventId);
    const expenseId = await seedExpense(eventId, categoryId, memberId);
    await testDb.run(`INSERT INTO event_members (event_id, user_id) VALUES (?, ?)`, [eventId, memberId]);

    const extractReq = makeReq(
      { eventId: String(eventId), id: String(expenseId) },
      { id: memberId, email: 'member4@test.dev', role_id: 1 },
      { receipt_text: 'Vendor Shop\n2026-02-10\nTotal 245.50' },
    );
    const extractRes = makeRes();
    await extractExpenseReceiptOcr(extractReq, extractRes as unknown as Response);

    expect(extractRes.statusCode).toBe(201);
    expect(extractRes.body).toMatchObject({
      extracted: {
        amount: 245.5,
      },
    });

    const ocrId = Number((extractRes.body as { ocr: { id: number } }).ocr.id);
    const applyReq = makeReq(
      { eventId: String(eventId), id: String(expenseId), ocrId: String(ocrId) },
      { id: ownerId, email: 'owner4@test.dev', role_id: 2 },
      { override_reason: 'Checked with receipt image.' },
    );
    const applyRes = makeRes();
    await applyExpenseReceiptOcr(applyReq, applyRes as unknown as Response);

    expect(applyRes.statusCode).toBe(200);
    expect(applyRes.body).toMatchObject({
      expense: {
        id: expenseId,
      },
      reconciliation: {
        ocr_id: ocrId,
      },
    });

    const logCount = await testDb.get<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM expense_reconciliation_logs
        WHERE event_id = ? AND expense_id = ?`,
      [eventId, expenseId],
    );
    expect(Number(logCount?.count ?? '0')).toBe(1);
  });
});
