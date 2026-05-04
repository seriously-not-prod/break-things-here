import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BudgetTab } from '../components/events/BudgetTab';

// ──────────────────────────────────────────────────────────────────────────────
// Mock recharts (PieChart/Tooltip etc.) — irrelevant to tab logic tests
// ──────────────────────────────────────────────────────────────────────────────
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

// ──────────────────────────────────────────────────────────────────────────────
// Mock useBudget hook
// ──────────────────────────────────────────────────────────────────────────────
const defaultHookValues = {
  budget: null,
  budgetSummary: null,
  breakdown: [],
  expenses: [],
  categories: [],
  budgetDialog: false,
  setBudgetDialog: vi.fn(),
  budgetForm: { total_budget: '', currency: 'USD', notes: '' },
  setBudgetForm: vi.fn(),
  budgetSaving: false,
  budgetError: null,
  openBudgetDialog: vi.fn(),
  saveBudget: vi.fn(),
  expenseDialog: false,
  setExpenseDialog: vi.fn(),
  editExpenseId: null,
  expenseForm: { title: '', amount: '', category_id: '', paid_by: '', status: 'Pending', notes: '' },
  setExpenseForm: vi.fn(),
  expenseSaving: false,
  expenseError: null,
  openAddExpense: vi.fn(),
  openEditExpense: vi.fn(),
  saveExpense: vi.fn(),
  deleteExpense: vi.fn(),
  confirmDeleteExpense: vi.fn(),
  deleteConfirmId: null as number | null,
  setDeleteConfirmId: vi.fn(),
};

vi.mock('../hooks/useBudget', () => ({
  useBudget: vi.fn(() => ({ ...defaultHookValues })),
}));

import { useBudget } from '../hooks/useBudget';
import type React from 'react';

const mockUseBudget = useBudget as ReturnType<typeof vi.fn>;

function setHook(overrides: Partial<typeof defaultHookValues>) {
  mockUseBudget.mockReturnValue({ ...defaultHookValues, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseBudget.mockReturnValue({ ...defaultHookValues });
});

describe('BudgetTab', () => {
  it('renders "No budget set" when budget is null', () => {
    render(<BudgetTab eventId="42" canEdit={false} />);
    expect(screen.getByText(/no budget set/i)).toBeInTheDocument();
  });

  it('shows budget overview when budget is set', () => {
    setHook({
      budget: { id: 1, event_id: 42, total_budget: 5000, currency: 'USD', notes: null },
      budgetSummary: { total_budget: 5000, total_spent: 200, remaining: 4800 },
    });
    render(<BudgetTab eventId="42" canEdit={false} />);
    expect(screen.getByText(/budget overview/i)).toBeInTheDocument();
    expect(screen.getByText(/5000\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/4800\.00/i)).toBeInTheDocument();
  });

  it('shows "Edit Budget" button for canEdit users with existing budget', () => {
    setHook({
      budget: { id: 1, event_id: 42, total_budget: 5000, currency: 'USD', notes: null },
    });
    render(<BudgetTab eventId="42" canEdit={true} />);
    expect(screen.getByRole('button', { name: /edit budget/i })).toBeInTheDocument();
  });

  it('shows "Set Budget" button for canEdit users with no budget', () => {
    render(<BudgetTab eventId="42" canEdit={true} />);
    expect(screen.getByRole('button', { name: /set budget/i })).toBeInTheDocument();
  });

  it('does not show budget edit button when canEdit is false', () => {
    render(<BudgetTab eventId="42" canEdit={false} />);
    expect(screen.queryByRole('button', { name: /set budget|edit budget/i })).not.toBeInTheDocument();
  });

  it('shows "No expenses recorded" when expenses list is empty', () => {
    render(<BudgetTab eventId="42" canEdit={false} />);
    expect(screen.getByText(/no expenses recorded/i)).toBeInTheDocument();
  });

  it('renders expense rows in the table', () => {
    setHook({
      budget: { id: 1, event_id: 42, total_budget: 5000, currency: 'USD', notes: null },
      expenses: [
        { id: 10, event_id: 42, category_id: null, title: 'Hotel', amount: 800, paid_by: 'Bob', receipt_url: null, status: 'Approved', notes: null, category_name: null, category_color: null },
      ],
    });
    render(<BudgetTab eventId="42" canEdit={false} />);
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    expect(screen.getByText(/800\.00/)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('calls openAddExpense when "Add Expense" button is clicked', () => {
    const openAddExpense = vi.fn();
    setHook({ openAddExpense });
    render(<BudgetTab eventId="42" canEdit={true} />);
    fireEvent.click(screen.getByRole('button', { name: /add expense/i }));
    expect(openAddExpense).toHaveBeenCalledOnce();
  });

  it('shows delete confirmation dialog when deleteConfirmId is set', () => {
    setHook({ deleteConfirmId: 10 });
    render(<BudgetTab eventId="42" canEdit={true} />);
    expect(screen.getByRole('heading', { name: /delete expense/i })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it('calls setDeleteConfirmId(null) on dialog cancel', () => {
    const setDeleteConfirmId = vi.fn();
    setHook({ deleteConfirmId: 10, setDeleteConfirmId });
    render(<BudgetTab eventId="42" canEdit={true} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(setDeleteConfirmId).toHaveBeenCalledWith(null);
  });

  it('calls confirmDeleteExpense on dialog Delete button', () => {
    const confirmDeleteExpense = vi.fn();
    setHook({ deleteConfirmId: 10, confirmDeleteExpense });
    render(<BudgetTab eventId="42" canEdit={true} />);
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(confirmDeleteExpense).toHaveBeenCalledOnce();
  });
});
