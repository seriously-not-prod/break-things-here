/**
 * Currency utility tests (#461).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  convertAmount,
  getExchangeRate,
  isValidCurrencyCode,
  normalizeCurrencyCode,
} from '../src/utils/currency';
import type { DatabaseAdapter } from '../src/db/database';

function makeDb(rows: Array<{ base: string; quote: string; rate: number }>): DatabaseAdapter {
  return {
    async get(_sql: string, params?: unknown[]) {
      const [base, quote] = (params as string[]) ?? [];
      const row = rows.find((r) => r.base === base && r.quote === quote);
      return row ? { rate: row.rate } : undefined;
    },
    async all() {
      return [];
    },
    async run() {
      return { changes: 0 };
    },
    async exec() {
      /* no-op */
    },
  } as unknown as DatabaseAdapter;
}

describe('normalizeCurrencyCode', () => {
  it('uppercases and trims valid ISO codes', () => {
    expect(normalizeCurrencyCode('  usd ')).toBe('USD');
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
  });

  it('falls back when input is invalid', () => {
    expect(normalizeCurrencyCode('US')).toBe('USD');
    expect(normalizeCurrencyCode(123)).toBe('USD');
    expect(normalizeCurrencyCode(undefined, 'EUR')).toBe('EUR');
  });
});

describe('isValidCurrencyCode', () => {
  it.each([
    ['USD', true],
    ['eur', true],
    ['US', false],
    ['USDX', false],
    [123, false],
  ])('treats %p as %p', (input, expected) => {
    expect(isValidCurrencyCode(input)).toBe(expected);
  });
});

describe('getExchangeRate', () => {
  it('returns 1 when currencies match', async () => {
    const db = makeDb([]);
    expect(await getExchangeRate(db, 'USD', 'usd')).toBe(1);
  });

  it('returns the direct rate when present', async () => {
    const db = makeDb([{ base: 'USD', quote: 'EUR', rate: 0.85 }]);
    expect(await getExchangeRate(db, 'USD', 'EUR')).toBeCloseTo(0.85);
  });

  it('falls back to the inverse pair', async () => {
    const db = makeDb([{ base: 'EUR', quote: 'USD', rate: 1.176 }]);
    const rate = await getExchangeRate(db, 'USD', 'EUR');
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(1 / 1.176, 5);
  });

  it('returns null when the pair is unknown', async () => {
    const db = makeDb([]);
    expect(await getExchangeRate(db, 'USD', 'XYZ')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('returns null when no rate is available', async () => {
    const db = makeDb([]);
    expect(await convertAmount(db, 100, 'USD', 'XYZ')).toBeNull();
  });

  it('multiplies by the rate', async () => {
    const db = makeDb([{ base: 'USD', quote: 'EUR', rate: 0.5 }]);
    const result = await convertAmount(db, 100, 'USD', 'EUR');
    expect(result?.amount).toBeCloseTo(50);
    expect(result?.rate).toBeCloseTo(0.5);
  });
});
