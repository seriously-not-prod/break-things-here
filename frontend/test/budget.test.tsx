import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BudgetPage from '../src/components/budget/budget-page';
import * as budgetService from '../src/services/budget-service';

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
  };
});

const mockedService = vi.mocked(budgetService);

const MOCK_CATEGORIES: budgetService.BudgetCategory[] = [
  {
    id: 1,
    event_id: 42,
    name: 'Venue',
    allocated_amount: 50000,
    color: '#F97316',
    created_at: '2026-01-01T00:00:00Z',
    spent: 30000,
  },
  {
    id: 2,
    event_id: 42,
    name: 'Catering',
    allocated_amount: 20000,
    color: '#10B981',
    created_at: '2026-01-01T00:00:00Z',
    spent: 5000,
  },
];

const MOCK_EXPENSES: budgetService.Expense[] = [
  {
    id: 10,
    event_id: 42,
    category_id: 1,
    category_name: 'Venue',
    title: 'Stage Setup',
    amount: 15000,
    payment_status: 'paid',
    approval_status: 'approved',
    approval_note: null,
    approved_by: 1,
    approved_at: '2026-02-01T00:00:00Z',
    reimbursement_status: 'not_requested',
    reimbursement_requested_by: null,
    reimbursement_requested_at: null,
    reimbursed_by: null,
    reimbursed_at: null,
    can_approve: false,
    can_request_reimbursement: true,
    can_resolve_reimbursement: false,
    vendor_name: 'Stageworks',
    notes: null,
    created_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 11,
    event_id: 42,
    category_id: 2,
    category_name: 'Catering',
    title: 'Coffee Break',
    amount: 5000,
    payment_status: 'pending',
    approval_status: 'pending',
    approval_note: null,
    approved_by: null,
    approved_at: null,
    reimbursement_status: 'not_requested',
    reimbursement_requested_by: null,
    reimbursement_requested_at: null,
    reimbursed_by: null,
    reimbursed_at: null,
    can_approve: true,
    can_request_reimbursement: false,
    can_resolve_reimbursement: false,
    vendor_name: null,
    notes: null,
    created_at: '2026-02-02T00:00:00Z',
  },
];

