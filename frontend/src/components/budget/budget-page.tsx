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
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../lib/api-client';
import {
  BudgetCategory,
  BudgetSummary,
  computeSummary,
  CreateCategoryPayload,
  CreateExpensePayload,
  deleteCategory,
  deleteExpense,
  Expense,
  listCategories,
  listExpenses,
  createCategory,
  createExpense,
  updateCategory,
  updateExpense,
} from '../../services/budget-service';
import { BudgetSummaryCards } from './budget-summary-cards';
import { BudgetChart } from './budget-chart';
import { AddCategoryDialog } from './add-category-dialog';
import { AddExpenseDialog } from './add-expense-dialog';
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

export default function BudgetPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<BudgetSummary>({
    totalAllocated: 0,
    totalSpent: 0,
    remaining: 0,
    percentUsed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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
      const [cats, exps] = await Promise.all([
        listCategories(eventId),
        listExpenses(eventId),
      ]);
      setCategories(cats);
      setExpenses(exps);
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

  // ─── Category handlers ──────────────────────────────────────────────────────

  async function handleSaveCategory(payload: CreateCategoryPayload): Promise<void> {
    if (!eventId) return;
    if (editingCategory) {
      const updated = await updateCategory(eventId, editingCategory.id, payload);
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } else {
      const created = await createCategory(eventId, payload);
      setCategories((prev) => [...prev, created]);
    }
    setSummary(() => {
      const cats = editingCategory
        ? categories.map((c) =>
            c.id === editingCategory.id ? { ...c, allocated_amount: payload.allocated_amount } : c,
          )
        : [...categories, { allocated_amount: payload.allocated_amount, spent: 0 } as BudgetCategory];
      return computeSummary(cats);
    });
    setEditingCategory(undefined);
  }

  async function handleDeleteCategory(category: BudgetCategory): Promise<void> {
    if (!eventId) return;
    if (!window.confirm(`Delete category "${category.name}" and all its expenses?`)) return;
    await deleteCategory(eventId, category.id);
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    setExpenses((prev) => prev.filter((e) => e.category_id !== category.id));
    void load();
  }

  // ─── Expense handlers ───────────────────────────────────────────────────────

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
  }

  async function handleDeleteExpense(expense: Expense): Promise<void> {
    if (!eventId) return;
    if (!window.confirm(`Delete expense "${expense.title}"?`)) return;
    await deleteExpense(eventId, expense.id);
    setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
    const cats = await listCategories(eventId);
    setCategories(cats);
    setSummary(computeSummary(cats));
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <IconButton onClick={() => navigate(-1)} size="small" aria-label="Go back">
            <ArrowBackRounded />
          </IconButton>
          <Typography variant="h5" fontWeight={700}>
            Budget Management
          </Typography>
        </Stack>
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
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI cards */}
      <Box sx={{ mb: 3 }}>
        <BudgetSummaryCards summary={summary} />
      </Box>

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
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="Expenses table">
                      <TableHead>
                        <TableRow>
                          <TableCell>Title</TableCell>
                          <TableCell>Category</TableCell>
                          <TableCell align="right">Amount</TableCell>
                          <TableCell>Status</TableCell>
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
    </Box>
  );
}
