/**
 * Budget forecasting service tests (#462).
 *
 * The service is mostly arithmetic on the data the DB returns, so we mock
 * `getDatabase` with a small in-memory adapter that answers the queries used
 * by `buildBudgetForecast`.
 */
import { describe, expect, it } from 'vitest';
import { buildBudgetForecast } from '../src/controllers/budget-forecast-controller';
import type { DatabaseAdapter } from '../src/db/database';

interface ExpenseSeed {
  id: number;
  category_id: number | null;
  amount: number;
  amount_base?: number | null;
  currency_code?: string | null;
  payment_status?: string;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  recurrence_end_date?: string | null;
  is_installment?: boolean;
  installment_total?: number | null;
  installment_number?: number | null;
  updated_at?: string;
  created_at?: string;
}

interface CategorySeed {
  id: number;
  name: string;
  allocated_amount: number;
}

function buildDb(input: {
  event: { id: number; date: string; end_date?: string | null; currency_code?: string };
  categories: CategorySeed[];
  expenses: ExpenseSeed[];
  rates?: Array<{ base: string; quote: string; rate: number }>;
}): DatabaseAdapter {
  return {
    async get(sql: string, params?: unknown[]) {
      if (sql.includes('FROM events')) {
        if (input.event.id !== Number((params as unknown[])?.[0])) return undefined;
        return {
          id: input.event.id,
          date: input.event.date,
          end_date: input.event.end_date ?? null,
          currency_code: input.event.currency_code ?? 'USD',
        };
      }
      if (sql.includes('FROM exchange_rates')) {
        const [base, quote] = (params as string[]) ?? [];
        const r = (input.rates ?? []).find((x) => x.base === base && x.quote === quote);
        return r ? { rate: r.rate } : undefined;
      }
      return undefined;
    },
    async all(sql: string, params?: unknown[]) {
      if (sql.includes('FROM budget_categories')) {
        return input.categories.map((c) => ({
          id: c.id,
          event_id: input.event.id,
          name: c.name,
          allocated_amount: String(c.allocated_amount),
          color: '#000',
        }));
      }
      if (sql.includes('FROM expenses')) {
        return input.expenses.map((e) => ({
          ...e,
          amount: String(e.amount),
          amount_base:
            e.amount_base !== undefined && e.amount_base !== null ? String(e.amount_base) : null,
          updated_at: e.updated_at ?? '2026-04-15T00:00:00Z',
          created_at: e.created_at ?? '2026-04-15T00:00:00Z',
          payment_status: e.payment_status ?? 'paid',
          is_recurring: e.is_recurring ?? false,
          recurrence_pattern: e.recurrence_pattern ?? null,
          recurrence_end_date: e.recurrence_end_date ?? null,
          is_installment: e.is_installment ?? false,
          installment_total: e.installment_total ?? null,
          installment_number: e.installment_number ?? null,
          currency_code: e.currency_code ?? null,
        }));
      }
      return [];
    },
    async run() {
      return { changes: 0 };
    },
    async exec() {
      /* noop */
    },
  } as unknown as DatabaseAdapter;
}

describe('buildBudgetForecast', () => {
  it('returns null for an unknown event', async () => {
    const db = buildDb({
      event: { id: 1, date: '2026-06-01' },
      categories: [],
      expenses: [],
    });
    expect(await buildBudgetForecast(db, 999)).toBeNull();
  });

  it('sums actual spend in the base currency', async () => {
    const db = buildDb({
      event: { id: 1, date: '2026-06-01' },
      categories: [{ id: 10, name: 'Food', allocated_amount: 1000 }],
      expenses: [
        { id: 1, category_id: 10, amount: 200, amount_base: 200, currency_code: 'USD' },
        { id: 2, category_id: 10, amount: 100, amount_base: 100, currency_code: 'USD' },
      ],
    });
    const forecast = await buildBudgetForecast(db, 1, new Date('2026-05-15T00:00:00Z'));
    expect(forecast).not.toBeNull();
    expect(forecast!.totals.actualSpent).toBe(300);
    expect(forecast!.categories[0].name).toBe('Food');
    expect(forecast!.categories[0].actualSpent).toBe(300);
  });

  it('projects pending recurring expenses', async () => {
    // Now: 2026-05-01, event end: 2026-08-01, monthly recurring expense ⇒ ~3 cycles
    const db = buildDb({
      event: { id: 1, date: '2026-08-01' },
      categories: [{ id: 10, name: 'Venue', allocated_amount: 5000 }],
      expenses: [
        {
          id: 1,
          category_id: 10,
          amount: 1000,
          amount_base: 1000,
          currency_code: 'USD',
          is_recurring: true,
          recurrence_pattern: 'monthly',
        },
      ],
    });
    const forecast = await buildBudgetForecast(db, 1, new Date('2026-05-01T00:00:00Z'));
    expect(forecast!.categories[0].pendingRecurring).toBeGreaterThan(0);
    // ~3 months = 3 * 1000 (allowing 2-3 due to integer day arithmetic)
    expect(forecast!.categories[0].pendingRecurring).toBeGreaterThanOrEqual(2000);
  });

  it('warns when an expense currency cannot be converted', async () => {
    const db = buildDb({
      event: { id: 1, date: '2026-06-01', currency_code: 'USD' },
      categories: [{ id: 10, name: 'Misc', allocated_amount: 100 }],
      expenses: [{ id: 1, category_id: 10, amount: 50, amount_base: null, currency_code: 'XYZ' }],
      rates: [],
    });
    const forecast = await buildBudgetForecast(db, 1, new Date('2026-05-01T00:00:00Z'));
    expect(forecast!.warnings.length).toBe(1);
    expect(forecast!.warnings[0]).toMatch(/Expense #1/);
    expect(forecast!.totals.actualSpent).toBe(0);
  });

  it('marks a category over when forecast exceeds 105% of allocated', async () => {
    const db = buildDb({
      event: { id: 1, date: '2026-06-01' },
      categories: [{ id: 10, name: 'Decor', allocated_amount: 100 }],
      expenses: [{ id: 1, category_id: 10, amount: 200, amount_base: 200, currency_code: 'USD' }],
    });
    const forecast = await buildBudgetForecast(db, 1, new Date('2026-05-15T00:00:00Z'));
    expect(forecast!.categories[0].status).toBe('over');
  });
});