function renderPage(eventId = '42'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/budget`]}>
      <Routes>
        <Route path="/events/:id/budget" element={<BudgetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BudgetPage', () => {
  beforeEach(() => {
    mockedService.listCategories.mockResolvedValue(MOCK_CATEGORIES);
    mockedService.listExpenses.mockResolvedValue(MOCK_EXPENSES);
    mockedService.getExpenseWorkflowSummary.mockResolvedValue({
      approval: { pending: 1, approved: 1, rejected: 0 },
      reimbursement: { notRequested: 2, requested: 0, reimbursed: 0, rejected: 0 },
      reimbursementRequestedAmount: 0,
    });
    mockedService.getBudgetComparison.mockResolvedValue({
      currentEvent: {
        id: 42,
        title: 'Current Event',
        date: '2026-01-01',
        location: 'Test Venue',
        capacity: 100,
        eventType: 'Music',
        summary: {
          totalAllocated: 70000,
          totalPlanned: 70000,
          totalSpent: 35000,
          remaining: 35000,
          plannedRemaining: 35000,
          percentUsed: 50,
          plannedPercentUsed: 50,
          categoryCount: 2,
        },
      },
      comparison: [],
      overview: {
        averageAllocated: 0,
        averagePlanned: 0,
        averageSpent: 0,
        averagePlannedPercentUsed: 0,
      },
    });
    mockedService.extractExpenseReceiptOcr.mockResolvedValue({
      ocr: {
        id: 77,
        event_id: 42,
        expense_id: 11,
        status: 'extracted',
        extracted_title: 'Receipt - Coffee Corner',
        extracted_amount: 125.25,
        extracted_vendor_name: 'Coffee Corner',
        extracted_date: '2026-02-20',
        confidence: 0.9,
        error_code: null,
        error_message: null,
        created_at: '2026-02-20T00:00:00Z',
        updated_at: '2026-02-20T00:00:00Z',
      },
      extracted: {
        title: 'Receipt - Coffee Corner',
        amount: 125.25,
        vendor_name: 'Coffee Corner',
        receipt_date: '2026-02-20',
        confidence: 0.9,
      },
      can_apply: true,
    });
    mockedService.applyExpenseReceiptOcr.mockResolvedValue({
      expense: {
        ...MOCK_EXPENSES[1],
        title: 'Receipt - Coffee Corner',
        amount: 125.25,
      },
      reconciliation: {
        ocr_id: 77,
        overrides: ['title', 'amount', 'vendor_name'],
        overrides_count: 3,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the loading skeleton initially', () => {
    // Delay resolution so the skeleton is visible
    mockedService.listCategories.mockReturnValue(new Promise(() => undefined));
    mockedService.listExpenses.mockReturnValue(new Promise(() => undefined));
    renderPage();
    // MUI Skeleton renders as a div; just assert heading is not yet present
    expect(screen.queryByText('Budget Management')).toBeNull();
  });

  it('renders empty state when no categories exist', async () => {
    mockedService.listCategories.mockResolvedValue([]);
    mockedService.listExpenses.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No budget categories yet/i)).toBeInTheDocument();
    });
  });

  it('renders summary cards and category rows with data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    // KPI cards
    expect(screen.getByText('Total Allocated')).toBeInTheDocument();
    expect(screen.getByText('Total Spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    expect(screen.getByText('% Used')).toBeInTheDocument();

    // Venue and Catering appear in both breakdown and expense table
    expect(screen.getAllByText('Venue').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Catering').length).toBeGreaterThanOrEqual(1);

    // Expense table rows
    expect(screen.getByText('Stage Setup')).toBeInTheDocument();
    expect(screen.getByText('Coffee Break')).toBeInTheDocument();
  });

  it('opens add expense dialog when Add Expense is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    const addExpenseButtons = screen.getAllByRole('button', { name: /add expense/i });
    await user.click(addExpenseButtons[0]);

    expect(screen.getByRole('dialog', { name: /add expense/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  }, 15000);

  it('submits new expense and closes dialog', async () => {
    const newExpense: budgetService.Expense = {
      id: 99,
      event_id: 42,
      category_id: 1,
      category_name: 'Venue',
      title: 'New Expense',
      amount: 1000,
      payment_status: 'pending',
      approval_status: 'pending',
      approval_note: null,
      approved_by: null,
      approved_at: null,
      reimbursement_status: 'not_requested',
      reimbursement_requested_by: null,
      reimbursement_requested_at: null,
      reimbursed_by: null,
      reimbursed_at: null,
      can_approve: false,
      can_request_reimbursement: false,
      can_resolve_reimbursement: false,
      vendor_name: null,
      notes: null,
      created_at: '2026-03-01T00:00:00Z',
    };
    mockedService.createExpense.mockResolvedValue(newExpense);
    // listCategories will be called again after save
    mockedService.listCategories.mockResolvedValue(MOCK_CATEGORIES);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    const addExpenseButtons = screen.getAllByRole('button', { name: /add expense/i });
    await user.click(addExpenseButtons[0]);

    const dialog = screen.getByRole('dialog', { name: /add expense/i });
    const titleInput = within(dialog).getByLabelText(/title/i);
    const amountInput = within(dialog).getByLabelText(/amount \(\$\)/i);

    fireEvent.change(titleInput, { target: { value: 'New Expense' } });
    fireEvent.change(amountInput, { target: { value: '1000' } });

    const submitBtn = within(dialog).getByRole('button', { name: /^add expense$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockedService.createExpense).toHaveBeenCalledOnce();
    });
  }, 15000);

  it('runs OCR extract and apply from expense actions', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Coffee Corner\n2026-02-20\nTotal 125.25');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const user = userEvent.setup();

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    const ocrButtons = screen.getAllByRole('button', { name: /ocr extract/i });
    await user.click(ocrButtons[0]);

    await waitFor(() => {
      expect(mockedService.extractExpenseReceiptOcr).toHaveBeenCalled();
      expect(mockedService.applyExpenseReceiptOcr).toHaveBeenCalled();
    });

    expect(promptSpy).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('opens add category dialog and submits', async () => {
    const newCat: budgetService.BudgetCategory = {
      id: 50,
      event_id: 42,
      name: 'Marketing',
      allocated_amount: 10000,
      color: '#3B82F6',
      created_at: '2026-03-01T00:00:00Z',
      spent: 0,
    };
    mockedService.createCategory.mockResolvedValue(newCat);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    // Button has aria-label="Add budget category"
    await user.click(screen.getByRole('button', { name: /add budget category/i }));
    const dialog = screen.getByRole('dialog', { name: /add budget category/i });

    const nameInput = within(dialog).getByLabelText(/category name/i);
    const allocatedInput = within(dialog).getByLabelText(/allocated amount/i);

    fireEvent.change(nameInput, { target: { value: 'Marketing' } });
    fireEvent.change(allocatedInput, { target: { value: '10000' } });

    await user.click(within(dialog).getByRole('button', { name: /add category/i }));

    await waitFor(() => {
      expect(mockedService.createCategory).toHaveBeenCalledWith('42', {
        name: 'Marketing',
        allocated_amount: 10000,
        color: expect.any(String),
        tax_rate: expect.any(Number),
        gratuity_rate: expect.any(Number),
        contingency_rate: expect.any(Number),
      });
    });
  }, 15000);
});
