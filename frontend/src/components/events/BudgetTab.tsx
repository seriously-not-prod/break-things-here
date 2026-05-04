import { ChangeEvent, FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { AddRounded, DeleteRounded, EditRounded } from '@mui/icons-material';
import { useBudget } from '../../hooks/useBudget';

interface BudgetTabProps {
  eventId: string | undefined;
  canEdit: boolean;
}

const EXPENSE_STATUSES = ['Pending', 'Approved', 'Rejected'];

export function BudgetTab({ eventId, canEdit }: BudgetTabProps): JSX.Element {
  const {
    budget,
    budgetSummary,
    breakdown,
    expenses,
    categories,
    budgetDialog,
    setBudgetDialog,
    budgetForm,
    setBudgetForm,
    budgetSaving,
    budgetError,
    openBudgetDialog,
    saveBudget,
    expenseDialog,
    setExpenseDialog,
    expenseForm,
    setExpenseForm,
    expenseSaving,
    expenseError,
    openAddExpense,
    openEditExpense,
    saveExpense,
    deleteExpense,
  } = useBudget(eventId);

  // Issue 9: coerce value to Number and use the event's configured currency
  const tooltipFormatter = (value: number | string | readonly (string | number)[] | undefined): string => {
    const raw = Array.isArray(value) ? value[0] : value;
    const numValue = Number(raw);
    const currency = budget?.currency ?? '$';
    return Number.isFinite(numValue) ? `${currency} ${numValue.toFixed(2)}` : String(raw ?? '');
  };

  return (
    <>
      {/* Summary card */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700}>Budget Overview</Typography>
            {budget ? (
              <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Budget</Typography>
                  <Typography fontWeight={600}>{budget.currency} {budgetSummary ? Number(budgetSummary.total_budget).toFixed(2) : '0.00'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                  <Typography fontWeight={600}>{budget.currency} {budgetSummary ? Number(budgetSummary.total_spent).toFixed(2) : '0.00'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Remaining</Typography>
                  <Typography fontWeight={600} color={budgetSummary && budgetSummary.remaining < 0 ? 'error.main' : 'success.main'}>
                    {budget.currency} {budgetSummary ? Number(budgetSummary.remaining).toFixed(2) : '0.00'}
                  </Typography>
                </Box>
              </Stack>
            ) : (
              <Typography color="text.secondary" sx={{ mt: 1 }}>No budget set.</Typography>
            )}
          </Box>
          {canEdit && (
            <Button variant="outlined" onClick={openBudgetDialog}>
              {budget ? 'Edit Budget' : 'Set Budget'}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Pie chart breakdown */}
      {breakdown.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Expense Breakdown by Category</Typography>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={breakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label>
                {breakdown.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.color ?? '#6366f1'} />
                ))}
              </Pie>
              {/* Issue 9: coerce value and use event currency instead of hard-coded $ */}
              <Tooltip formatter={tooltipFormatter} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Expenses table */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>Expenses ({expenses.length})</Typography>
        {canEdit && (
          <Button startIcon={<AddRounded />} variant="contained" size="small" onClick={openAddExpense}>
            Add Expense
          </Button>
        )}
      </Box>

      {expenses.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No expenses recorded.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Title</strong></TableCell>
                <TableCell><strong>Category</strong></TableCell>
                <TableCell align="right"><strong>Amount</strong></TableCell>
                <TableCell><strong>Paid By</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((exp) => (
                <TableRow key={exp.id} hover>
                  <TableCell>{exp.title}</TableCell>
                  <TableCell>
                    {exp.category_name ? (
                      <Chip label={exp.category_name} size="small" sx={{ bgcolor: exp.category_color ?? '#6366f1', color: '#fff', fontWeight: 600 }} />
                    ) : (
                      <Typography variant="body2" color="text.secondary">—</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{budget?.currency ?? '$'} {Number(exp.amount).toFixed(2)}</TableCell>
                  <TableCell>{exp.paid_by ?? '—'}</TableCell>
                  <TableCell>
                    <Chip label={exp.status} size="small"
                      color={exp.status === 'Approved' ? 'success' : exp.status === 'Rejected' ? 'error' : 'default'}
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" startIcon={<EditRounded />} onClick={() => openEditExpense(exp)}>Edit</Button>
                        <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => void deleteExpense(exp.id)}>Delete</Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Budget Dialog */}
      <Dialog open={budgetDialog} onClose={() => setBudgetDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{budget ? 'Edit Budget' : 'Set Budget'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="budget-form" onSubmit={(e: FormEvent) => void saveBudget(e)} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {budgetError && <Alert severity="error">{budgetError}</Alert>}
              <TextField
                label="Total Budget"
                type="number"
                value={budgetForm.total_budget}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, total_budget: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
                required
                fullWidth
              />
              <TextField
                label="Currency"
                value={budgetForm.currency}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, currency: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Notes"
                value={budgetForm.notes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, notes: e.target.value }))}
                multiline
                rows={2}
                fullWidth
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBudgetDialog(false)}>Cancel</Button>
          <Button type="submit" form="budget-form" variant="contained" disabled={budgetSaving}
            startIcon={budgetSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {budgetSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialog} onClose={() => setExpenseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{expenseForm.title && 'Edit Expense' || 'New Expense'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="expense-form" onSubmit={(e: FormEvent) => void saveExpense(e)} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {expenseError && <Alert severity="error">{expenseError}</Alert>}
              <TextField label="Title" value={expenseForm.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, title: e.target.value }))} required fullWidth />
              <TextField
                label="Amount"
                type="number"
                value={expenseForm.amount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
                required
                fullWidth
              />
              <TextField
                label="Category"
                select
                value={expenseForm.category_id}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, category_id: e.target.value }))}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={String(cat.id)}>{cat.name}</MenuItem>
                ))}
              </TextField>
              <TextField label="Paid By" value={expenseForm.paid_by} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, paid_by: e.target.value }))} fullWidth />
              <TextField
                label="Status"
                select
                value={expenseForm.status}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, status: e.target.value }))}
                fullWidth
              >
                {EXPENSE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={expenseForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseDialog(false)}>Cancel</Button>
          <Button type="submit" form="expense-form" variant="contained" disabled={expenseSaving}
            startIcon={expenseSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {expenseSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
