/**
 * Budget page additional coverage tests — task #820
 *
 * Supplemental tests targeting error states, loading, comparison data,
 * and workflow summary rendering for the budget-page component.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BudgetPage from '../src/components/budget/budget-page';
import * as budgetService from '../src/services/budget-service';
import { ApiError } from '../src/lib/api-client';

vi.mock('../src/services/budget-service', async () => {
  const actual = await vi.importActual<typeof import('../src/services/budget-service')>(
    '../src/services/budget-service',
  );
  return {
    ...actual,
    listCategories: vi.fn(),
    listExpenses: vi.fn(),
    getExpenseWorkflowSummary: vi.fn(),
    getBudgetComparison: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    reviewExpenseApproval: vi.fn(),
    requestExpenseReimbursement: vi.fn(),
    resolveExpenseReimbursement: vi.fn(),
    extractExpenseReceiptOcr: vi.fn(),
    applyExpenseReceiptOcr: vi.fn(),
    getOverspendThreshold: vi.fn(),
    setOverspendThreshold: vi.fn(),
    uploadExpenseReceiptDocument: vi.fn(),
  };
});

const mockedService = vi.mocked(budgetService);

const MOCK_CATEGORIES: budgetService.BudgetCategory[] = [
  {
    id: 1,
    event_id: 42,
    name: 'Venue',
    allocated_amount: 50000,
    tax_rate: 8.25,
    gratuity_rate: 10,
    contingency_rate: 5,
    taxAmount: 4125,
    gratuityAmount: 5000,
    contingencyAmount: 2500,
    plannedTotal: 61625,
    color: '#F97316',
    created_at: '2026-01-01T00:00:00Z',
    spent: 30000,
  },
];

const MOCK_EXPENSES: budgetService.Expense[] = [
  {
    id: 10,
    event_id: 42,
    category_id: 1,
    title: 'Deposit',
    amount: 15000,
    vendor: 'Venue Co',
    payment_status: 'paid',
    approval_status: 'approved',
    reimbursement_status: 'not_requested',
    receipt_url: null,
    notes: null,
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 11,
    event_id: 42,
    category_id: 1,
    title: 'Final Payment',
    amount: 15000,
    vendor: 'Venue Co',
    payment_status: 'pending',
    approval_status: 'pending',
    reimbursement_status: 'not_requested',
    receipt_url: null,
    notes: null,
    created_at: '2026-02-01T00:00:00Z',
  },
];

const MOCK_WORKFLOW_SUMMARY: budgetService.ExpenseWorkflowSummary = {
  approval: {
    pending: 1,
    approved: 1,
    rejected: 0,
  },
  reimbursement: {
    notRequested: 2,
    requested: 0,
    reimbursed: 0,
    rejected: 0,
  },
  reimbursementRequestedAmount: 0,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/events/42/budget']}>
      <Routes>
        <Route path="/events/:id/budget" element={<BudgetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.listCategories.mockResolvedValue(MOCK_CATEGORIES);
  mockedService.listExpenses.mockResolvedValue(MOCK_EXPENSES);
  mockedService.getExpenseWorkflowSummary.mockResolvedValue(MOCK_WORKFLOW_SUMMARY);
  mockedService.getBudgetComparison.mockResolvedValue({
    currentEvent: {
      id: 42,
      title: 'Test Event',
      date: '2026-07-01',
      location: 'Test Venue',
      capacity: 200,
      eventType: 'Festival',
      summary: {
        totalAllocated: 50000,
        totalPlanned: 61625,
        totalSpent: 30000,
        remaining: 20000,
        plannedRemaining: 31625,
        percentUsed: 60,
        plannedPercentUsed: 48.7,
        categoryCount: 1,
      },
    },
    comparison: [],
    overview: {
      averageAllocated: 50000,
      averagePlanned: 61625,
      averageSpent: 30000,
      averagePlannedPercentUsed: 48.7,
    },
  });
  mockedService.getOverspendThreshold.mockResolvedValue(80);
});

describe('BudgetPage - Loading & Error States', () => {
  it('shows loading skeleton on initial load', () => {
    mockedService.listCategories.mockReturnValue(new Promise(() => {}));
    mockedService.listExpenses.mockReturnValue(new Promise(() => {}));
    mockedService.getExpenseWorkflowSummary.mockReturnValue(new Promise(() => {}));
    mockedService.getOverspendThreshold.mockReturnValue(new Promise(() => {}));
    mockedService.getBudgetComparison.mockReturnValue(new Promise(() => {}));
    renderPage();
    // MUI Skeleton elements should be present during loading
    expect(document.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('displays error alert on API failure', async () => {
    mockedService.listCategories.mockRejectedValue(new ApiError('Budget data unavailable', 500));
    mockedService.listExpenses.mockRejectedValue(new ApiError('Budget data unavailable', 500));
    mockedService.getExpenseWorkflowSummary.mockRejectedValue(new Error('fail'));
    mockedService.getOverspendThreshold.mockRejectedValue(new Error('fail'));
    mockedService.getBudgetComparison.mockRejectedValue(new Error('fail'));
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders budget page header after successful load', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
  });
});

describe('BudgetPage - Summary Cards', () => {
  it('shows allocated budget amount', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    // Summary card should show the allocated total (may appear multiple times)
    expect(screen.getAllByText(/\$50,000/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows spent amount', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/\$30,000/).length).toBeGreaterThanOrEqual(1);
  });
});

describe('BudgetPage - Category Display', () => {
  it('renders category names', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    expect(screen.getByText('Venue')).toBeInTheDocument();
  });
});

describe('BudgetPage - Expense Display', () => {
  it('renders expense titles', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('Final Payment')).toBeInTheDocument();
  });

  it('shows payment status chips', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    expect(screen.getAllByText('paid').length).toBeGreaterThanOrEqual(1);
  });

  it('shows approval status for expenses', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    expect(screen.getByText('approved')).toBeInTheDocument();
  });
});

describe('BudgetPage - Delete Operations', () => {
  it('calls deleteCategory API when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedService.deleteCategory.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Venue')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete venue/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockedService.deleteCategory).toHaveBeenCalledWith('42', 1);
    });
  });

  it('does not call deleteCategory when cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Venue')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /delete venue/i });
    await user.click(deleteButtons[0]);
    expect(mockedService.deleteCategory).not.toHaveBeenCalled();
  });
});

describe('BudgetPage - Comparison Data', () => {
  it('handles comparison data loading failure gracefully', async () => {
    mockedService.getBudgetComparison.mockRejectedValue(new Error('Comparison unavailable'));
    mockedService.listCategories.mockResolvedValue(MOCK_CATEGORIES);
    mockedService.listExpenses.mockResolvedValue(MOCK_EXPENSES);
    mockedService.getExpenseWorkflowSummary.mockResolvedValue(MOCK_WORKFLOW_SUMMARY);
    mockedService.getOverspendThreshold.mockResolvedValue(80);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });
    // Page should still render without comparison data
    expect(screen.getByText('Venue')).toBeInTheDocument();
  });
});
