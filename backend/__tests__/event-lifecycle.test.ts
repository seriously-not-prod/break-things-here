/**
 * BRD v2 — event lifecycle helper tests (#574, #575).
 */

import { describe, expect, it } from 'vitest';
import {
  EVENT_STATUSES,
  canTransition,
  describeInvalidTransition,
  isValidStatus,
  validateEventDate,
} from '../src/utils/event-lifecycle.js';

describe('event-lifecycle status set', () => {
  it('exposes the BRD v2 statuses in canonical order', () => {
    expect(EVENT_STATUSES).toEqual([
      'Draft',
      'Planning',
      'Confirmed',
      'Active',
      'Completed',
      'Cancelled',
    ]);
  });

  it('isValidStatus accepts known values and rejects others', () => {
    expect(isValidStatus('Draft')).toBe(true);
    expect(isValidStatus('Planning')).toBe(true);
    expect(isValidStatus('Confirmed')).toBe(true);
    expect(isValidStatus('Wrecked')).toBe(false);
    expect(isValidStatus(123)).toBe(false);
    expect(isValidStatus(null)).toBe(false);
  });
});

describe('canTransition', () => {
  it('permits Draft → Planning, Active, Cancelled', () => {
    expect(canTransition('Draft', 'Planning')).toBe(true);
    expect(canTransition('Draft', 'Active')).toBe(true);
    expect(canTransition('Draft', 'Cancelled')).toBe(true);
  });
  it('blocks Draft → Completed (must go through Active)', () => {
    expect(canTransition('Draft', 'Completed')).toBe(false);
  });
  it('treats Completed as terminal', () => {
    expect(canTransition('Completed', 'Draft')).toBe(false);
    expect(canTransition('Completed', 'Active')).toBe(false);
  });
  it('allows Cancelled → Draft to revive a cancelled event', () => {
    expect(canTransition('Cancelled', 'Draft')).toBe(true);
  });
  it('permits Planning ↔ Confirmed', () => {
    expect(canTransition('Planning', 'Confirmed')).toBe(true);
    expect(canTransition('Confirmed', 'Planning')).toBe(true);
  });
});

describe('describeInvalidTransition', () => {
  it('returns null for valid transitions', () => {
    expect(describeInvalidTransition('Draft', 'Active')).toBeNull();
  });
  it('returns an error for invalid transitions', () => {
    expect(describeInvalidTransition('Completed', 'Active')).toMatch(/Cannot transition/);
  });
  it('lets admins bypass invalid transitions', () => {
    expect(describeInvalidTransition('Completed', 'Active', true)).toBeNull();
  });
});

describe('validateEventDate', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('rejects past dates on create unless historical', () => {
    expect(validateEventDate('2024-01-01', { isCreate: true, now })).toMatch(/today or in the future/);
    expect(
      validateEventDate('2024-01-01', { isCreate: true, status: 'Completed', now }),
    ).toBeNull();
  });

  it('accepts today and future dates on create', () => {
    expect(validateEventDate('2026-05-01', { isCreate: true, now })).toBeNull();
    expect(validateEventDate('2027-01-01', { isCreate: true, now })).toBeNull();
  });

  it('allows update to keep an unchanged past date', () => {
    expect(
      validateEventDate('2024-01-01', {
        isCreate: false,
        currentDate: '2024-01-01',
        now,
      }),
    ).toBeNull();
  });

  it('rejects update that moves a non-historical event into the past', () => {
    expect(
      validateEventDate('2024-01-01', {
        isCreate: false,
        currentDate: '2026-06-01',
        status: 'Active',
        now,
      }),
    ).toMatch(/cannot be moved/);
  });

  it('rejects invalid date strings', () => {
    expect(validateEventDate('not-a-date', { isCreate: true, now })).toMatch(/valid date/);
  });

  it('rejects empty date on create', () => {
    expect(validateEventDate('', { isCreate: true, now })).toMatch(/required/);
  });
});
