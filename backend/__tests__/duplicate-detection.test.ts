/**
 * Duplicate-detection unit tests (#435).
 */
import { describe, expect, it } from 'vitest';
import {
  detectDuplicateClusters,
  emailDomain,
  normalizeName,
  normalizePhone,
} from '../src/utils/duplicate-detection';

const baseRow = {
  status: 'Going',
  guests: 1,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

describe('normalizePhone', () => {
  it('strips non-digits and rejects short inputs', () => {
    expect(normalizePhone('(212) 555-0100')).toBe('2125550100');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('normalizeName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeName('  Alice   B  ')).toBe('alice b');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('emailDomain', () => {
  it('extracts the lowercase domain', () => {
    expect(emailDomain('FOO@Example.com')).toBe('example.com');
    expect(emailDomain('not-an-email')).toBeNull();
  });
});

describe('detectDuplicateClusters', () => {
  it('groups records sharing the same normalized phone', () => {
    const rows = [
      { id: 1, name: 'Alice', email: 'a@x.com', phone: '(212) 555-0100', ...baseRow },
      { id: 2, name: 'Alicia', email: 'b@y.com', phone: '212-555-0100', ...baseRow },
      { id: 3, name: 'Bob', email: 'c@z.com', phone: '999-555-0001', ...baseRow },
    ];
    const clusters = detectDuplicateClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('same_phone');
    expect(clusters[0].rsvps.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('groups by normalized name + email domain when both match', () => {
    const rows = [
      { id: 10, name: 'Alex Johnson', email: 'alex@acme.com', phone: null, ...baseRow },
      { id: 11, name: 'alex johnson', email: 'a.johnson@acme.com', phone: null, ...baseRow },
      // Different domain — won't enter the name+domain bucket; the looser
      // name-only pass also won't emit a single-row cluster.
      { id: 12, name: 'Alex Johnson', email: 'alex@other.com', phone: null, ...baseRow },
    ];
    const clusters = detectDuplicateClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('same_name_and_email_domain');
    expect(clusters[0].rsvps.map((r) => r.id).sort()).toEqual([10, 11]);
  });

  it('falls back to name-only when no records share phone or domain', () => {
    const rows = [
      { id: 20, name: 'Sam Lee', email: 'sam@a.com', phone: null, ...baseRow },
      { id: 21, name: 'Sam Lee', email: 'sam@b.com', phone: null, ...baseRow },
    ];
    const clusters = detectDuplicateClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('same_normalized_name');
    expect(clusters[0].rsvps.map((r) => r.id).sort()).toEqual([20, 21]);
  });

  it('does not return clusters with fewer than 2 entries', () => {
    const rows = [{ id: 1, name: 'Solo', email: 'solo@x.com', phone: '555-1111', ...baseRow }];
    expect(detectDuplicateClusters(rows)).toEqual([]);
  });

  it('does not double-count an RSVP across reasons', () => {
    const rows = [
      { id: 1, name: 'Same', email: 'a@x.com', phone: '5551112222', ...baseRow },
      { id: 2, name: 'Same', email: 'b@x.com', phone: '5551112222', ...baseRow },
    ];
    const clusters = detectDuplicateClusters(rows);
    // Both should land in the first (same_phone) cluster; no second cluster
    // should be emitted for the same pair under a name-based reason.
    expect(clusters).toHaveLength(1);
    expect(clusters[0].reason).toBe('same_phone');
  });

  it('chooses the most-recently-updated RSVP as recommended primary', () => {
    const rows = [
      {
        id: 1,
        name: 'Alice',
        email: 'a@x.com',
        phone: '5551110000',
        status: 'Going',
        guests: 1,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'Alice',
        email: 'a2@x.com',
        phone: '5551110000',
        status: 'Going',
        guests: 1,
        created_at: '2026-04-02T00:00:00Z',
        updated_at: '2026-05-05T00:00:00Z',
      },
    ];
    const clusters = detectDuplicateClusters(rows);
    expect(clusters[0].recommendedPrimaryId).toBe(2);
  });
});
