/**
 * Timeline conflict service — story #765 (tasks #803, #804).
 *
 * Pure unit tests for the conflict-detection rules: time overlap,
 * adjacency-without-buffer, and same-resource double-bookings. The
 * validateReorder() variant also exercises the sort-dependency check.
 */

import { describe, it, expect } from 'vitest';
import {
  detectTimelineConflicts,
  validateReorder,
  type TimelineActivitySnapshot,
} from '../src/services/timeline-conflict.js';

function activity(
  id: number,
  overrides: Partial<TimelineActivitySnapshot> = {},
): TimelineActivitySnapshot {
  return {
    id,
    title: `Activity ${id}`,
    start_time: null,
    end_time: null,
    planned_start_time: null,
    planned_end_time: null,
    sort_order: id,
    vendor_id: null,
    location: null,
    buffer_before_mins: 0,
    buffer_after_mins: 0,
    ...overrides,
  };
}

describe('detectTimelineConflicts', () => {
  it('flags strictly overlapping activities', () => {
    const conflicts = detectTimelineConflicts([
      activity(1, { start_time: '2026-06-01T10:00:00Z', end_time: '2026-06-01T11:00:00Z' }),
      activity(2, { start_time: '2026-06-01T10:30:00Z', end_time: '2026-06-01T11:30:00Z' }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ reason: 'overlap', activity_a_id: 1, activity_b_id: 2 });
  });

  it('flags resource double-bookings when vendors overlap', () => {
    const conflicts = detectTimelineConflicts([
      activity(1, {
        start_time: '2026-06-01T10:00:00Z',
        end_time: '2026-06-01T11:00:00Z',
        vendor_id: 7,
      }),
      activity(2, {
        start_time: '2026-06-01T10:30:00Z',
        end_time: '2026-06-01T11:30:00Z',
        vendor_id: 7,
      }),
    ]);
    expect(conflicts[0].reason).toBe('resource_double_book');
  });

  it('flags adjacent activities without the required buffer', () => {
    const conflicts = detectTimelineConflicts([
      activity(1, {
        start_time: '2026-06-01T10:00:00Z',
        end_time: '2026-06-01T11:00:00Z',
        buffer_after_mins: 30,
      }),
      activity(2, {
        start_time: '2026-06-01T11:10:00Z',
        end_time: '2026-06-01T12:00:00Z',
      }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].reason).toBe('adjacent_no_buffer');
  });

  it('returns no conflicts when activities are properly spaced', () => {
    const conflicts = detectTimelineConflicts([
      activity(1, { start_time: '2026-06-01T10:00:00Z', end_time: '2026-06-01T11:00:00Z' }),
      activity(2, { start_time: '2026-06-01T12:00:00Z', end_time: '2026-06-01T13:00:00Z' }),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('detects same-location double-bookings (case-insensitive)', () => {
    const conflicts = detectTimelineConflicts([
      activity(1, {
        start_time: '2026-06-01T10:00:00Z',
        end_time: '2026-06-01T11:00:00Z',
        location: 'Main Stage',
      }),
      activity(2, {
        start_time: '2026-06-01T10:30:00Z',
        end_time: '2026-06-01T11:30:00Z',
        location: 'main stage',
      }),
    ]);
    expect(conflicts[0].reason).toBe('resource_double_book');
  });
});

describe('validateReorder', () => {
  it('passes a reorder that keeps the timeline ordered by start time', () => {
    const current = [
      activity(1, {
        start_time: '2026-06-01T10:00:00Z',
        end_time: '2026-06-01T11:00:00Z',
        sort_order: 0,
      }),
      activity(2, {
        start_time: '2026-06-01T12:00:00Z',
        end_time: '2026-06-01T13:00:00Z',
        sort_order: 1,
      }),
    ];
    const result = validateReorder(current, [
      { id: 1, sort_order: 0 },
      { id: 2, sort_order: 1 },
    ]);
    expect(result.violations).toHaveLength(0);
    expect(result.sortDependencyViolations).toHaveLength(0);
  });

  it('flags a sort-dependency violation when an earlier activity is moved after a later one', () => {
    const current = [
      activity(1, {
        start_time: '2026-06-01T10:00:00Z',
        end_time: '2026-06-01T11:00:00Z',
        sort_order: 0,
      }),
      activity(2, {
        start_time: '2026-06-01T12:00:00Z',
        end_time: '2026-06-01T13:00:00Z',
        sort_order: 1,
      }),
    ];
    const result = validateReorder(current, [
      { id: 2, sort_order: 0 },
      { id: 1, sort_order: 1 },
    ]);
    expect(result.sortDependencyViolations.length).toBeGreaterThan(0);
    expect(result.sortDependencyViolations[0].reason).toBe('sort_dependency');
  });
});
