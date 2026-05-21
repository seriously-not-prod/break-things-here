/**
 * Budget Templates Page (#438)
 * Lists, creates, and applies reusable budget templates.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import ApplyIcon from '@mui/icons-material/PlaylistAddCheckRounded';
import {
  BudgetTemplate,
  CreateTemplatePayload,
  applyBudgetTemplate,
  createBudgetTemplate,
  deleteBudgetTemplate,
  listBudgetTemplates,
} from '../../services/budget-templates-service';

interface Props {
  /** When provided, shows an "Apply" button that creates categories in the event */
  eventId?: number | string;
  onApplied?: () => void;
}

interface NewItem {
  name: string;
  allocated_amount: string;
  color: string;
}

const DEFAULT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function BudgetTemplatesPage({ eventId, onApplied }: Props): JSX.Element {
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form state for new template
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newItems, setNewItems] = useState<NewItem[]>([
    { name: '', allocated_amount: '', color: DEFAULT_COLORS[0] },
  ]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      setLoading(true);
      const data = await listBudgetTemplates();
      setTemplates(data);
    } catch {
      setError('Failed to load budget templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (): Promise<void> => {
    setFormError(null);
    if (!newName.trim()) {
      setFormError('Template name is required.');
      return;
    }
    const validItems = newItems.filter((i) => i.name.trim());
    if (validItems.length === 0) {
      setFormError('At least one item is required.');
      return;
    }
    for (const item of validItems) {
      if (Number(item.allocated_amount) < 0) {
        setFormError('Allocated amounts must be non-negative.');
        return;
      }
    }

    const payload: CreateTemplatePayload = {
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      items: validItems.map((i) => ({
        name: i.name.trim(),
        allocated_amount: Number(i.allocated_amount) || 0,
        color: i.color,
      })),
    };

    try {
      setSaving(true);
      await createBudgetTemplate(payload);
      setCreateOpen(false);
      setNewName('');
      setNewDesc('');
      setNewItems([{ name: '', allocated_amount: '', color: DEFAULT_COLORS[0] }]);
      await load();
    } catch {
      setFormError('Failed to create template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    setDeleting(id);
    try {
      await deleteBudgetTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Failed to delete template.');
    } finally {
      setDeleting(null);
    }
  };

  const handleApply = async (templateId: number): Promise<void> => {
    if (!eventId) return;
    setApplying(templateId);
    try {
      await applyBudgetTemplate(eventId, templateId);
      onApplied?.();
    } catch {
      setError('Failed to apply template to event.');
    } finally {
      setApplying(null);
    }
  };

  const addItemRow = (): void => {
    setNewItems((prev) => [
      ...prev,
      {
        name: '',
        allocated_amount: '',
        color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length],
      },
    ]);
  };

  const updateItemRow = (idx: number, field: keyof NewItem, value: string): void => {
    setNewItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const removeItemRow = (idx: number): void => {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Budget Templates</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>
          New Template
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {templates.length === 0 ? (
        <Alert severity="info">No budget templates yet. Create one to reuse across events.</Alert>
      ) : (
        <Stack spacing={2}>
          {templates.map((t) => (
            <Card key={t.id} variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t.name}
                </Typography>
                {t.description && (
                  <Typography variant="body2" color="text.secondary">
                    {t.description}
                  </Typography>
                )}
                <Chip label={`${t.item_count ?? 0} categories`} size="small" sx={{ mt: 1 }} />
              </CardContent>
              <CardActions>
                {eventId && (
                  <Button
                    size="small"
                    startIcon={<ApplyIcon />}
                    onClick={() => void handleApply(t.id)}
                    disabled={applying === t.id}
                  >
                    {applying === t.id ? 'Applying…' : 'Apply to Event'}
                  </Button>
                )}
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => void handleDelete(t.id)}
                  disabled={deleting === t.id}
                  aria-label={`Delete template ${t.name}`}
                >
                  <DeleteRounded fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Budget Template</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Template Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            <Typography variant="subtitle2">Categories</Typography>
            {newItems.map((item, idx) => (
              <Stack key={idx} direction="row" spacing={1} alignItems="center">
                <TextField
                  label="Category name"
                  value={item.name}
                  onChange={(e) => updateItemRow(idx, 'name', e.target.value)}
                  size="small"
                  sx={{ flex: 2 }}
                />
                <TextField
                  label="Amount ($)"
                  type="number"
                  value={item.allocated_amount}
                  onChange={(e) => updateItemRow(idx, 'allocated_amount', e.target.value)}
                  size="small"
                  sx={{ flex: 1 }}
                  inputProps={{ min: 0 }}
                />
                <input
                  type="color"
                  value={item.color}
                  onChange={(e) => updateItemRow(idx, 'color', e.target.value)}
                  style={{
                    width: 36,
                    height: 36,
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  aria-label={`Color for category ${item.name || idx + 1}`}
                />
                {newItems.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={() => removeItemRow(idx)}
                    aria-label="Remove row"
                  >
                    <DeleteRounded fontSize="small" />
                  </IconButton>
                )}
              </Stack>
            ))}
            <Button size="small" onClick={addItemRow} startIcon={<AddRounded />}>
              Add Category
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
