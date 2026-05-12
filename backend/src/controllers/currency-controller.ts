/**
 * Currency / exchange-rate management endpoints (#418, #461).
 *
 * Rates are read-mostly; the writer is the planner (manual override) or a
 * scheduled refresher (`services/exchange-rate-refresher.ts`). Both paths go
 * through `upsertExchangeRate` so validation is consistent.
 */

import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import {
  isValidCurrencyCode,
  normalizeCurrencyCode,
  upsertExchangeRate,
} from '../utils/currency.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return false;
  }
  // role_id 2 = Organizer, 3 = Admin. Only Admins manage global FX rates.
  if (req.user.role_id < 3) {
    res.status(403).json({ error: 'Admin role required.' });
    return false;
  }
  return true;
}

/** GET /api/currency/rates */
export async function listRates(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const rows = await db.all(
    `SELECT base_currency, quote_currency, rate, source, fetched_at
     FROM exchange_rates ORDER BY base_currency, quote_currency`,
  );
  return res.json({ rates: rows });
}

/** PUT /api/currency/rates  — Body: { base, quote, rate, source? } */
export async function setRate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!requireAdmin(authReq, res)) return res;

  const { base, quote, rate, source } = (req.body ?? {}) as {
    base?: unknown;
    quote?: unknown;
    rate?: unknown;
    source?: unknown;
  };
  if (!isValidCurrencyCode(base) || !isValidCurrencyCode(quote)) {
    return res.status(400).json({ error: 'base and quote must be ISO 4217 codes.' });
  }
  const r = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(r) || r <= 0) {
    return res.status(400).json({ error: 'rate must be a positive number.' });
  }
  const baseN = normalizeCurrencyCode(base);
  const quoteN = normalizeCurrencyCode(quote);
  if (baseN === quoteN) {
    return res.status(400).json({ error: 'base and quote must differ.' });
  }

  const db = getDatabase();
  await upsertExchangeRate(
    db,
    baseN,
    quoteN,
    r,
    typeof source === 'string' && source.trim() ? source.trim() : 'manual',
  );
  return res.status(204).send();
}

/** DELETE /api/currency/rates/:base/:quote */
export async function deleteRate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!requireAdmin(authReq, res)) return res;
  const base = normalizeCurrencyCode(req.params.base);
  const quote = normalizeCurrencyCode(req.params.quote);
  const db = getDatabase();
  await db.run(
    'DELETE FROM exchange_rates WHERE base_currency = ? AND quote_currency = ?',
    [base, quote],
  );
  return res.status(204).send();
}

/** GET /api/currency/supported  — static list used by the budget UI */
export async function listSupportedCurrencies(_req: Request, res: Response): Promise<Response> {
  // The list is intentionally short — it covers the currencies for which a
  // refresher provider is configured plus a few common defaults.
  return res.json({
    currencies: [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
      { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
      { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
    ],
  });
}
