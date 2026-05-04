/**
 * Migration tests for venues and vendors tables — issue #273
 *
 * Verifies that runPostgresMigrations creates the correct PostgreSQL schema
 * for venues and vendors, including columns, constraints, and indexes.
 * Calls the real production migration function with a mocked DbWrapper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPostgresMigrations, DbWrapper } from '../src/db/database.js';

// ---------------------------------------------------------------------------
// Track every SQL string passed to exec()
// ---------------------------------------------------------------------------
const execCalls: string[] = [];

const mockDb = {
  exec: vi.fn(async (sql: string) => {
    execCalls.push(sql.replace(/\s+/g, ' ').trim());
  }),
  get: vi.fn().mockResolvedValue(undefined),
  all: vi.fn().mockResolvedValue([]),
  run: vi.fn().mockResolvedValue({ lastID: undefined, changes: 0 }),
};

// Mock pg Pool so the module never opens a real connection
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      query:   vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      end:     vi.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Helper — find a recorded exec call that matches a fragment
// ---------------------------------------------------------------------------
function findExec(fragment: string): string | undefined {
  return execCalls.find((s) => s.includes(fragment));
}

// ---------------------------------------------------------------------------
// Tests — driven by the real production runPostgresMigrations
// ---------------------------------------------------------------------------
describe('venues and vendors migration (#273)', () => {
  beforeEach(() => {
    execCalls.length = 0;
    vi.clearAllMocks();
    mockDb.exec.mockImplementation(async (sql: string) => {
      execCalls.push(sql.replace(/\s+/g, ' ').trim());
    });
    mockDb.run.mockResolvedValue({ lastID: undefined, changes: 0 });
  });

  describe('venues table', () => {
    it('creates venues table with CREATE TABLE IF NOT EXISTS', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues');
      expect(stmt).toBeDefined();
    });

    it('venues table has SERIAL PRIMARY KEY', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues');
      expect(stmt).toMatch(/id\s+SERIAL PRIMARY KEY/i);
    });

    it('venues table has event_id as NOT NULL FK', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues');
      expect(stmt).toMatch(/event_id\s+INTEGER NOT NULL/i);
      expect(stmt).toMatch(/FOREIGN KEY \(event_id\) REFERENCES events\(id\) ON DELETE CASCADE/i);
    });

    it('venues table has name column NOT NULL', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues');
      expect(stmt).toMatch(/name\s+TEXT NOT NULL/i);
    });

    it('venues table has address, city, capacity columns', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues') ?? '';
      expect(stmt).toMatch(/address\s+TEXT/i);
      expect(stmt).toMatch(/city\s+TEXT/i);
      expect(stmt).toMatch(/capacity\s+INTEGER/i);
    });

    it('venues table has contact columns', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues') ?? '';
      expect(stmt).toMatch(/contact_name\s+TEXT/i);
      expect(stmt).toMatch(/contact_email\s+TEXT/i);
      expect(stmt).toMatch(/contact_phone\s+TEXT/i);
    });

    it('venues table status check constraint includes Confirmed, Tentative, Cancelled', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues') ?? '';
      expect(stmt).toMatch(/status IN \('Confirmed', 'Tentative', 'Cancelled'\)/i);
      expect(stmt).toMatch(/DEFAULT 'Tentative'/i);
    });

    it('venues table has created_at and updated_at timestamps', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS venues') ?? '';
      expect(stmt).toMatch(/created_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
      expect(stmt).toMatch(/updated_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
    });

    it('creates index on venues.event_id', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('idx_venues_event_id');
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(/CREATE INDEX IF NOT EXISTS idx_venues_event_id ON venues\(event_id\)/i);
    });
  });

  describe('vendors table', () => {
    it('creates vendors table with CREATE TABLE IF NOT EXISTS', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors');
      expect(stmt).toBeDefined();
    });

    it('vendors table has SERIAL PRIMARY KEY', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors');
      expect(stmt).toMatch(/id\s+SERIAL PRIMARY KEY/i);
    });

    it('vendors table has event_id as NOT NULL FK referencing events', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors');
      expect(stmt).toMatch(/event_id\s+INTEGER NOT NULL/i);
      expect(stmt).toMatch(/FOREIGN KEY \(event_id\) REFERENCES events\(id\) ON DELETE CASCADE/i);
    });

    it('vendors table has name column NOT NULL', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors');
      expect(stmt).toMatch(/name\s+TEXT NOT NULL/i);
    });

    it('vendors table has category, cost, and contact columns', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors') ?? '';
      expect(stmt).toMatch(/category\s+TEXT/i);
      expect(stmt).toMatch(/cost\s+REAL/i);
      expect(stmt).toMatch(/contact_name\s+TEXT/i);
      expect(stmt).toMatch(/contact_email\s+TEXT/i);
      expect(stmt).toMatch(/contact_phone\s+TEXT/i);
    });

    it('vendors table status check constraint includes Confirmed, Pending, Cancelled', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors') ?? '';
      expect(stmt).toMatch(/status IN \('Confirmed', 'Pending', 'Cancelled'\)/i);
      expect(stmt).toMatch(/DEFAULT 'Pending'/i);
    });

    it('vendors table has created_at timestamp', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('CREATE TABLE IF NOT EXISTS vendors') ?? '';
      expect(stmt).toMatch(/created_at\s+TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
    });

    it('creates index on vendors.event_id', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const stmt = findExec('idx_vendors_event_id');
      expect(stmt).toBeDefined();
      expect(stmt).toMatch(/CREATE INDEX IF NOT EXISTS idx_vendors_event_id ON vendors\(event_id\)/i);
    });
  });

  describe('migration is idempotent', () => {
    it('uses IF NOT EXISTS so re-running does not throw', async () => {
      await expect(runPostgresMigrations(mockDb as unknown as DbWrapper)).resolves.not.toThrow();
      await expect(runPostgresMigrations(mockDb as unknown as DbWrapper)).resolves.not.toThrow();
    });
  });

  describe('exec call order', () => {
    it('venues table is created before vendors table', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const venuesIdx = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS venues'));
      const vendorsIdx = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS vendors'));
      expect(venuesIdx).toBeGreaterThanOrEqual(0);
      expect(vendorsIdx).toBeGreaterThan(venuesIdx);
    });

    it('venue index is created immediately after venues table', async () => {
      await runPostgresMigrations(mockDb as unknown as DbWrapper);
      const venuesIdx = execCalls.findIndex((s) => s.includes('CREATE TABLE IF NOT EXISTS venues'));
      const venueIdxStmt = execCalls.findIndex((s) => s.includes('idx_venues_event_id'));
      expect(venueIdxStmt).toBe(venuesIdx + 1);
    });
  });
});
