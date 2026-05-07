/**
 * Currency normalization and exchange-rate lookup helpers (#461).
 *
 * Rates are stored in `exchange_rates(base_currency, quote_currency, rate)` and
 * represent: 1 unit of base = `rate` units of quote. We treat the table as the
 * source of truth and never reach the network synchronously from a request —
 * the optional refresher in `services/exchange-rate-refresher.ts` is the only
 * place that hits an external provider, and it can be swapped or seeded for
 * tests via `EXCHANGE_RATE_PROVIDER=fixed`.
 */

import type { DatabaseAdapter } from '../db/database.js';

const ISO_4217_RE = /^[A-Z]{3}$/;

export function normalizeCurrencyCode(input: unknown, fallback = 'USD'): string {
  if (typeof input !== 'string') return fallback;
  const code = input.trim().toUpperCase();
  return ISO_4217_RE.test(code) ? code : fallback;
}

export function isValidCurrencyCode(input: unknown): boolean {
  return typeof input === 'string' && ISO_4217_RE.test(input.trim().toUpperCase());
}

export interface ExchangeRateRow {
  base_currency: string;
  quote_currency: string;
  rate: string | number;
  source: string;
  fetched_at: string;
}

/**
 * Look up the conversion rate from `from` → `to`. Returns 1 when currencies
 * match. Returns null when the pair is unknown so callers can decide how to
 * handle the gap — totals fall back to displaying the original amount with a
 * "rate unavailable" note rather than silently using 1.
 */
export async function getExchangeRate(
  db: DatabaseAdapter,
  from: string,
  to: string,
): Promise<number | null> {
  const fromN = normalizeCurrencyCode(from);
  const toN = normalizeCurrencyCode(to);
  if (fromN === toN) return 1;

  const direct = await db.get<ExchangeRateRow>(
    'SELECT rate FROM exchange_rates WHERE base_currency = ? AND quote_currency = ?',
    [fromN, toN],
  );
  if (direct) {
    const rate = Number(direct.rate);
    if (Number.isFinite(rate) && rate > 0) return rate;
  }

  // Fall back to the inverse pair.
  const inverse = await db.get<ExchangeRateRow>(
    'SELECT rate FROM exchange_rates WHERE base_currency = ? AND quote_currency = ?',
    [toN, fromN],
  );
  if (inverse) {
    const rate = Number(inverse.rate);
    if (Number.isFinite(rate) && rate > 0) return 1 / rate;
  }

  return null;
}

export async function convertAmount(
  db: DatabaseAdapter,
  amount: number,
  from: string,
  to: string,
): Promise<{ amount: number; rate: number } | null> {
  const rate = await getExchangeRate(db, from, to);
  if (rate === null) return null;
  return { amount: amount * rate, rate };
}

/** Insert or update a single rate row. */
export async function upsertExchangeRate(
  db: DatabaseAdapter,
  base: string,
  quote: string,
  rate: number,
  source = 'manual',
): Promise<void> {
  const baseN = normalizeCurrencyCode(base);
  const quoteN = normalizeCurrencyCode(quote);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Exchange rate must be a positive finite number.');
  }
  await db.run(
    `INSERT INTO exchange_rates (base_currency, quote_currency, rate, source, fetched_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (base_currency, quote_currency)
     DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, fetched_at = EXCLUDED.fetched_at`,
    [baseN, quoteN, rate, source],
  );
}
