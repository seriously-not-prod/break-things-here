import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api-client';

export interface ExpenseCategory {
  id: number;
  name: string;
  description: string | null;
  color: string;
}

export interface Budget {
  id: number;
  event_id: number;
  total_budget: number;
  currency: string;
  notes: string | null;
}

export interface BudgetSummary {
  total_budget: number;
  total_spent: number;
  remaining: number;
}

export interface BudgetBreakdown {
  category: string;
  color: string;
  amount: number;
}

export interface Expense {
  id: number;
  event_id: number;
  category_id: number | null;
  title: string;
  amount: number;
  paid_by: string | null;
  receipt_url: string | null;
  status: string;
  notes: string | null;
  category_name: string | null;
  category_color: string | null;
}

export interface BudgetFormState {
  total_budget: string;
  currency: string;
  notes: string;
}

export interface ExpenseFormState {
  title: string;
  amount: string;
  category_id: string;
  paid_by: string;
  status: string;
  notes: string;
}

export function useBudget(eventId: string | undefined) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [breakdown, setBreakdown] = useState<BudgetBreakdown[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Budget dialog
  const [budgetDialog, setBudgetDialog] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>({ total_budget: '', currency: 'USD', notes: '' });
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // Expense dialog
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<number | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({ title: '', amount: '', category_id: '', paid_by: '', status: 'Pending', notes: '' });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  // Delete confirmation dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const loadBudgetData = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    const [budgetData, expensesData, categoriesData] = await Promise.all([
      api.get<{ budget: Budget | null; summary: BudgetSummary | null; breakdown: BudgetBreakdown[] }>(`/api/events/${eventId}/budget`).catch(() => ({ budget: null, summary: null, breakdown: [] })),
      api.get<{ expenses: Expense[] }>(`/api/events/${eventId}/expenses`).catch(() => ({ expenses: [] })),
      api.get<{ categories: ExpenseCategory[] }>('/api/expense-categories').catch(() => ({ categories: [] })),
    ]);
    setBudget(budgetData.budget);
    setBudgetSummary(budgetData.summary ?? null);
    setBreakdown(budgetData.breakdown ?? []);
    setExpenses(expensesData.expenses ?? []);
    setCategories(categoriesData.categories ?? []);
  }, [eventId]);

  useEffect(() => { void loadBudgetData(); }, [loadBudgetData]);

  function openBudgetDialog(): void {
    setBudgetForm({
      total_budget: budget ? String(budget.total_budget) : '',
      currency: budget?.currency ?? 'USD',
      notes: budget?.notes ?? '',
    });
    setBudgetError(null);
    setBudgetDialog(true);
  }

  async function saveBudget(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBudgetError(null);
    const numBudget = Number(budgetForm.total_budget);
    // Issue 10: guard against NaN before calling API
    if (!Number.isFinite(numBudget) || numBudget < 0) {
      setBudgetError('Total budget must be a valid non-negative number.');
      return;
    }
    setBudgetSaving(true);
    try {
      await api.put(`/api/events/${eventId}/budget`, {
        total_budget: numBudget,
        currency: budgetForm.currency || 'USD',
        notes: budgetForm.notes || null,
      });
      setBudgetDialog(false);
      await loadBudgetData();
    } catch (err) {
      setBudgetError(err instanceof ApiError ? err.message : 'Failed to save budget.');
    } finally {
      setBudgetSaving(false);
    }
  }

  function openAddExpense(): void {
    setEditExpenseId(null);
    setExpenseForm({ title: '', amount: '', category_id: '', paid_by: '', status: 'Pending', notes: '' });
    setExpenseError(null);
    setExpenseDialog(true);
  }

  function openEditExpense(exp: Expense): void {
    setEditExpenseId(exp.id);
    setExpenseForm({
      title: exp.title,
      amount: String(exp.amount),
      category_id: exp.category_id ? String(exp.category_id) : '',
      paid_by: exp.paid_by ?? '',
      status: exp.status,
      notes: exp.notes ?? '',
    });
    setExpenseError(null);
    setExpenseDialog(true);
  }

  async function saveExpense(e: FormEvent): Promise<void> {
    e.preventDefault();
    setExpenseError(null);
    setExpenseSaving(true);
    try {
      const payload = {
        title: expenseForm.title,
        amount: Number(expenseForm.amount),
        category_id: expenseForm.category_id ? Number(expenseForm.category_id) : null,
        paid_by: expenseForm.paid_by || null,
        status: expenseForm.status,
        notes: expenseForm.notes || null,
      };
      if (editExpenseId) {
        await api.patch(`/api/events/${eventId}/expenses/${editExpenseId}`, payload);
      } else {
        await api.post(`/api/events/${eventId}/expenses`, payload);
      }
      setExpenseDialog(false);
      await loadBudgetData();
    } catch (err) {
      setExpenseError(err instanceof ApiError ? err.message : 'Failed to save expense.');
    } finally {
      setExpenseSaving(false);
    }
  }

  async function deleteExpense(expenseId: number): Promise<void> {
    setDeleteConfirmId(expenseId);
  }

  async function confirmDeleteExpense(): Promise<void> {
    if (deleteConfirmId === null) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    await api.delete(`/api/events/${eventId}/expenses/${id}`).catch(() => undefined);
    await loadBudgetData();
  }

  return {
    // Data
    budget,
    budgetSummary,
    breakdown,
    expenses,
    categories,
    // Budget dialog
    budgetDialog,
    setBudgetDialog,
    budgetForm,
    setBudgetForm,
    budgetSaving,
    budgetError,
    openBudgetDialog,
    saveBudget,
    // Expense dialog
    expenseDialog,
    setExpenseDialog,
    editExpenseId,
    expenseForm,
    setExpenseForm,
    expenseSaving,
    expenseError,
    openAddExpense,
    openEditExpense,
    saveExpense,
    deleteExpense,
    confirmDeleteExpense,
    deleteConfirmId,
    setDeleteConfirmId,
  };
}
