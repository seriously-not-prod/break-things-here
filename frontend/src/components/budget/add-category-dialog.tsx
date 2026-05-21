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
  tax_rate: string;
  gratuity_rate: string;
  contingency_rate: string;
  color: string;
}

const EMPTY: FormState = {
  name: '',
  allocated_amount: '',
  tax_rate: '0',
  gratuity_rate: '0',
  contingency_rate: '0',
  color: '#F97316',
};

function toFormState(c: BudgetCategory): FormState {
  return {
    name: c.name,
    allocated_amount: String(c.allocated_amount),
    tax_rate: String(c.tax_rate ?? 0),
    gratuity_rate: String(c.gratuity_rate ?? 0),
    contingency_rate: String(c.contingency_rate ?? 0),
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
    const parsedTax = Number(form.tax_rate);
    const parsedGratuity = Number(form.gratuity_rate);
    const parsedContingency = Number(form.contingency_rate);
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('Allocated amount must be a non-negative number.');
      return;
    }
    if (!Number.isFinite(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      setError('Tax rate must be between 0 and 100.');
      return;
    }
    if (!Number.isFinite(parsedGratuity) || parsedGratuity < 0 || parsedGratuity > 100) {
      setError('Gratuity rate must be between 0 and 100.');
      return;
    }
    if (!Number.isFinite(parsedContingency) || parsedContingency < 0 || parsedContingency > 100) {
      setError('Contingency rate must be between 0 and 100.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        allocated_amount: parsedAmount,
        tax_rate: parsedTax,
        gratuity_rate: parsedGratuity,
        contingency_rate: parsedContingency,
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
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="add-category-dialog-title"
    >
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
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      bgcolor: c.value,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  {c.label}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField
            id="category-tax-rate"
            label="Tax Rate (%)"
            name="tax_rate"
            type="number"
            value={form.tax_rate}
            onChange={handleChange}
            fullWidth
            margin="normal"
            inputProps={{ min: 0, max: 100, step: '0.01' }}
          />
          <TextField
            id="category-gratuity-rate"
            label="Gratuity Rate (%)"
            name="gratuity_rate"
            type="number"
            value={form.gratuity_rate}
            onChange={handleChange}
            fullWidth
            margin="normal"
            inputProps={{ min: 0, max: 100, step: '0.01' }}
          />
          <TextField
            id="category-contingency-rate"
            label="Contingency Rate (%)"
            name="contingency_rate"
            type="number"
            value={form.contingency_rate}
            onChange={handleChange}
            fullWidth
            margin="normal"
            inputProps={{ min: 0, max: 100, step: '0.01' }}
          />
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
