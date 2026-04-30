import type { DbWrapper } from '../db/database.js';

/**
 * Returns true when two half-open time intervals [aStart, aEnd) and
 * [bStart, bEnd) overlap. Adjacent slots (one ends exactly when the
 * other starts) are NOT considered overlapping.
 *
 * Times are compared lexicographically; callers must supply strings in
 * a consistent sortable format, e.g. 'HH:MM' or ISO 8601 datetime.
 */
export function hasOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Queries the schedule_items table to determine whether a proposed slot
 * [startTime, endTime) overlaps any existing slot for the same event.
 *
 * @param db        - Database wrapper
 * @param eventId   - The event to check against
 * @param startTime - Proposed slot start (sortable string, e.g. 'HH:MM')
 * @param endTime   - Proposed slot end (sortable string, e.g. 'HH:MM')
 * @param excludeId - Optional: skip this row (for update scenarios)
 * @returns Promise<boolean> — true when a conflict exists
 */
export async function wouldOverlap(
  db: DbWrapper,
  eventId: number,
  startTime: string,
  endTime: string,
  excludeId?: number,
): Promise<boolean> {
  const existing = await db.all<{ id: number; start_time: string; end_time: string }>(
    'SELECT id, start_time, end_time FROM schedule_items WHERE event_id = ?',
    [eventId],
  );
  return existing
    .filter(row => row.id !== excludeId)
    .some(row => hasOverlap(startTime, endTime, row.start_time, row.end_time));
}

/** PostgreSQL DDL for the schedule_items table (mirrors database.ts migration). */
export const SCHEDULE_ITEMS_DDL = `
  CREATE TABLE IF NOT EXISTS schedule_items (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_schedule_items_times CHECK (start_time < end_time),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  )
`.trim();

export const SCHEDULE_ITEMS_INDEX_DDL =
  'CREATE INDEX IF NOT EXISTS idx_schedule_items_event_id ON schedule_items(event_id)';
