/**
 * Budget Service
 * API client functions for budget categories and expenses.
 * BRD section 3.4 / Issue #374
 */

import { api } from '../lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetCategory {
  id: number;
  event_id: number;
  name: string;
  allocated_amount: number;
  color: string | null;
  created_at: string;
  spent: number;
}

export interface Expense {
  id: number;
  event_id: number;
  category_id: number;
  category_name: string | null;
  title: string;
  amount: number;
  payment_status: 'pending' | 'paid' | 'overdue';
  vendor_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface BudgetSummary {
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  percentUsed: number;
}

export function computeSummary(categories: BudgetCategory[]): BudgetSummary {
  const totalAllocated = categories.reduce((sum, c) => sum + c.allocated_amount, 0);
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const remaining = totalAllocated - totalSpent;
  const percentUsed = totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;
  return { totalAllocated, totalSpent, remaining, percentUsed };
}

// ─── Category API ──────────────────────────────────────────────────────────────

export async function listCategories(eventId: number | string): Promise<BudgetCategory[]> {
  const data = await api.get<{ categories: BudgetCategory[] }>(
    `/api/events/${eventId}/budget/categories`,
  );
  return data.categories;
}

export interface CreateCategoryPayload {
  name: string;
  allocated_amount: number;
  color: string | null;
}

export async function createCategory(
  eventId: number | string,
  payload: CreateCategoryPayload,
): Promise<BudgetCategory> {
  const data = await api.post<{ category: BudgetCategory }>(
    `/api/events/${eventId}/budget/categories`,
    payload,
  );
  return data.category;
}

export async function updateCategory(
  eventId: number | string,
  categoryId: number,
  payload: CreateCategoryPayload,
): Promise<BudgetCategory> {
  const data = await api.put<{ category: BudgetCategory }>(
    `/api/events/${eventId}/budget/categories/${categoryId}`,
    payload,
  );
  return data.category;
}

export async function deleteCategory(
  eventId: number | string,
  categoryId: number,
): Promise<void> {
  await api.delete<void>(`/api/events/${eventId}/budget/categories/${categoryId}`);
}

// ─── Expense API ───────────────────────────────────────────────────────────────

export async function listExpenses(eventId: number | string): Promise<Expense[]> {
  const data = await api.get<{ expenses: Expense[] }>(`/api/events/${eventId}/expenses`);
  return data.expenses;
}

export interface CreateExpensePayload {
  title: string;
  amount: number;
  category_id: number;
  payment_status: 'pending' | 'paid' | 'overdue';
  vendor_name: string | null;
  notes: string | null;
}

export async function createExpense(
  eventId: number | string,
  payload: CreateExpensePayload,
): Promise<Expense> {
  const data = await api.post<{ expense: Expense }>(`/api/events/${eventId}/expenses`, payload);
  return data.expense;
}

export async function updateExpense(
  eventId: number | string,
  expenseId: number,
  payload: CreateExpensePayload,
): Promise<Expense> {
  const data = await api.put<{ expense: Expense }>(
    `/api/events/${eventId}/expenses/${expenseId}`,
    payload,
  );
  return data.expense;
}

export async function deleteExpense(
  eventId: number | string,
  expenseId: number,
): Promise<void> {
  await api.delete<void>(`/api/events/${eventId}/expenses/${expenseId}`);
}
