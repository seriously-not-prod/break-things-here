/**
 * schedule_items — migration DDL & overlap validation tests
 * Issue #272 / Story #230
 *
 * All tests run without SQLite or any real database connection.
 *   - DDL tests assert the PostgreSQL migration strings are well-formed.
 *   - hasOverlap tests exercise the pure time-interval utility.
 *   - wouldOverlap tests mock DbWrapper so only the application logic is
 *     tested, not an actual database engine.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  hasOverlap,
  wouldOverlap,
  SCHEDULE_ITEMS_DDL,
  SCHEDULE_ITEMS_INDEX_DDL,
} from '../src/utils/schedule-utils.js';
import type { DbWrapper } from '../src/db/database.js';

// ---------------------------------------------------------------------------
// 1. PostgreSQL DDL assertions
// ---------------------------------------------------------------------------

describe('schedule_items PostgreSQL DDL', () => {
  it('declares a SERIAL PRIMARY KEY', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/id\s+SERIAL\s+PRIMARY\s+KEY/i);
  });

  it('declares event_id as an INTEGER NOT NULL with a FK reference', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/event_id\s+INTEGER\s+NOT\s+NULL/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/FOREIGN\s+KEY\s*\(event_id\)\s+REFERENCES\s+events/i);
  });

  it('declares all required TEXT columns', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/title\s+TEXT\s+NOT\s+NULL/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/start_time\s+TEXT\s+NOT\s+NULL/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/end_time\s+TEXT\s+NOT\s+NULL/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/\blocation\b/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/\bnotes\b/i);
  });

  it('includes created_at and updated_at TIMESTAMP columns', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/created_at\s+TIMESTAMP/i);
    expect(SCHEDULE_ITEMS_DDL).toMatch(/updated_at\s+TIMESTAMP/i);
  });

  it('includes the CHECK constraint enforcing start_time < end_time', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/CHECK\s*\(\s*start_time\s*<\s*end_time\s*\)/i);
  });

  it('cascades deletes from the parent events row', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/ON\s+DELETE\s+CASCADE/i);
  });

  it('uses CREATE TABLE IF NOT EXISTS (idempotent migration)', () => {
    expect(SCHEDULE_ITEMS_DDL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+schedule_items/i);
  });

  it('index DDL targets the correct table and column', () => {
    expect(SCHEDULE_ITEMS_INDEX_DDL).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_schedule_items_event_id/i);
    expect(SCHEDULE_ITEMS_INDEX_DDL).toMatch(/ON\s+schedule_items\s*\(\s*event_id\s*\)/i);
  });
});

// ---------------------------------------------------------------------------
// 2. hasOverlap — pure function, no DB needed
// ---------------------------------------------------------------------------

describe('hasOverlap()', () => {
  it('returns true for a fully contained slot', () => {
    expect(hasOverlap('10:30', '11:30', '10:00', '12:00')).toBe(true);
  });

  it('returns true when proposal starts before and ends inside existing', () => {
    expect(hasOverlap('09:00', '11:00', '10:00', '12:00')).toBe(true);
  });

  it('returns true when proposal starts inside and ends after existing', () => {
    expect(hasOverlap('11:00', '13:00', '10:00', '12:00')).toBe(true);
  });

  it('returns true when proposal completely wraps the existing slot', () => {
    expect(hasOverlap('09:00', '13:00', '10:00', '12:00')).toBe(true);
  });

  it('returns false for an adjacent slot that ends when existing starts', () => {
    expect(hasOverlap('08:00', '10:00', '10:00', '12:00')).toBe(false);
  });

  it('returns false for an adjacent slot that starts when existing ends', () => {
    expect(hasOverlap('12:00', '13:00', '10:00', '12:00')).toBe(false);
  });

  it('returns false for a slot entirely before the existing slot', () => {
    expect(hasOverlap('07:00', '09:00', '10:00', '12:00')).toBe(false);
  });

  it('returns false for a slot entirely after the existing slot', () => {
    expect(hasOverlap('13:00', '14:00', '10:00', '12:00')).toBe(false);
  });

  it('works correctly with ISO datetime strings', () => {
    expect(hasOverlap(
      '2026-08-01T10:30:00',
      '2026-08-01T11:30:00',
      '2026-08-01T10:00:00',
      '2026-08-01T12:00:00',
    )).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. wouldOverlap() — mocked DbWrapper, no real database
// ---------------------------------------------------------------------------

function makeDb(rows: { id: number; start_time: string; end_time: string }[]): DbWrapper {
  return {
    all: vi.fn().mockResolvedValue(rows),
  } as unknown as DbWrapper;
}

describe('wouldOverlap()', () => {
  it('returns true when a fully contained slot exists', async () => {
    const db = makeDb([{ id: 1, start_time: '10:00', end_time: '12:00' }]);
    expect(await wouldOverlap(db, 1, '10:30', '11:30')).toBe(true);
  });

  it('returns true when proposal starts before and ends inside an existing slot', async () => {
    const db = makeDb([{ id: 1, start_time: '10:00', end_time: '12:00' }]);
    expect(await wouldOverlap(db, 1, '09:00', '11:00')).toBe(true);
  });

  it('returns true when proposal starts inside and ends after an existing slot', async () => {
    const db = makeDb([{ id: 1, start_time: '10:00', end_time: '12:00' }]);
    expect(await wouldOverlap(db, 1, '11:00', '13:00')).toBe(true);
  });

  it('returns true when proposal completely wraps an existing slot', async () => {
    const db = makeDb([{ id: 1, start_time: '10:00', end_time: '12:00' }]);
    expect(await wouldOverlap(db, 1, '09:00', '13:00')).toBe(true);
  });

  it('returns false when all existing slots are adjacent (no overlap)', async () => {
    const db = makeDb([
      { id: 1, start_time: '08:00', end_time: '10:00' },
      { id: 2, start_time: '12:00', end_time: '14:00' },
    ]);
    expect(await wouldOverlap(db, 1, '10:00', '12:00')).toBe(false);
  });

  it('returns false when there are no existing slots', async () => {
    const db = makeDb([]);
    expect(await wouldOverlap(db, 1, '10:00', '12:00')).toBe(false);
  });

  it('excludes the row being updated (update scenario — same slot should not conflict with itself)', async () => {
    const db = makeDb([{ id: 5, start_time: '10:00', end_time: '12:00' }]);
    expect(await wouldOverlap(db, 1, '10:00', '12:00', 5)).toBe(false);
  });

  it('still detects overlap from OTHER rows when excludeId is set', async () => {
    const db = makeDb([
      { id: 5, start_time: '10:00', end_time: '12:00' },
      { id: 6, start_time: '11:00', end_time: '13:00' },
    ]);
    // Exclude row 5 but row 6 still overlaps
    expect(await wouldOverlap(db, 1, '10:00', '12:00', 5)).toBe(true);
  });

  it('queries the database with the correct event_id', async () => {
    const db = makeDb([]);
    await wouldOverlap(db, 42, '09:00', '10:00');
    expect(db.all).toHaveBeenCalledWith(
      expect.stringContaining('schedule_items'),
      [42],
    );
  });
});
