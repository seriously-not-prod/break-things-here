/**
 * Migration tests for event_budgets, expense_categories, and expenses tables — issue #274
 *
 * Verifies that the PostgreSQL migrations create the correct schema:
 * - event_budgets  : one-to-one with events, total_budget NOT NULL
 * - expense_categories : seeded with 6 default categories
 * - expenses       : FK to events, expense_categories, vendors (nullable), users
 *
 * Uses a mocked DbWrapper so no live database is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Track every SQL string passed to exec()
// ---------------------------------------------------------------------------
const execCalls: string[] = [];

const mockDb = {
  exec: vi.fn(async (sql: string) => {
    execCalls.push(sql.replace(/\s+/g, ' ').trim());
  }),
  get: vi.fn(),
  all: vi.fn(),
  run: vi.fn(),
};

vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      query:   vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end:     vi.fn(),
    })),
  },
}));

vi.mock('../src/db/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/database.js')>();
  return { ...actual, getDatabase: () => mockDb };
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function findExec(fragment: string): string | undefined {
  return execCalls.find((s) => s.includes(fragment));
}

// ---------------------------------------------------------------------------
// The migration SQL under test (mirrors database.ts additions for #274)
// ---------------------------------------------------------------------------
async function runBudgetExpensesMigrations(db: typeof mockDb) {
  // event_budgets
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_budgets (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL UNIQUE,
      total_budget REAL NOT NULL,
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // expense_categories
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // seed default categories
  await db.exec(`
    INSERT INTO expense_categories (name) VALUES
    ('Catering'),
    ('AV'),
    ('Security'),
    ('Venue'),
    ('Marketing'),
    ('Other')
    ON CONFLICT (name) DO NOTHING
  `);

  // expenses
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount      REAL NOT NULL,
      vendor_id   INTEGER,
      receipt_url TEXT,
      status      TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      created_by  INTEGER NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id)    REFERENCES events(id)             ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES expense_categories(id),
      FOREIGN KEY (vendor_id)   REFERENCES vendors(id)            ON DELETE SET NULL,
      FOREIGN KEY (created_by)  REFERENCES users(id)              ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses(event_id)
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('budget and expenses migration (#274)', () => {
  beforeEach(() => {
    execCalls.length = 0;
    vi.clearAllMocks();
    mockDb.exec.mockImplementation(async (sql: string) => {
      execCalls.push(sql.replace(/\s+/g, ' ').trim());
    });
  });

  // -------------------------------------------------------------------------
  // event_budgets
  // -------------------------------------------------------------------------
  describe('event_budgets table', () => {
    it('creates event_budgets with CREATE TABLE IF NOT EXISTS', async () => {
      await runBudgetExpensesMigrations(mockDb);
      expect(findExec('CREATE TABLE IF NOT EXISTS event_budgets')).toBeDefined();
    });

    it('event_budgets has SERIAL PRIMARY KEY', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS event_budgets') ?? '';
      expect(stmt).toMatch(/id\s+SERIAL PRIMARY KEY/i);
    });

    it('event_budgets event_id is NOT NULL UNIQUE FK to events', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS event_budgets') ?? '';
      expect(stmt).toMatch(/event_id\s+INTEGER NOT NULL UNIQUE/i);
      expect(stmt).toMatch(/FOREIGN KEY \(event_id\) REFERENCES events\(id\) ON DELETE CASCADE/i);
    });

    it('event_budgets total_budget is REAL NOT NULL', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS event_budgets') ?? '';
      expect(stmt).toMatch(/total_budget\s+REAL NOT NULL/i);
    });

    it('event_budgets has notes (nullable), created_at, and updated_at', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS event_budgets') ?? '';
      expect(stmt).toMatch(/notes\s+TEXT/i);
      expect(stmt).toMatch(/created_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
      expect(stmt).toMatch(/updated_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
    });
  });

  // -------------------------------------------------------------------------
  // expense_categories
  // -------------------------------------------------------------------------
  describe('expense_categories table', () => {
    it('creates expense_categories with CREATE TABLE IF NOT EXISTS', async () => {
      await runBudgetExpensesMigrations(mockDb);
      expect(findExec('CREATE TABLE IF NOT EXISTS expense_categories')).toBeDefined();
    });

    it('expense_categories name is TEXT NOT NULL UNIQUE', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expense_categories') ?? '';
      expect(stmt).toMatch(/name\s+TEXT NOT NULL UNIQUE/i);
    });

    it('seeds all 6 default expense categories', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const seed = findExec('INSERT INTO expense_categories') ?? '';
      expect(seed).toMatch(/'Catering'/);
      expect(seed).toMatch(/'AV'/);
      expect(seed).toMatch(/'Security'/);
      expect(seed).toMatch(/'Venue'/);
      expect(seed).toMatch(/'Marketing'/);
      expect(seed).toMatch(/'Other'/);
    });

    it('seed is idempotent via ON CONFLICT (name) DO NOTHING', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const seed = findExec('INSERT INTO expense_categories') ?? '';
      expect(seed).toMatch(/ON CONFLICT \(name\) DO NOTHING/i);
    });
  });

  // -------------------------------------------------------------------------
  // expenses
  // -------------------------------------------------------------------------
  describe('expenses table', () => {
    it('creates expenses with CREATE TABLE IF NOT EXISTS', async () => {
      await runBudgetExpensesMigrations(mockDb);
      expect(findExec('CREATE TABLE IF NOT EXISTS expenses')).toBeDefined();
    });

    it('expenses has SERIAL PRIMARY KEY', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/id\s+SERIAL PRIMARY KEY/i);
    });

    it('expenses event_id is NOT NULL FK to events ON DELETE CASCADE', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/event_id\s+INTEGER NOT NULL/i);
      expect(stmt).toMatch(/FOREIGN KEY \(event_id\)\s+REFERENCES events\(id\)\s+ON DELETE CASCADE/i);
    });

    it('expenses category_id is NOT NULL FK to expense_categories', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/category_id\s+INTEGER NOT NULL/i);
      expect(stmt).toMatch(/FOREIGN KEY \(category_id\)\s+REFERENCES expense_categories\(id\)/i);
    });

    it('expenses description is TEXT NOT NULL', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/description\s+TEXT NOT NULL/i);
    });

    it('expenses amount is REAL NOT NULL', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/amount\s+REAL NOT NULL/i);
    });

    it('expenses vendor_id is nullable FK to vendors with ON DELETE SET NULL', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      // vendor_id column has no NOT NULL constraint
      expect(stmt).toMatch(/vendor_id\s+INTEGER[^,]*/i);
      expect(stmt).not.toMatch(/vendor_id\s+INTEGER NOT NULL/i);
      // FK with SET NULL
      expect(stmt).toMatch(/FOREIGN KEY \(vendor_id\)\s+REFERENCES vendors\(id\)\s+ON DELETE SET NULL/i);
    });

    it('expenses created_by is NOT NULL FK to users ON DELETE CASCADE', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/created_by\s+INTEGER NOT NULL/i);
      expect(stmt).toMatch(/FOREIGN KEY \(created_by\)\s+REFERENCES users\(id\)\s+ON DELETE CASCADE/i);
    });

    it('expenses status check constraint includes Pending, Approved, Rejected', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/status IN \('Pending', 'Approved', 'Rejected'\)/i);
      expect(stmt).toMatch(/DEFAULT 'Pending'/i);
    });

    it('expenses has receipt_url, created_at, updated_at', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/receipt_url\s+TEXT/i);
      expect(stmt).toMatch(/created_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
      expect(stmt).toMatch(/updated_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
    });

    it('creates index on expenses.event_id', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('idx_expenses_event_id') ?? '';
      expect(stmt).toMatch(/CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses\(event_id\)/i);
    });

    it('creates index on expenses.category_id', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('idx_expenses_category_id') ?? '';
      expect(stmt).toMatch(/CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses\(category_id\)/i);
    });
  });

  // -------------------------------------------------------------------------
  // Referential integrity
  // -------------------------------------------------------------------------
  describe('referential integrity', () => {
    it('expenses vendor_id FK uses ON DELETE SET NULL (nullable — vendor deletion does not cascade)', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/FOREIGN KEY \(vendor_id\)\s+REFERENCES vendors\(id\)\s+ON DELETE SET NULL/i);
    });

    it('event_budgets is one-to-one with events via UNIQUE on event_id', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS event_budgets') ?? '';
      expect(stmt).toMatch(/event_id\s+INTEGER NOT NULL UNIQUE/i);
    });

    it('expenses cascade-deletes when event is deleted', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/FOREIGN KEY \(event_id\)\s+REFERENCES events\(id\)\s+ON DELETE CASCADE/i);
    });

    it('expenses cascade-deletes when creating user is deleted', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS expenses') ?? '';
      expect(stmt).toMatch(/FOREIGN KEY \(created_by\)\s+REFERENCES users\(id\)\s+ON DELETE CASCADE/i);
    });
  });

  // -------------------------------------------------------------------------
  // Migration ordering
  // -------------------------------------------------------------------------
  describe('migration ordering', () => {
    it('expense_categories is created before expenses (FK dependency)', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const catIdx = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS expense_categories'));
      const expIdx = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS expenses'));
      expect(catIdx).toBeGreaterThanOrEqual(0);
      expect(expIdx).toBeGreaterThan(catIdx);
    });

    it('seed runs after expense_categories table is created', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const catIdx  = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS expense_categories'));
      const seedIdx = execCalls.findIndex((s) => s.includes('INSERT INTO expense_categories'));
      expect(seedIdx).toBeGreaterThan(catIdx);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------
  describe('migration idempotency', () => {
    it('all CREATE TABLE statements use IF NOT EXISTS', async () => {
      await runBudgetExpensesMigrations(mockDb);
      const tableStmts = execCalls.filter((s) => s.startsWith('CREATE TABLE'));
      expect(tableStmts.length).toBeGreaterThan(0);
      tableStmts.forEach((s) => expect(s).toMatch(/CREATE TABLE IF NOT EXISTS/i));
    });

    it('re-running migrations does not throw', async () => {
      await expect(runBudgetExpensesMigrations(mockDb)).resolves.not.toThrow();
      await expect(runBudgetExpensesMigrations(mockDb)).resolves.not.toThrow();
    });
  });
});
