import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import { ApiError } from '../../lib/api-client';
import {
  applyExpenseReceiptOcr,
  BudgetCategory,
  BudgetComparisonResponse,
  ExpenseWorkflowSummary,
  BudgetSummary,
  computeSummary,
  CreateCategoryPayload,
  CreateExpensePayload,
  deleteCategory,
  deleteExpense,
  Expense,
  extractExpenseReceiptOcr,
  getBudgetComparison,
  listCategories,
  listExpenses,
  createCategory,
  createExpense,
  getExpenseWorkflowSummary,
  requestExpenseReimbursement,
  resolveExpenseReimbursement,
  reviewExpenseApproval,
  updateCategory,
  updateExpense,
} from '../../services/budget-service';
import { BudgetSummaryCards } from './budget-summary-cards';
import { BudgetChart } from './budget-chart';
import { AddCategoryDialog } from './add-category-dialog';
import { AddExpenseDialog } from './add-expense-dialog';
import { BudgetForecastCard } from './budget-forecast-card';
import { generateExpenseSummaryPdf } from '../../utils/expense-pdf-export';

const fmt = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const PAYMENT_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'error',
};

const APPROVAL_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

const REIMBURSEMENT_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  not_requested: 'default',
  requested: 'warning',
  reimbursed: 'success',
  rejected: 'error',
};

