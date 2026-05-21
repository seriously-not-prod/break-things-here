/**
 * Unit tests for the BRD v2 guest/RSVP parity utilities (#529 story).
 *
 * Covers:
 *  - rsvp-taxonomy: legacy string → canonical bucket mapping (#544, #584)
 *  - profile-completeness: deterministic 0-100 scoring (#543, #582)
 *  - template-personalization: `{token}` substitution (#590)
 */
import { describe, expect, it } from 'vitest';
import {
  toCanonicalStatus,
  toLegacyStatus,
  isCanonicalStatus,
  CANONICAL_STATUSES,
  normalizeLegacyRsvpStatusInput,
  RSVP_STATUS_INPUT_ALIAS_LIST,
} from '../src/utils/rsvp-taxonomy';
import { computeProfileCompleteness } from '../src/utils/profile-completeness';
import { personalize, buildGuestTokens } from '../src/utils/template-personalization';

describe('rsvp-taxonomy', () => {
  it('maps legacy free-text statuses to canonical values', () => {
    expect(toCanonicalStatus('Going')).toBe('confirmed');
    expect(toCanonicalStatus('Not Going')).toBe('declined');
    expect(toCanonicalStatus('declined')).toBe('declined');
    expect(toCanonicalStatus('Maybe')).toBe('maybe');
    expect(toCanonicalStatus('cancelled')).toBe('cancelled');
    expect(toCanonicalStatus('Pending')).toBe('pending');
    expect(toCanonicalStatus(null)).toBe('pending');
    expect(toCanonicalStatus('unknown garbage')).toBe('pending');
  });

  it('lets explicit context override the text mapping', () => {
    expect(toCanonicalStatus('Going', { waitlisted: true })).toBe('waitlist');
    expect(toCanonicalStatus('Going', { checkedIn: true })).toBe('checked_in');
    // checkedIn wins over a "declined" text status — the actual scan trumps a
    // stale row state.
    expect(toCanonicalStatus('Declined', { checkedIn: true })).toBe('checked_in');
  });

  it('round-trips canonical → legacy without losing the BRD-required statuses', () => {
    for (const s of CANONICAL_STATUSES) {
      const legacy = toLegacyStatus(s);
      expect(legacy.length).toBeGreaterThan(0);
    }
    expect(isCanonicalStatus('confirmed')).toBe(true);
    expect(isCanonicalStatus('Going')).toBe(false);
  });

  it('normalizes inbound status aliases to persisted legacy values', () => {
    expect(normalizeLegacyRsvpStatusInput('Confirmed')).toBe('Going');
    expect(normalizeLegacyRsvpStatusInput('No Response')).toBe('Pending');
    expect(normalizeLegacyRsvpStatusInput('not_going')).toBe('Not Going');
    expect(normalizeLegacyRsvpStatusInput('declined')).toBe('Declined');
    expect(normalizeLegacyRsvpStatusInput('unknown-status')).toBeNull();
  });

  it('exposes every accepted alias spelling in RSVP_STATUS_INPUT_ALIAS_LIST', () => {
    // The 400-response `allowed` payload uses this list, so every entry
    // must round-trip through the normalizer.
    for (const alias of RSVP_STATUS_INPUT_ALIAS_LIST) {
      expect(normalizeLegacyRsvpStatusInput(alias)).not.toBeNull();
    }
    // Spot-check that the aliases callers used to get back as 400 hints are
    // present beyond the 5 legacy values.
    expect(RSVP_STATUS_INPUT_ALIAS_LIST).toEqual(
      expect.arrayContaining(['Confirmed', 'No Response', 'Tentative', 'Cancelled', 'Rejected']),
    );
  });
});

describe('profile completeness', () => {
  it('scores an empty profile at 0', () => {
    expect(computeProfileCompleteness({})).toBe(0);
  });

  it('scores a fully filled profile at 100', () => {
    const full = {
      name: 'Alex',
      email: 'a@b.com',
      phone: '+1 555 0100',
      address_line1: '1 Main St',
      city: 'Town',
      postal_code: '12345',
      country: 'US',
      company: 'Acme',
      title: 'PM',
      relation_type: 'Friend',
      age_group: 'Adult (18-64)',
      emergency_contact_name: 'Sam',
      emergency_contact_phone: '+1 555 0101',
      dietary_restriction: 'Vegetarian',
      accessibility_needs: 'Wheelchair access',
    };
    expect(computeProfileCompleteness(full)).toBe(100);
  });

  it('treats "None" as unfilled for dietary so the score reflects actual user input', () => {
    const score = computeProfileCompleteness({
      name: 'A',
      email: 'a@b.com',
      dietary_restriction: 'None',
    });
    // Only name + email weighted (12 + 12) out of total 100.
    expect(score).toBe(24);
  });
});

describe('template personalization', () => {
  it('substitutes known tokens case-insensitively', () => {
    const tokens = buildGuestTokens({
      name: 'Alex',
      email: 'a@b.com',
      eventTitle: 'Summer Bash',
      unsubscribeUrl: 'https://x/u/abc',
    });
    expect(personalize('Hello {name} — {EVENT}', tokens)).toBe('Hello Alex — Summer Bash');
    expect(personalize('Unsubscribe: {unsubscribe_url}', tokens)).toBe(
      'Unsubscribe: https://x/u/abc',
    );
  });

  it('leaves unknown tokens intact so typos are visible in preview', () => {
    expect(personalize('Greetings {NOPE}', buildGuestTokens({}))).toBe('Greetings {NOPE}');
  });

  it('returns empty string for null/undefined values rather than the literal word', () => {
    expect(personalize('Hi {name}', buildGuestTokens({ name: null }))).toBe('Hi ');
  });
});
