/**
 * Frontend service for currency / exchange-rate management (#461) and
 * budget forecast (#462).
 */
import { api } from '../lib/api-client';

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

export interface ExchangeRate {
  base_currency: string;
  quote_currency: string;
  rate: string | number;
  source: string;
  fetched_at: string;
}

export async function listSupportedCurrencies(): Promise<SupportedCurrency[]> {
  const data = await api.get<{ currencies: SupportedCurrency[] }>('/api/currency/supported');
  return data.currencies;
}

export async function listExchangeRates(): Promise<ExchangeRate[]> {
  const data = await api.get<{ rates: ExchangeRate[] }>('/api/currency/rates');
  return data.rates;
}

export async function setExchangeRate(payload: {
  base: string;
  quote: string;
  rate: number;
  source?: string;
}): Promise<void> {
  await api.put('/api/currency/rates', payload);
}

export async function deleteExchangeRate(base: string, quote: string): Promise<void> {
  await api.delete(`/api/currency/rates/${base}/${quote}`);
}

export interface CategoryForecast {
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

export async function getBudgetForecast(eventId: number | string): Promise<BudgetForecast> {
  const data = await api.get<{ forecast: BudgetForecast }>(
    `/api/events/${eventId}/budget/forecast`,
  );
  return data.forecast;
}

export function formatCurrency(amount: number, code: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(amount);
  } catch {
    // Unknown ISO code (e.g. unrecognized 3-letter input) — fall back to plain.
    return `${code} ${amount.toFixed(2)}`;
  }
}
