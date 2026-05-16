/**
 * Budget forecasting service (#418, #462).
 *
 * Forecast methodology — kept explainable on purpose so the UI can surface
 * the assumptions:
 *
 *   1. Confirmed actuals: every expense's amount, converted to the event's
 *      base currency (using stored `amount_base` when available, otherwise the
 *      most recent rate from `exchange_rates`).
 *   2. Pending recurrences: recurring expenses fire forward at their cadence
 *      until either `recurrence_end_date` or the event's date.
 *   3. Pending installments: installments not yet logged (#449 leaves the
 *      remainder field blank — we infer remaining instalments).
 *   4. Trend projection: linear extrapolation of the last 4 weeks of spend per
 *      category, capped at the category's allocated_amount.
 *
 * Output is per-category and per-event so the chart on the budget page can
 * render projected vs. allocated bars without further math on the client.
 */

import type { Request, Response } from 'express';
import { getDatabase, type DatabaseAdapter } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { convertAmount, normalizeCurrencyCode } from '../utils/currency.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface ExpenseRow {
  id: number;
  category_id: number | null;
  amount: string;
  amount_base: string | null;
  currency_code: string | null;
  payment_status: string;
  is_recurring: boolean | null;
  recurrence_pattern: string | null;
  recurrence_end_date: string | null;
  is_installment: boolean | null;
  installment_total: number | null;
  installment_number: number | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRow {
  id: number;
  event_id: number;
  name: string;
  allocated_amount: string;
  color: string | null;
}

interface EventRow {
  id: number;
  date: string;
  end_date: string | null;
  currency_code: string;
}

interface CategoryForecast {
  categoryId: number | null;
  name: string;
  allocatedAmount: number;
  actualSpent: number;
  pendingRecurring: number;
  pendingInstallments: number;
  trendProjection: number;
  forecastTotal: number;
  variance: number;
  status: 'under' | 'on_track' | 'over';
}

export interface BudgetForecast {
  eventId: number;
  baseCurrency: string;
  asOf: string;
  totals: {
    allocatedAmount: number;
    actualSpent: number;
    forecastTotal: number;
    variance: number;
  };
  categories: CategoryForecast[];
  warnings: string[];
}

const RECURRENCE_INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