export default function BudgetPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<BudgetSummary>({
    totalAllocated: 0,
    totalPlanned: 0,
    totalSpent: 0,
    remaining: 0,
    plannedRemaining: 0,
    percentUsed: 0,
    plannedPercentUsed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [comparisonData, setComparisonData] = useState<BudgetComparisonResponse | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [workflowSummary, setWorkflowSummary] = useState<ExpenseWorkflowSummary | null>(null);
  const [ocrBusyExpenseId, setOcrBusyExpenseId] = useState<number | null>(null);

  // Dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | undefined>(undefined);
  const [expDialogOpen, setExpDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);

  const load = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const [cats, exps, summaryData] = await Promise.all([
        listCategories(eventId),
        listExpenses(eventId),
        getExpenseWorkflowSummary(eventId),
      ]);
      setCategories(cats);
      setExpenses(exps);
      setWorkflowSummary(summaryData);
      setSummary(computeSummary(cats));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load budget data.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadComparison = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const data = await getBudgetComparison(eventId);
      setComparisonData(data);
    } catch (err) {
      setComparisonData(null);
      setComparisonError(err instanceof ApiError ? err.message : 'Failed to load similar event comparisons.');
    } finally {
      setComparisonLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  // ─── Category handlers ──────────────────────────────────────────────────────

  async function handleSaveCategory(payload: CreateCategoryPayload): Promise<void> {
    if (!eventId) return;
    if (editingCategory) {
      const updated = await updateCategory(eventId, editingCategory.id, payload);
      setCategories((prev) => {
        const next = prev.map((c) => (c.id === updated.id ? updated : c));
        setSummary(computeSummary(next));
        return next;
      });
    } else {
      const created = await createCategory(eventId, payload);
      setCategories((prev) => {
        const next = [...prev, created];
        setSummary(computeSummary(next));
        return next;
      });
    }
    setEditingCategory(undefined);
    void loadComparison();
  }

  async function handleDeleteCategory(category: BudgetCategory): Promise<void> {
    if (!eventId) return;
    if (!window.confirm(`Delete category "${category.name}" and all its expenses?`)) return;
    await deleteCategory(eventId, category.id);
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    setExpenses((prev) => prev.filter((e) => e.category_id !== category.id));
    void load();
    void loadComparison();
  }

  // ─── Expense handlers ───────────────────────────────────────────────────────

  function upsertExpense(updated: Expense): void {
    setExpenses((prev) => {
      const exists = prev.some((expense) => expense.id === updated.id);
      return exists
        ? prev.map((expense) => (expense.id === updated.id ? updated : expense))
        : [updated, ...prev];
    });
  }

  async function handleSaveExpense(payload: CreateExpensePayload): Promise<void> {
    if (!eventId) return;
    if (editingExpense) {
      const updated = await updateExpense(eventId, editingExpense.id, payload);
      setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } else {
      const created = await createExpense(eventId, payload);
      setExpenses((prev) => [created, ...prev]);
    }
    // Reload categories to get fresh spent amounts
    const cats = await listCategories(eventId);
    setCategories(cats);
    setSummary(computeSummary(cats));
    setEditingExpense(undefined);
    void loadComparison();
  }

  async function handleDeleteExpense(expense: Expense): Promise<void> {
    if (!eventId) return;
    if (!window.confirm(`Delete expense "${expense.title}"?`)) return;
    await deleteExpense(eventId, expense.id);
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    const cats = await listCategories(eventId);
    setCategories(cats);
    setSummary(computeSummary(cats));
    void loadComparison();
  }

  async function handleApproveExpense(expense: Expense, decision: 'approved' | 'rejected'): Promise<void> {
    if (!eventId) return;
    try {
      const updated = await reviewExpenseApproval(eventId, expense.id, decision);
      upsertExpense(updated);
      setWorkflowSummary(await getExpenseWorkflowSummary(eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to review expense approval.');
    }
  }

  async function handleRequestReimbursement(expense: Expense): Promise<void> {
    if (!eventId) return;
    try {
      const updated = await requestExpenseReimbursement(eventId, expense.id);
      upsertExpense(updated);
      setWorkflowSummary(await getExpenseWorkflowSummary(eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request reimbursement.');
    }
  }

  async function handleResolveReimbursement(expense: Expense, decision: 'reimbursed' | 'rejected'): Promise<void> {
    if (!eventId) return;
    try {
      const updated = await resolveExpenseReimbursement(eventId, expense.id, decision);
      upsertExpense(updated);
      const cats = await listCategories(eventId);
      setCategories(cats);
      setSummary(computeSummary(cats));
      setWorkflowSummary(await getExpenseWorkflowSummary(eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve reimbursement.');
    }
  }

  async function handleExtractAndApplyOcr(expense: Expense): Promise<void> {
    if (!eventId) return;
    const receiptText = window.prompt(
      'Paste receipt text for OCR extraction.\nTip: include vendor, date, and total lines.',
      expense.notes ?? '',
    );
    if (receiptText === null) return;
    if (receiptText.trim().length < 5) {
      setError('Receipt text must be at least 5 characters long.');
      return;
    }

    setOcrBusyExpenseId(expense.id);
    setError(null);
    try {
      const extractedResponse = await extractExpenseReceiptOcr(eventId, expense.id, receiptText.trim());
      const { extracted, ocr, can_apply } = extractedResponse;
      const extractedSummary = [
        `Title: ${extracted.title ?? 'N/A'}`,
        `Amount: ${extracted.amount ?? 'N/A'}`,
        `Vendor: ${extracted.vendor_name ?? 'N/A'}`,
        `Date: ${extracted.receipt_date ?? 'N/A'}`,
        `Confidence: ${Math.round(extracted.confidence * 100)}%`,
      ].join('\n');

      if (!can_apply) {
        window.alert(`OCR extracted fields:\n\n${extractedSummary}\n\nYou do not have permission to apply these values.`);
        return;
      }

      const shouldApply = window.confirm(`Apply OCR values to expense "${expense.title}"?\n\n${extractedSummary}`);
      if (!shouldApply) return;

      const applied = await applyExpenseReceiptOcr(eventId, expense.id, ocr.id, {
        title: extracted.title ?? expense.title,
        amount: extracted.amount ?? expense.amount,
        vendor_name: extracted.vendor_name ?? expense.vendor_name ?? undefined,
        override_reason: 'Applied OCR extracted fields from budget page review.',
      });

      upsertExpense(applied.expense);
      const cats = await listCategories(eventId);
      setCategories(cats);
      setSummary(computeSummary(cats));
      setWorkflowSummary(await getExpenseWorkflowSummary(eventId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed OCR extraction or apply flow.');
    } finally {
      setOcrBusyExpenseId(null);
    }
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function openAddCategory(): void {
    setEditingCategory(undefined);
    setCatDialogOpen(true);
  }

  function openEditCategory(cat: BudgetCategory): void {
    setEditingCategory(cat);
    setCatDialogOpen(true);
  }

  function openAddExpense(): void {
    setEditingExpense(undefined);
    setExpDialogOpen(true);
  }

  async function handleExportPdf(): Promise<void> {
    setExporting(true);
    setError(null);
    try {
      generateExpenseSummaryPdf({ categories, expenses, summary });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF.');
    } finally {
      setExporting(false);
    }
  }

  function openEditExpense(exp: Expense): void {
    setEditingExpense(exp);
    setExpDialogOpen(true);
  }

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={240} height={40} sx={{ mb: 2 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[0, 1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rounded" height={280} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={200} />
      </Box>
    );
  }

  return (
    <PageLayout
      title="Budget Management"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Budget' }]}
      actions={
        <Stack direction="row" gap={1}>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdfRounded />}
            onClick={() => void handleExportPdf()}
            disabled={exporting || (categories.length === 0 && expenses.length === 0)}
            aria-label="Export expense summary as PDF"
          >
            {exporting ? 'Exporting…' : 'Export PDF'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddRounded />}
            onClick={openAddCategory}
            aria-label="Add budget category"
          >
            Add Category
          </Button>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={openAddExpense}
            disabled={categories.length === 0}
            aria-label="Add expense"
          >
            Add Expense
          </Button>
        </Stack>
      }
    >

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI cards */}
      <Box sx={{ mb: 3 }}>
        <BudgetSummaryCards summary={summary} />
      </Box>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={1}
            sx={{ mb: 2 }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Similar Event Budget Comparison
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Benchmark this event against similar accessible events using type, location, scale, tags, and timing.
              </Typography>
            </Box>
            <Button variant="outlined" size="small" onClick={() => void loadComparison()} disabled={comparisonLoading}>
              Refresh Comparison
            </Button>
          </Stack>

          {comparisonError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setComparisonError(null)}>
              {comparisonError}
            </Alert>
          )}

          {comparisonLoading ? (
            <Stack spacing={1.5}>
              <Skeleton variant="text" width={220} height={28} />
              <Skeleton variant="rounded" height={52} />
              <Skeleton variant="rounded" height={160} />
            </Stack>
          ) : comparisonData && comparisonData.comparison.length > 0 ? (
            <Stack spacing={2}>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Chip label={`Current planned ${fmt(summary.totalPlanned)}`} size="small" />
                <Chip label={`Peer avg planned ${fmt(comparisonData.overview.averagePlanned)}`} size="small" variant="outlined" />
                <Chip label={`Peer avg spent ${fmt(comparisonData.overview.averageSpent)}`} size="small" variant="outlined" />
                <Chip label={`Peer avg planned used ${comparisonData.overview.averagePlannedPercentUsed}%`} size="small" variant="outlined" />
              </Stack>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small" aria-label="Similar event budget comparison table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Event</TableCell>
                      <TableCell>Match</TableCell>
                      <TableCell align="right">Categories</TableCell>
                      <TableCell align="right">Planned</TableCell>
                      <TableCell align="right">Spent</TableCell>
                      <TableCell align="right">Planned Remaining</TableCell>
                      <TableCell align="right">Planned Used</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {comparisonData.comparison.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {item.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {new Date(item.date).toLocaleDateString()} | {item.location}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {item.eventType ?? 'Other'}{item.capacity ? ` | Capacity ${item.capacity}` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" flexWrap="wrap" gap={0.5}>
                            <Chip label={`Score ${item.matchScore}`} size="small" color="primary" />
                            {item.matchReasons.map((reason) => (
                              <Chip key={`${item.id}-${reason}`} label={reason} size="small" variant="outlined" />
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{item.summary.categoryCount}</TableCell>
                        <TableCell align="right">{fmt(item.summary.totalPlanned)}</TableCell>
                        <TableCell align="right">{fmt(item.summary.totalSpent)}</TableCell>
                        <TableCell align="right">{fmt(item.summary.plannedRemaining)}</TableCell>
                        <TableCell align="right">{item.summary.plannedPercentUsed}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No comparable events with budget data are available yet.
            </Typography>
          )}
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No budget categories yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Create a category to start tracking your event budget.
          </Typography>
          <Button variant="contained" startIcon={<AddRounded />} onClick={openAddCategory}>
            Add First Category
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {/* Category progress bars */}
          <Grid item xs={12} md={7}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
                  Category Breakdown
                </Typography>
                <Stack spacing={2}>
                  {categories.map((cat) => {
                    const pct =
                      cat.allocated_amount > 0
                        ? Math.min(100, Math.round((cat.spent / cat.allocated_amount) * 100))
                        : 0;
                    const overBudget = cat.spent > cat.allocated_amount;
                    return (
                      <Box key={cat.id}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Stack direction="row" alignItems="center" gap={1}>
                            <Box
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: cat.color ?? 'primary.main',
                                flexShrink: 0,
                              }}
                              aria-hidden="true"
                            />
                            <Typography variant="body2" fontWeight={600}>
                              {cat.name}
                            </Typography>
                            {overBudget && (
                              <Chip label="Over budget" color="error" size="small" />
                            )}
                          </Stack>
                          <Stack direction="row" alignItems="center" gap={1}>
                            <Tooltip title="Edit category">
                              <IconButton size="small" onClick={() => openEditCategory(cat)} aria-label={`Edit ${cat.name}`}>
                                <EditRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete category">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => void handleDeleteCategory(cat)}
                                aria-label={`Delete ${cat.name}`}
                              >
                                <DeleteRounded fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Stack>
                        <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              flexGrow: 1,
                              height: 8,
                              borderRadius: 4,
                              bgcolor: 'action.hover',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: overBudget ? 'error.main' : cat.color ?? 'primary.main',
                              },
                            }}
                            aria-label={`${cat.name} budget usage`}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40, textAlign: 'right' }}>
                            {pct}%
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {fmt(cat.spent)} of {fmt(cat.allocated_amount)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Planned: {fmt(cat.plannedTotal)} (Tax {fmt(cat.taxAmount)}, Gratuity {fmt(cat.gratuityAmount)}, Contingency {fmt(cat.contingencyAmount)})
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Rates: Tax {cat.tax_rate}% | Gratuity {cat.gratuity_rate}% | Contingency {cat.contingency_rate}%
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Pie chart */}
          <Grid item xs={12} md={5}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  Spending by Category
                </Typography>
                <BudgetChart categories={categories} />
              </CardContent>
            </Card>
          </Grid>

          {/* Forecast card (#462) */}
          {eventId && (
            <Grid item xs={12}>
              <BudgetForecastCard eventId={eventId} />
            </Grid>
          )}

          {/* Expenses table */}
          <Grid item xs={12}>
            <Card variant="outlined">
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Expenses ({expenses.length})
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AddRounded />}
                    onClick={openAddExpense}
                  >
                    Add Expense
                  </Button>
                </Stack>
                {expenses.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No expenses recorded yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {workflowSummary && (
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        <Chip label={`Approval pending ${workflowSummary.approval.pending}`} size="small" color="warning" />
                        <Chip label={`Reimbursement requested ${workflowSummary.reimbursement.requested}`} size="small" color="warning" variant="outlined" />
                        <Chip label={`Reimbursed ${workflowSummary.reimbursement.reimbursed}`} size="small" color="success" variant="outlined" />
                        <Chip label={`Requested total ${fmt(workflowSummary.reimbursementRequestedAmount)}`} size="small" variant="outlined" />
                      </Stack>
                    )}
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="Expenses table">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell align="right">Amount</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Approval</TableCell>
                          <TableCell>Reimbursement</TableCell>
                          <TableCell>Vendor</TableCell>
                          <TableCell>Date</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {expenses.map((exp) => (
                          <TableRow key={exp.id} hover>
                            <TableCell>{exp.title}</TableCell>
                            <TableCell>{exp.category_name ?? '—'}</TableCell>
                            <TableCell align="right">{fmt(exp.amount)}</TableCell>
                            <TableCell>
                              <Chip
                                label={exp.payment_status}
                                color={PAYMENT_COLORS[exp.payment_status] ?? 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={exp.approval_status}
                                color={APPROVAL_COLORS[exp.approval_status] ?? 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={exp.reimbursement_status}
                                color={REIMBURSEMENT_COLORS[exp.reimbursement_status] ?? 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>{exp.vendor_name ?? '—'}</TableCell>
                            <TableCell>
                              {exp.created_at
                                ? new Date(exp.created_at).toLocaleDateString()
                                : '—'}
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Edit expense">
                                <IconButton
                                  size="small"
                                  onClick={() => openEditExpense(exp)}
                                  aria-label={`Edit expense ${exp.title}`}
                                >
                                  <EditRounded fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {exp.can_approve && (
                                <>
                                  <Button
                                    size="small"
                                    color="success"
                                    onClick={() => void handleApproveExpense(exp, 'approved')}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() => void handleApproveExpense(exp, 'rejected')}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {exp.can_request_reimbursement && (
                                <Button
                                  size="small"
                                  color="warning"
                                  onClick={() => void handleRequestReimbursement(exp)}
                                >
                                  Request Reimbursement
                                </Button>
                              )}
                              {exp.can_resolve_reimbursement && (
                                <>
                                  <Button
                                    size="small"
                                    color="success"
                                    onClick={() => void handleResolveReimbursement(exp, 'reimbursed')}
                                  >
                                    Mark Reimbursed
                                  </Button>
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() => void handleResolveReimbursement(exp, 'rejected')}
                                  >
                                    Reject Request
                                  </Button>
                                </>
                              )}
                              <Button
                                size="small"
                                onClick={() => void handleExtractAndApplyOcr(exp)}
                                disabled={ocrBusyExpenseId === exp.id}
                              >
                                {ocrBusyExpenseId === exp.id ? 'OCR…' : 'OCR Extract'}
                              </Button>
                              <Tooltip title="Delete expense">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => void handleDeleteExpense(exp)}
                                  aria-label={`Delete expense ${exp.title}`}
                                >
                                  <DeleteRounded fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Dialogs */}
      <AddCategoryDialog
        open={catDialogOpen}
        onClose={() => {
          setCatDialogOpen(false);
          setEditingCategory(undefined);
        }}
        onSave={handleSaveCategory}
        initialValues={editingCategory}
      />
      <AddExpenseDialog
        open={expDialogOpen}
        onClose={() => {
          setExpDialogOpen(false);
          setEditingExpense(undefined);
        }}
        onSave={handleSaveExpense}
        categories={categories}
        initialValues={editingExpense}
      />
    </PageLayout>
  );
}
