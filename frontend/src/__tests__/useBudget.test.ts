import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBudget } from '../hooks/useBudget';

// ──────────────────────────────────────────────────────────────────────────────
// Mock the API client
// ──────────────────────────────────────────────────────────────────────────────
vi.mock('../lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { api } from '../lib/api-client';

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const BUDGET_RESPONSE = {
  budget: { id: 1, event_id: 42, total_budget: 5000, currency: 'USD', notes: null },
  summary: { total_budget: 5000, total_spent: 200, remaining: 4800 },
  breakdown: [{ category: 'Food', color: '#f00', amount: 200 }],
};

const EXPENSES_RESPONSE = {
  expenses: [
    { id: 10, event_id: 42, category_id: 1, title: 'Catering', amount: 200, paid_by: 'Alice', receipt_url: null, status: 'Pending', notes: null, category_name: 'Food', category_color: '#f00' },
  ],
};

const CATEGORIES_RESPONSE = {
  categories: [{ id: 1, name: 'Food', description: null, color: '#f00' }],
};

function setupApiMocks() {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes('/budget')) return Promise.resolve(BUDGET_RESPONSE);
    if (url.includes('/expenses')) return Promise.resolve(EXPENSES_RESPONSE);
    if (url.includes('/expense-categories')) return Promise.resolve(CATEGORIES_RESPONSE);
    return Promise.resolve({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupApiMocks();
});

describe('useBudget', () => {
  it('loads budget, expenses, and categories on mount', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.budget).not.toBeNull());

    expect(result.current.budget?.total_budget).toBe(5000);
    expect(result.current.expenses).toHaveLength(1);
    expect(result.current.categories).toHaveLength(1);
    expect(result.current.budgetSummary?.remaining).toBe(4800);
  });

  it('does not load data when eventId is undefined', async () => {
    const { result } = renderHook(() => useBudget(undefined));
    // Small wait to confirm nothing loaded
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.budget).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('openBudgetDialog populates budgetForm from existing budget', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.budget).not.toBeNull());

    act(() => result.current.openBudgetDialog());

    expect(result.current.budgetDialog).toBe(true);
    expect(result.current.budgetForm.total_budget).toBe('5000');
    expect(result.current.budgetForm.currency).toBe('USD');
  });

  it('openAddExpense resets expenseForm and opens dialog', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.budget).not.toBeNull());

    act(() => result.current.openAddExpense());

    expect(result.current.expenseDialog).toBe(true);
    expect(result.current.expenseForm.title).toBe('');
    expect(result.current.editExpenseId).toBeNull();
  });

  it('openEditExpense populates expenseForm with selected expense data', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.expenses).toHaveLength(1));

    act(() => result.current.openEditExpense(result.current.expenses[0]));

    expect(result.current.expenseDialog).toBe(true);
    expect(result.current.editExpenseId).toBe(10);
    expect(result.current.expenseForm.title).toBe('Catering');
    expect(result.current.expenseForm.amount).toBe('200');
  });

  it('deleteExpense sets deleteConfirmId without immediately deleting', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.expenses).toHaveLength(1));

    await act(async () => { await result.current.deleteExpense(10); });

    expect(result.current.deleteConfirmId).toBe(10);
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('confirmDeleteExpense calls API delete and reloads data', async () => {
    mockApi.delete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.expenses).toHaveLength(1));

    // Open confirm dialog
    await act(async () => { await result.current.deleteExpense(10); });
    expect(result.current.deleteConfirmId).toBe(10);

    // Confirm the delete
    await act(async () => { await result.current.confirmDeleteExpense(); });

    expect(mockApi.delete).toHaveBeenCalledWith('/api/events/42/expenses/10');
    expect(result.current.deleteConfirmId).toBeNull();
  });

  it('setDeleteConfirmId(null) cancels pending delete', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.expenses).toHaveLength(1));

    await act(async () => { await result.current.deleteExpense(10); });
    expect(result.current.deleteConfirmId).toBe(10);

    act(() => result.current.setDeleteConfirmId(null));
    expect(result.current.deleteConfirmId).toBeNull();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('saveBudget rejects non-finite total_budget', async () => {
    const { result } = renderHook(() => useBudget('42'));
    await waitFor(() => expect(result.current.budget).not.toBeNull());

    act(() => result.current.openBudgetDialog());
    act(() => result.current.setBudgetForm((p) => ({ ...p, total_budget: 'abc' })));

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
    await act(async () => { await result.current.saveBudget(fakeEvent); });

    expect(result.current.budgetError).toMatch(/valid/i);
    expect(mockApi.put).not.toHaveBeenCalled();
  });
});

// need React import for FormEvent type used in the test above
import type React from 'react';
