/**
 * Custom RSVP question response validation tests (#443).
 */
import { describe, expect, it } from 'vitest';
import { validateAndNormalizeResponse } from '../src/controllers/rsvp-questions-controller';

const baseQ = { id: 1, event_id: 1, prompt: 'Q', sort_order: 0, options: null, required: false };

describe('validateAndNormalizeResponse', () => {
  it('rejects empty answer when required', () => {
    const result = validateAndNormalizeResponse(
      { ...baseQ, question_type: 'short_text', required: true },
      '',
    );
    expect('error' in result).toBe(true);
  });

  it('treats empty input as null when not required', () => {
    const result = validateAndNormalizeResponse({ ...baseQ, question_type: 'short_text' }, '');
    expect(result).toEqual({ value: null });
  });

  it('coerces booleans from common truthy/falsy strings', () => {
    expect(validateAndNormalizeResponse({ ...baseQ, question_type: 'boolean' }, 'true')).toEqual({
      value: 'true',
    });
    expect(validateAndNormalizeResponse({ ...baseQ, question_type: 'boolean' }, 0)).toEqual({
      value: 'false',
    });
    expect(
      validateAndNormalizeResponse({ ...baseQ, question_type: 'boolean' }, 'maybe'),
    ).toMatchObject({ error: expect.any(String) });
  });

  it('validates numbers', () => {
    expect(validateAndNormalizeResponse({ ...baseQ, question_type: 'number' }, '42')).toEqual({
      value: '42',
    });
    expect(
      validateAndNormalizeResponse({ ...baseQ, question_type: 'number' }, 'abc'),
    ).toMatchObject({ error: expect.any(String) });
  });

  it('enforces single_choice options', () => {
    const q = { ...baseQ, question_type: 'single_choice' as const, options: ['A', 'B'] };
    expect(validateAndNormalizeResponse(q, 'A')).toEqual({ value: 'A' });
    expect(validateAndNormalizeResponse(q, 'C')).toMatchObject({ error: expect.any(String) });
  });

  it('enforces multi_choice options and dedupes', () => {
    const q = { ...baseQ, question_type: 'multi_choice' as const, options: ['X', 'Y', 'Z'] };
    expect(validateAndNormalizeResponse(q, ['X', 'Y', 'X'])).toEqual({
      value: JSON.stringify(['X', 'Y']),
    });
    expect(validateAndNormalizeResponse(q, ['X', 'NOPE'])).toMatchObject({
      error: expect.any(String),
    });
  });

  it('rejects long_text exceeding 2000 chars', () => {
    const q = { ...baseQ, question_type: 'long_text' as const };
    expect(validateAndNormalizeResponse(q, 'x'.repeat(2001))).toMatchObject({
      error: expect.any(String),
    });
  });
});
