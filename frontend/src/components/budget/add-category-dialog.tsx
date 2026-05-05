import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import type { BudgetCategory, CreateCategoryPayload } from '../../services/budget-service';

const PRESET_COLORS = [
  { label: 'Orange', value: '#F97316' },
  { label: 'Violet', value: '#7C3AED' },
  { label: 'Cyan', value: '#06B6D4' },
  { label: 'Green', value: '#10B981' },
  { label: 'Amber', value: '#F59E0B' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Pink', value: '#EC4899' },
];

interface AddCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: CreateCategoryPayload) => Promise<void>;
  /** When provided, the dialog acts as an edit dialog */
  initialValues?: BudgetCategory;
}

interface FormState {
  name: string;
  allocated_amount: string;
  color: string;
}

const EMPTY: FormState = { name: '', allocated_amount: '', color: '#F97316' };

function toFormState(c: BudgetCategory): FormState {
  return {
    name: c.name,
    allocated_amount: String(c.allocated_amount),
    color: c.color ?? '#F97316',
  };
}

export function AddCategoryDialog({
  open,
  onClose,
  onSave,
  initialValues,
}: AddCategoryDialogProps): JSX.Element {
  const isEdit = !!initialValues;
  const [form, setForm] = useState<FormState>(() =>
    initialValues ? toFormState(initialValues) : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setForm(initialValues ? toFormState(initialValues) : EMPTY);
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

    const parsedAmount = Number(form.allocated_amount);
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Allocated amount must be a non-negative number.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        allocated_amount: parsedAmount,
        color: form.color,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth aria-labelledby="add-category-dialog-title">
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DialogTitle id="add-category-dialog-title">
          {isEdit ? 'Edit Category' : 'Add Budget Category'}
        </DialogTitle>
        <DialogContent>
          {error && (
            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
              {error}
            </Typography>
          )}
          <TextField
            id="category-name"
            label="Category Name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            fullWidth
            autoFocus
            margin="normal"
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            id="category-allocated"
            label="Allocated Amount ($)"
            name="allocated_amount"
            type="number"
            value={form.allocated_amount}
            onChange={handleChange}
            required
            fullWidth
            margin="normal"
            inputProps={{ min: 0, step: '0.01' }}
          />
          <TextField
            id="category-color"
            label="Color"
            name="color"
            select
            value={form.color}
            onChange={handleChange}
            fullWidth
            margin="normal"
          >
            {PRESET_COLORS.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: c.value, flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  {c.label}
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Add Category'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
