/**
 * Event custom fields editor (#541, #577).
 *
 * Renders the existing custom field list with inline edit + a "Add field"
 * dialog. Field definitions and values are managed in the same row so the
 * UX stays in one place.
 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AddRounded, DeleteRounded } from '@mui/icons-material';
import {
  EventCustomField,
  createCustomField,
  deleteCustomField,
  listCustomFields,
  updateCustomField,
} from '../../services/events-service';
import { ApiError } from '../../lib/api-client';

interface Props {
  eventId: string | number;
  canEdit: boolean;
}

const FIELD_TYPES: EventCustomField['field_type'][] = [
  'text',
  'number',
  'boolean',
  'date',
  'url',
  'select',
];

interface NewFieldForm {
  field_key: string;
  label: string;
  field_type: EventCustomField['field_type'];
  value: string;
  required: boolean;
  optionsRaw: string;
}

const EMPTY_FORM: NewFieldForm = {
  field_key: '',
  label: '',
  field_type: 'text',
  value: '',
  required: false,
  optionsRaw: '',
};

export default function EventCustomFieldsPanel({ eventId, canEdit }: Props): JSX.Element {
  const [fields, setFields] = useState<EventCustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState<NewFieldForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const list = await listCustomFields(eventId);
      setFields(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load custom fields.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<EventCustomField> & { options?: string[] } = {
        field_key: form.field_key.trim(),
        label: form.label.trim(),
        field_type: form.field_type,
        value: form.value || null,
        required: form.required,
      };
      if (form.field_type === 'select') {
        payload.options = form.optionsRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      await createCustomField(eventId, payload);
      setForm(EMPTY_FORM);
      setOpenDialog(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create field.');
    } finally {
      setSaving(false);
    }
  }

  async function handleValueChange(field: EventCustomField, value: string): Promise<void> {
    try {
      await updateCustomField(eventId, field.id, { value });
      setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, value } : f)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update field.');
    }
  }

  async function handleDelete(field: EventCustomField): Promise<void> {
    if (!window.confirm(`Delete custom field "${field.label}"?`)) return;
    try {
      await deleteCustomField(eventId, field.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete field.');
    }
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }} data-testid="event-custom-fields-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Custom Fields
        </Typography>
        {canEdit && (
          <Button
            size="small"
            startIcon={<AddRounded />}
            onClick={() => setOpenDialog(true)}
            data-testid="custom-field-add"
          >
            Add field
          </Button>
        )}
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading custom fields…
        </Typography>
      ) : fields.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No custom fields yet.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {fields.map((field) => (
            <Box
              key={field.id}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
              data-testid={`custom-field-${field.field_key}`}
            >
              <Typography sx={{ minWidth: 160 }} fontWeight={500}>
                {field.label}
                {field.required && (
                  <Chip
                    label="required"
                    size="small"
                    color="warning"
                    sx={{ ml: 1, verticalAlign: 'middle' }}
                  />
                )}
              </Typography>
              {field.field_type === 'select' && Array.isArray(field.options) ? (
                <TextField
                  size="small"
                  select
                  value={field.value ?? ''}
                  onChange={(e) => void handleValueChange(field, e.target.value)}
                  disabled={!canEdit}
                  sx={{ minWidth: 200 }}
                >
                  {field.options.map((opt) => (
                    <MenuItem key={opt} value={opt}>
                      {opt}
                    </MenuItem>
                  ))}
                </TextField>
              ) : field.field_type === 'boolean' ? (
                <TextField
                  size="small"
                  select
                  value={field.value ?? ''}
                  onChange={(e) => void handleValueChange(field, e.target.value)}
                  disabled={!canEdit}
                  sx={{ minWidth: 120 }}
                >
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </TextField>
              ) : (
                <TextField
                  size="small"
                  type={
                    field.field_type === 'number'
                      ? 'number'
                      : field.field_type === 'date'
                        ? 'date'
                        : field.field_type === 'url'
                          ? 'url'
                          : 'text'
                  }
                  value={field.value ?? ''}
                  onChange={(e) => void handleValueChange(field, e.target.value)}
                  disabled={!canEdit}
                  sx={{ flex: 1, minWidth: 200 }}
                />
              )}
              {canEdit && (
                <IconButton
                  size="small"
                  aria-label="Delete field"
                  onClick={() => void handleDelete(field)}
                >
                  <DeleteRounded fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add custom field</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Field key"
              helperText="Lowercase letters, numbers, and underscores."
              value={form.field_key}
              onChange={(e) => setForm((p) => ({ ...p, field_key: e.target.value }))}
              required
              inputProps={{ pattern: '[a-z][a-z0-9_]{0,59}' }}
              fullWidth
            />
            <TextField
              label="Label"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              required
              fullWidth
            />
            <TextField
              label="Type"
              select
              value={form.field_type}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  field_type: e.target.value as EventCustomField['field_type'],
                }))
              }
              fullWidth
            >
              {FIELD_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            {form.field_type === 'select' && (
              <TextField
                label="Options (comma-separated)"
                value={form.optionsRaw}
                onChange={(e) => setForm((p) => ({ ...p, optionsRaw: e.target.value }))}
                fullWidth
                required
              />
            )}
            <TextField
              label="Initial value (optional)"
              value={form.value}
              onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Required"
              select
              value={form.required ? 'true' : 'false'}
              onChange={(e) => setForm((p) => ({ ...p, required: e.target.value === 'true' }))}
              fullWidth
            >
              <MenuItem value="false">No</MenuItem>
              <MenuItem value="true">Yes</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} variant="contained">
            {saving ? 'Saving…' : 'Create field'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
