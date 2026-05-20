/**
 * Budget chart components — story #765 / task #801.
 *
 * Covers the planned-vs-actual stacked bar and the burn-down area chart
 * end-states: empty (no data), loading skeleton, and rendered values.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BudgetVsActualChart from '../src/components/budget/budget-vs-actual-chart';
import BudgetBurndownChart from '../src/components/budget/budget-burndown-chart';
import type { BudgetCategory, Expense } from '../src/services/budget-service';

const baseCategory: BudgetCategory = {
  id: 1,
  event_id: 1,
  name: 'Catering',
  allocated_amount: 1000,
  tax_rate: 0,
  gratuity_rate: 0,
  contingency_rate: 0,
  taxAmount: 0,
  gratuityAmount: 0,
  contingencyAmount: 0,
  plannedTotal: 1000,
  color: '#abc',
  created_at: '2026-05-01T00:00:00Z',
  spent: 800,
};

function makeExpense(id: number, amount: number, day: string): Expense {
  return {
    id,
    event_id: 1,
    category_id: 1,
    category_name: 'Catering',
    title: `Expense ${id}`,
    amount,
    payment_status: 'paid',
    approval_status: 'approved',
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
    created_at: `${day}T12:00:00Z`,
  };
}

describe('BudgetVsActualChart', () => {
  it('renders the empty state when no categories are passed', () => {
    render(<BudgetVsActualChart categories={[]} />);
    expect(screen.getByText(/add categories/i)).toBeInTheDocument();
  });

  it('shows the skeleton placeholder when loading', () => {
    const { container } = render(<BudgetVsActualChart categories={[]} loading />);
    expect(container.querySelector('[data-testid="budget-vs-actual-skeleton"]')).toBeTruthy();
  });

  it('renders the chart wrapper when categories are present', () => {
    const { container } = render(
      <BudgetVsActualChart categories={[baseCategory]} currency="USD" />,
    );
    expect(container.querySelector('[data-testid="budget-vs-actual-chart"]')).toBeTruthy();
  });
});

describe('BudgetBurndownChart', () => {
  it('renders empty state without expenses', () => {
    render(<BudgetBurndownChart expenses={[]} totalAllocated={1000} />);
    expect(screen.getByText(/burn-down/i)).toBeInTheDocument();
  });

  it('renders the chart wrapper when expenses are present', () => {
    const expenses = [
      makeExpense(1, 200, '2026-05-01'),
      makeExpense(2, 300, '2026-05-05'),
      makeExpense(3, 100, '2026-05-10'),
    ];
    const { container } = render(
      <BudgetBurndownChart expenses={expenses} totalAllocated={1000} currency="USD" />,
    );
    expect(container.querySelector('[data-testid="budget-burndown-chart"]')).toBeTruthy();
  });
});