function parseEventDate(event: EventRow, now: Date): Date {
  const endRef = event.end_date ?? event.date;
  const parsed = new Date(endRef);
  if (!isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(`${endRef}T00:00:00Z`);
  return isNaN(fallback.getTime()) ? now : fallback;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function dayDiff(a: Date, b: Date): number {
  return Math.max(0, Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000));
}

async function expenseAmountInBase(
  db: DatabaseAdapter,
  expense: ExpenseRow,
  baseCurrency: string,
): Promise<number | null> {
  if (expense.amount_base !== null && expense.amount_base !== undefined) {
    const v = Number(expense.amount_base);
    if (Number.isFinite(v)) return v;
  }
  const fromCurrency = normalizeCurrencyCode(expense.currency_code ?? baseCurrency, baseCurrency);
  const amount = Number(expense.amount);
  if (!Number.isFinite(amount)) return null;
  if (fromCurrency === baseCurrency) return amount;
  const conv = await convertAmount(db, amount, fromCurrency, baseCurrency);
  return conv ? conv.amount : null;
}

export async function buildBudgetForecast(
  db: DatabaseAdapter,
  eventId: number,
  now: Date = new Date(),
): Promise<BudgetForecast | null> {
  const event = await db.get<EventRow>(
    `SELECT id, date, end_date, COALESCE(currency_code, 'USD') AS currency_code
     FROM events WHERE id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  if (!event) return null;
  const baseCurrency = normalizeCurrencyCode(event.currency_code);

  const categories = await db.all<CategoryRow>(
    `SELECT id, event_id, name, allocated_amount, color
     FROM budget_categories WHERE event_id = $1 ORDER BY name`,
    [eventId],
  );
  const expenses = await db.all<ExpenseRow>(
    `SELECT id, category_id, amount, amount_base, currency_code, payment_status,
            is_recurring, recurrence_pattern, recurrence_end_date,
            is_installment, installment_total, installment_number,
            created_at, updated_at
     FROM expenses WHERE event_id = $1`,
    [eventId],
  );

  const eventEnd = parseEventDate(event, now);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000);

  const forecasts = new Map<number | null, CategoryForecast>();
  const warnings: string[] = [];

  function ensure(cat: CategoryRow | null): CategoryForecast {
    const key = cat ? cat.id : null;
    let f = forecasts.get(key);
    if (!f) {
      f = {
        categoryId: key,
        name: cat ? cat.name : 'Uncategorized',
        allocatedAmount: cat ? Number(cat.allocated_amount) || 0 : 0,
        actualSpent: 0,
        pendingRecurring: 0,
        pendingInstallments: 0,
        trendProjection: 0,
        forecastTotal: 0,
        variance: 0,
        status: 'under',
      };
      forecasts.set(key, f);
    }
    return f;
  }
  for (const cat of categories) ensure(cat);

  for (const exp of expenses) {
    const cat = exp.category_id !== null
      ? categories.find((c) => c.id === exp.category_id) ?? null
      : null;
    const bucket = ensure(cat);

    const baseAmount = await expenseAmountInBase(db, exp, baseCurrency);
    if (baseAmount === null) {
      warnings.push(`Expense #${exp.id}: rate ${exp.currency_code ?? '?'}→${baseCurrency} unavailable.`);
      continue;
    }

    bucket.actualSpent += baseAmount;

    // Project pending recurring expenses
    if (exp.is_recurring && exp.recurrence_pattern) {
      const interval = RECURRENCE_INTERVAL_DAYS[exp.recurrence_pattern];
      if (interval) {
        const horizonEnd = exp.recurrence_end_date
          ? new Date(`${exp.recurrence_end_date}T00:00:00Z`)
          : eventEnd;
        const horizon = horizonEnd < eventEnd ? horizonEnd : eventEnd;
        if (horizon > now) {
          const cycles = Math.floor(dayDiff(horizon, now) / interval);
          bucket.pendingRecurring += cycles * baseAmount;
        }
      }
    }

    // Project pending installments
    if (
      exp.is_installment &&
      typeof exp.installment_total === 'number' &&
      typeof exp.installment_number === 'number' &&
      exp.installment_total > exp.installment_number
    ) {
      const remaining = exp.installment_total - exp.installment_number;
      bucket.pendingInstallments += remaining * baseAmount;
    }
  }

  // Trend projection — last 4 weeks per category
  for (const cat of categories) {
    const recent = expenses.filter(
      (e) => e.category_id === cat.id && new Date(e.updated_at) >= fourWeeksAgo,
    );
    if (recent.length < 2) continue;
    let recentTotal = 0;
    for (const e of recent) {
      const v = await expenseAmountInBase(db, e, baseCurrency);
      if (v !== null) recentTotal += v;
    }
    const dailyRate = recentTotal / 28;
    const daysToEvent = Math.max(0, dayDiff(eventEnd, now));
    const projected = dailyRate * daysToEvent;
    const bucket = ensure(cat);
    // Cap trend projection at the allocated amount so a runaway trend doesn't
    // dwarf actual + recurring totals.
    bucket.trendProjection = Math.min(projected, bucket.allocatedAmount);
  }

  let allocatedTotal = 0;
  let actualTotal = 0;
  let forecastTotal = 0;
  for (const f of forecasts.values()) {
    f.forecastTotal = f.actualSpent + f.pendingRecurring + f.pendingInstallments + f.trendProjection;
    f.variance = f.forecastTotal - f.allocatedAmount;
    f.status = f.allocatedAmount === 0
      ? f.forecastTotal > 0
        ? 'over'
        : 'under'
      : f.forecastTotal >= f.allocatedAmount * 1.05
        ? 'over'
        : f.forecastTotal >= f.allocatedAmount * 0.85
          ? 'on_track'
          : 'under';
    allocatedTotal += f.allocatedAmount;
    actualTotal += f.actualSpent;
    forecastTotal += f.forecastTotal;
  }

  return {
    eventId,
    baseCurrency,
    asOf: now.toISOString(),
    totals: {
      allocatedAmount: allocatedTotal,
      actualSpent: actualTotal,
      forecastTotal,
      variance: forecastTotal - allocatedTotal,
    },
    categories: Array.from(forecasts.values()).sort((a, b) => a.name.localeCompare(b.name)),
    warnings,
  };
}

/** GET /api/events/:eventId/budget/forecast */
export async function getBudgetForecast(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  try {
    const forecast = await buildBudgetForecast(getDatabase(), Number(eventId));
    if (!forecast) return res.status(404).json({ error: 'Event not found.' });
    return res.json({ forecast });
  } catch (err) {
    console.error('getBudgetForecast failed:', err);
    return res.status(500).json({ error: 'Forecast failed.' });
  }
}
