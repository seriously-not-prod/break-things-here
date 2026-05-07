import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import type { BudgetCategory, CreateExpensePayload, Expense } from '../../services/budget-service';

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: CreateExpensePayload) => Promise<void>;
  categories: BudgetCategory[];
  /** When provided, the dialog acts as an edit dialog */
  initialValues?: Expense;
}

interface FormState {
  title: string;
  amount: string;
  category_id: string;
  payment_status: 'pending' | 'paid' | 'overdue';
  vendor_name: string;
  notes: string;
}

function buildEmpty(categories: BudgetCategory[]): FormState {
  return {
    title: '',
    amount: '',
    category_id: categories[0] ? String(categories[0].id) : '',
    payment_status: 'pending',
    vendor_name: '',
    notes: '',
  };
}

function toFormState(e: Expense): FormState {
  return {
    title: e.title,
    amount: String(e.amount),
    category_id: String(e.category_id),
    payment_status: e.payment_status,
    vendor_name: e.vendor_name ?? '',
    notes: e.notes ?? '',
  };
}

export function AddExpenseDialog({
  open,
  onClose,
  onSave,
  categories,
  initialValues,
}: AddExpenseDialogProps): JSX.Element {
  const isEdit = !!initialValues;
  const [form, setForm] = useState<FormState>(() =>
    initialValues ? toFormState(initialValues) : buildEmpty(categories),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setForm(initialValues ? toFormState(initialValues) : buildEmpty(categories));
    setError(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    const parsedAmount = Number(form.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Amount must be a non-negative number.');
      return;
    }
    const parsedCategoryId = Number(form.category_id);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      setError('Please select a category.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        amount: parsedAmount,
        category_id: parsedCategoryId,
        payment_status: form.payment_status,
        vendor_name: form.vendor_name.trim() || null,
        notes: form.notes.trim() || null,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth aria-labelledby="add-expense-dialog-title">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DialogTitle id="add-expense-dialog-title">
          {isEdit ? 'Edit Expense' : 'Add Expense'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
              {error}
            </Typography>
          )}
          <TextField
            id="expense-title"
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            fullWidth
            autoFocus
            margin="normal"
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            id="expense-amount"
            label="Amount ($)"
            name="amount"
            type="number"
            value={form.amount}
            onChange={handleChange}
            required
            fullWidth
            margin="normal"
            inputProps={{ min: 0, step: '0.01' }}
          />
          <TextField
            id="expense-category"
            label="Category"
            name="category_id"
            select
            value={form.category_id}
            onChange={handleChange}
            required
            fullWidth
            margin="normal"
          >
            {categories.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            id="expense-status"
            label="Payment Status"
            name="payment_status"
            select
            value={form.payment_status}
            onChange={handleChange}
            fullWidth
            margin="normal"
          >
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
          </TextField>
          <TextField
            id="expense-vendor"
            label="Vendor Name"
            name="vendor_name"
            value={form.vendor_name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            id="expense-notes"
            label="Notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            fullWidth
            multiline
            rows={3}
            margin="normal"
            inputProps={{ maxLength: 1000 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Add Expense'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
