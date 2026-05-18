/**
 * Budget Service
 * API client functions for budget categories and expenses.
 * BRD section 3.4 / Issue #374
 */

import { api, apiFetch, ApiError } from '../lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetCategory {
  id: number;
  event_id: number;
  name: string;
  allocated_amount: number;
  tax_rate: number;
  gratuity_rate: number;
  contingency_rate: number;
  taxAmount: number;
  gratuityAmount: number;
  contingencyAmount: number;
  plannedTotal: number;
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
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_note: string | null;
  approved_by: number | null;
  approved_at: string | null;
  reimbursement_status: 'not_requested' | 'requested' | 'reimbursed' | 'rejected';
  reimbursement_requested_by: number | null;
  reimbursement_requested_at: string | null;
  reimbursed_by: number | null;
  reimbursed_at: string | null;
  can_approve: boolean;
  can_request_reimbursement: boolean;
  can_resolve_reimbursement: boolean;
  vendor_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExpenseWorkflowSummary {
  approval: {
    pending: number;
    approved: number;
    rejected: number;
  };
  reimbursement: {
    notRequested: number;
    requested: number;
    reimbursed: number;
    rejected: number;
  };
  reimbursementRequestedAmount: number;
}

export interface UploadedExpenseReceiptDocument {
  id: number;
  event_id: number;
  original_name: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  caption?: string | null;
  created_at: string;
}

export interface ExpenseOcrExtractedFields {
  title: string | null;
  amount: number | null;
  vendor_name: string | null;
  receipt_date: string | null;
  confidence: number;
}

export interface ExpenseOcrResult {
  id: number;
  event_id: number;
  expense_id: number;
  status: 'extracted' | 'applied' | 'failed';
  extracted_title: string | null;
  extracted_amount: number | null;
  extracted_vendor_name: string | null;
  extracted_date: string | null;
  confidence: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetSummary {
  totalAllocated: number;
  totalPlanned: number;
  totalSpent: number;
  remaining: number;
  plannedRemaining: number;
  percentUsed: number;
  plannedPercentUsed: number;
}

export interface BudgetComparisonOverview {
  averageAllocated: number;
  averagePlanned: number;
  averageSpent: number;
  averagePlannedPercentUsed: number;
}

export interface SimilarBudgetComparison {
  id: number;
  title: string;
  date: string;
  location: string;
  capacity: number | null;
  eventType: string | null;
  matchScore: number;
  matchReasons: string[];
  summary: BudgetSummary & { categoryCount: number };
}

export interface BudgetComparisonResponse {
  currentEvent: {
    id: number;
    title: string;
    date: string;
    location: string;
    capacity: number | null;
    eventType: string | null;
    summary: BudgetSummary & { categoryCount: number };
  };
  comparison: SimilarBudgetComparison[];
  overview: BudgetComparisonOverview;
}

export function computeSummary(categories: BudgetCategory[]): BudgetSummary {
  const totalAllocated = categories.reduce((sum, c) => sum + c.allocated_amount, 0);
  const totalPlanned = categories.reduce(
    (sum, c) => sum + (Number.isFinite(c.plannedTotal) ? c.plannedTotal : c.allocated_amount),
    0,
  );
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0);
  const remaining = totalAllocated - totalSpent;
  const plannedRemaining = totalPlanned - totalSpent;
  const percentUsed = totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;
  const plannedPercentUsed = totalPlanned > 0 ? Math.min(100, Math.round((totalSpent / totalPlanned) * 100)) : 0;
  return {
    totalAllocated,
    totalPlanned,
    totalSpent,
    remaining,
    plannedRemaining,
    percentUsed,
    plannedPercentUsed,
  };
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
  tax_rate: number;
  gratuity_rate: number;
  contingency_rate: number;
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

export async function getExpenseWorkflowSummary(
  eventId: number | string,
): Promise<ExpenseWorkflowSummary> {
  const data = await api.get<{ summary: ExpenseWorkflowSummary }>(`/api/events/${eventId}/expenses/workflow-summary`);
  return data.summary;
}

export async function getBudgetComparison(
  eventId: number | string,
): Promise<BudgetComparisonResponse> {
  return api.get<BudgetComparisonResponse>(`/api/events/${eventId}/budget/compare`);
}

export interface CreateExpensePayload {
  title: string;
  amount: number;
  category_id: number;
  payment_status: 'pending' | 'paid' | 'overdue';
  vendor_name: string | null;
  notes: string | null;
  /** ISO 4217 currency code; if omitted the event's base currency is used. */
  currency_code?: string;
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

export async function reviewExpenseApproval(
  eventId: number | string,
  expenseId: number,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<Expense> {
  const data = await api.patch<{ expense: Expense }>(
    `/api/events/${eventId}/expenses/${expenseId}/approval`,
    { decision, note },
  );
  return data.expense;
}

export async function requestExpenseReimbursement(
  eventId: number | string,
  expenseId: number,
): Promise<Expense> {
  const data = await api.post<{ expense: Expense }>(
    `/api/events/${eventId}/expenses/${expenseId}/reimbursement-request`,
  );
  return data.expense;
}

export async function resolveExpenseReimbursement(
  eventId: number | string,
  expenseId: number,
  decision: 'reimbursed' | 'rejected',
  note?: string,
): Promise<Expense> {
  const data = await api.patch<{ expense: Expense }>(
    `/api/events/${eventId}/expenses/${expenseId}/reimbursement`,
    { decision, note },
  );
  return data.expense;
}

export async function extractExpenseReceiptOcr(
  eventId: number | string,
  expenseId: number,
  receiptText: string,
): Promise<{ ocr: ExpenseOcrResult; extracted: ExpenseOcrExtractedFields; can_apply: boolean }> {
  return api.post<{ ocr: ExpenseOcrResult; extracted: ExpenseOcrExtractedFields; can_apply: boolean }>(
    `/api/events/${eventId}/expenses/${expenseId}/ocr/extract`,
    { receipt_text: receiptText },
  );
}

export async function applyExpenseReceiptOcr(
  eventId: number | string,
  expenseId: number,
  ocrId: number,
  payload: {
    title?: string;
    amount?: number;
    vendor_name?: string;
    notes?: string;
    override_reason?: string;
  },
): Promise<{ expense: Expense; reconciliation: { ocr_id: number; overrides: string[]; overrides_count: number } }> {
  return api.post<{ expense: Expense; reconciliation: { ocr_id: number; overrides: string[]; overrides_count: number } }>(
    `/api/events/${eventId}/expenses/${expenseId}/ocr/${ocrId}/apply`,
    payload,
  );
}

export async function uploadExpenseReceiptDocument(
  eventId: number | string,
  expenseId: number,
  file: File,
): Promise<UploadedExpenseReceiptDocument> {
  const formData = new FormData();
  formData.append('document', file);
  formData.append('caption', `expense:${expenseId}:receipt`);

  const response = await apiFetch(`/api/events/${eventId}/documents`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string; code?: string };
    throw new ApiError(body.error ?? response.statusText, response.status, body.code);
  }

  const payload = await response.json() as { document: UploadedExpenseReceiptDocument };
  return payload.document;
}

export async function deleteExpense(
  eventId: number | string,
  expenseId: number,
): Promise<void> {
  await api.delete<void>(`/api/events/${eventId}/expenses/${expenseId}`);
}
