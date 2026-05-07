/**
 * Tests for expense-pdf-export utility and BudgetPage PDF export integration.
 * Issue #453
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ─── Hoisted mocks (must be defined before vi.mock factory runs) ──────────────

const {
  mockSave,
  mockText,
  mockSetFontSize,
  mockSetFont,
  mockSetTextColor,
  mockGetNumberOfPages,
  mockSetPage,
  mockAutoTable,
  mockOutput,
  mockDocInstance,
  MockJsPDF,
} = vi.hoisted(() => {
  const mockSave = vi.fn();
  const mockText = vi.fn();
  const mockSetFontSize = vi.fn();
  const mockSetFont = vi.fn();
  const mockSetTextColor = vi.fn();
  const mockGetNumberOfPages = vi.fn(() => 1);
  const mockSetPage = vi.fn();
  const mockAutoTable = vi.fn();
  const mockOutput = vi.fn(() => new ArrayBuffer(8));

  const mockDocInstance = {
    internal: {
      pageSize: { getWidth: () => 210, getHeight: () => 297 },
      getVersion: () => '4.x',
    },
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    setTextColor: mockSetTextColor,
    text: mockText,
    autoTable: mockAutoTable,
    getNumberOfPages: mockGetNumberOfPages,
    setPage: mockSetPage,
    save: mockSave,
    output: mockOutput,
    lastAutoTable: { finalY: 120 },
  };

  // Use a real constructor function so `new jsPDF()` works
  function MockJsPDF() {
    return mockDocInstance;
  }

  return {
    mockSave,
    mockText,
    mockSetFontSize,
    mockSetFont,
    mockSetTextColor,
    mockGetNumberOfPages,
    mockSetPage,
    mockAutoTable,
    mockOutput,
    mockDocInstance,
    MockJsPDF,
  };
});

vi.mock('jspdf', () => ({
  jsPDF: MockJsPDF,
}));

vi.mock('jspdf-autotable', () => ({
  applyPlugin: vi.fn(),
}));

vi.mock('../src/services/budget-service', async () => {
  const actual = await vi.importActual<typeof import('../src/services/budget-service')>(
    '../src/services/budget-service',
  );
  return {
    ...actual,
    listCategories: vi.fn(),
    listExpenses: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
  };
});

import { generateExpenseSummaryPdf } from '../src/utils/expense-pdf-export';
import * as budgetService from '../src/services/budget-service';
import BudgetPage from '../src/components/budget/budget-page';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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
    vendor_name: null,
    notes: null,
    created_at: '2026-02-02T00:00:00Z',
  },
];

const MOCK_SUMMARY: budgetService.BudgetSummary = {
  totalAllocated: 70000,
  totalSpent: 35000,
  remaining: 35000,
  percentUsed: 50,
};

const FIXED_DATE = new Date('2026-05-07T00:00:00Z');

// ─── Unit tests: generateExpenseSummaryPdf ────────────────────────────────────

describe('generateExpenseSummaryPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the jsPDF document instance', () => {
    const result = generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    expect(result).toBe(mockDocInstance);
  });

  it('calls doc.save with a correctly named file', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      eventName: 'Summer Gala',
      generatedAt: FIXED_DATE,
    });

    expect(mockSave).toHaveBeenCalledOnce();
    const savedName: string = mockSave.mock.calls[0][0] as string;
    expect(savedName).toMatch(/^expense-summary-summer-gala-2026-05-07\.pdf$/);
  });

  it('uses "Event" as default name when eventName is omitted', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const savedName: string = mockSave.mock.calls[0][0] as string;
    expect(savedName).toMatch(/^expense-summary-event-/);
  });

  it('renders a title text containing "Expense Summary Report"', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const textCalls = mockText.mock.calls.map((c) => c[0]);
    expect(textCalls).toContain('Expense Summary Report');
  });

  it('calls autoTable twice (categories + expenses)', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    expect(mockAutoTable).toHaveBeenCalledTimes(2);
  });

  it('passes correct category count as table rows', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const categoryTableCall = mockAutoTable.mock.calls[0][0] as { body: string[][] };
    expect(categoryTableCall.body).toHaveLength(MOCK_CATEGORIES.length);
  });

  it('passes correct expense count as table rows', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const expenseTableCall = mockAutoTable.mock.calls[1][0] as { body: string[][] };
    expect(expenseTableCall.body).toHaveLength(MOCK_EXPENSES.length);
  });

  it('renders placeholder row when there are no categories', () => {
    generateExpenseSummaryPdf({
      categories: [],
      expenses: [],
      summary: { totalAllocated: 0, totalSpent: 0, remaining: 0, percentUsed: 0 },
      generatedAt: FIXED_DATE,
    });

    const categoryTableCall = mockAutoTable.mock.calls[0][0] as { body: string[][] };
    expect(categoryTableCall.body[0][0]).toMatch(/no categories/i);
  });

  it('renders placeholder row when there are no expenses', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: [],
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const expenseTableCall = mockAutoTable.mock.calls[1][0] as { body: string[][] };
    expect(expenseTableCall.body[0][0]).toMatch(/no expenses recorded/i);
  });

  it('formats category amounts as USD currency strings', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const categoryTableCall = mockAutoTable.mock.calls[0][0] as { body: string[][] };
    // First category row: Venue — allocated $50,000
    expect(categoryTableCall.body[0][1]).toBe('$50,000');
    expect(categoryTableCall.body[0][2]).toBe('$30,000');
  });

  it('capitalises payment status in expense rows', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const expenseTableCall = mockAutoTable.mock.calls[1][0] as { body: string[][] };
    expect(expenseTableCall.body[0][3]).toBe('Paid');   // 'paid' → 'Paid'
    expect(expenseTableCall.body[1][3]).toBe('Pending'); // 'pending' → 'Pending'
  });

  it('shows "—" for null vendor name', () => {
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    const expenseTableCall = mockAutoTable.mock.calls[1][0] as { body: string[][] };
    // Second expense has null vendor_name
    expect(expenseTableCall.body[1][4]).toBe('—');
  });

  it('calls setPage for each page to add footers', () => {
    mockGetNumberOfPages.mockReturnValue(3);
    generateExpenseSummaryPdf({
      categories: MOCK_CATEGORIES,
      expenses: MOCK_EXPENSES,
      summary: MOCK_SUMMARY,
      generatedAt: FIXED_DATE,
    });

    expect(mockSetPage).toHaveBeenCalledTimes(3);
    mockGetNumberOfPages.mockReturnValue(1);
  });
});

// ─── Integration: BudgetPage export button ────────────────────────────────────

const mockedService = vi.mocked(budgetService);

function renderBudgetPage(eventId = '42'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/budget`]}>
      <Routes>
        <Route path="/events/:id/budget" element={<BudgetPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BudgetPage — Export PDF button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedService.listCategories.mockResolvedValue(MOCK_CATEGORIES);
    mockedService.listExpenses.mockResolvedValue(MOCK_EXPENSES);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Export PDF button', async () => {
    renderBudgetPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export expense summary as pdf/i })).toBeInTheDocument();
    });
  }, 15000);

  it('Export PDF button is disabled when both categories and expenses are empty', async () => {
    mockedService.listCategories.mockResolvedValue([]);
    mockedService.listExpenses.mockResolvedValue([]);

    renderBudgetPage();
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /export expense summary as pdf/i });
      expect(btn).toBeDisabled();
    });
  });

  it('Export PDF button is enabled when data is loaded', async () => {
    renderBudgetPage();
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /export expense summary as pdf/i });
      expect(btn).toBeEnabled();
    });
  });

  it('calls generateExpenseSummaryPdf when Export PDF is clicked', async () => {
    const user = userEvent.setup();
    renderBudgetPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /export expense summary as pdf/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledOnce();
    });
  });

  it('shows error alert when PDF generation fails', async () => {
    mockSave.mockImplementationOnce(() => {
      throw new Error('PDF generation failed');
    });

    const user = userEvent.setup();
    renderBudgetPage();
    await waitFor(() => {
      expect(screen.getByText('Budget Management')).toBeInTheDocument();
    });

    const exportBtn = screen.getByRole('button', { name: /export expense summary as pdf/i });
    await user.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/pdf generation failed/i)).toBeInTheDocument();
    });
  });
});
