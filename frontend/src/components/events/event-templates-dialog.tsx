/**
 * Templates Dialog — story #410, task #434
 *
 * Self-contained surface that lets organizers list / create / edit / delete
 * event templates and apply one to a freshly-created event. Used from the
 * events list bulk toolbar (`Templates` button).
 */

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
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
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';

import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  EventTemplate,
  listTemplates,
  updateTemplate,
} from '../../services/event-templates-service';

interface EventTemplatesDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a template is successfully applied so the parent can reload. */
  onTemplateApplied?: (_eventId: number) => void;
}

interface TemplateFormState {
  name: string;
  description: string;
  default_title: string;
  default_location: string;
  default_capacity: string;
  default_event_type: string;
  default_status: 'Draft' | 'Active' | 'Completed';
  default_tags: string;
  default_waitlist_enabled: boolean;
}

const EMPTY_FORM: TemplateFormState = {
  name: '',
  description: '',
  default_title: '',
  default_location: '',
  default_capacity: '',
  default_event_type: '',
  default_status: 'Draft',
  default_tags: '',
  default_waitlist_enabled: false,
};

const STATUS_OPTIONS: TemplateFormState['default_status'][] = ['Draft', 'Active', 'Completed'];

interface ApplyDialogState {
  open: boolean;
  templateId: number | null;
  templateName: string;
  date: string;
  titleOverride: string;
  saving: boolean;
  error: string | null;
}

const EMPTY_APPLY: ApplyDialogState = {
  open: false,
  templateId: null,
  templateName: '',
  date: '',
  titleOverride: '',
  saving: false,
  error: null,
};

export function EventTemplatesDialog({
  open,
  onClose,
  onTemplateApplied,
}: EventTemplatesDialogProps): JSX.Element {
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apply, setApply] = useState<ApplyDialogState>(EMPTY_APPLY);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const result = await listTemplates();
      setTemplates(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void load();
    }
  }, [open]);

  function openCreate(): void {
    setEditorMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function openEdit(t: EventTemplate): void {
    setEditorMode('edit');
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? '',
      default_title: t.default_title ?? '',
      default_location: t.default_location ?? '',
      default_capacity: t.default_capacity === null ? '' : String(t.default_capacity),
      default_event_type: t.default_event_type ?? '',
      default_status: (t.default_status as TemplateFormState['default_status']) ?? 'Draft',
      default_tags: t.default_tags ?? '',
      default_waitlist_enabled: !!t.default_waitlist_enabled,
    });
    setSaveError(null);
  }

  function closeEditor(): void {
    setEditorMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function field<K extends keyof TemplateFormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const value =
        key === 'default_waitlist_enabled'
          ? e.target.checked
          : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value as TemplateFormState[K] }));
    };
  }

  async function saveTemplate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaveError(null);
    if (!form.name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        default_title: form.default_title.trim() || null,
        default_location: form.default_location.trim() || null,
        default_capacity: form.default_capacity ? Number(form.default_capacity) : null,
        default_event_type: form.default_event_type.trim() || null,
        default_status: form.default_status,
        default_tags: form.default_tags.trim() || null,
        default_waitlist_enabled: form.default_waitlist_enabled,
      };
      if (editorMode === 'edit' && editingId) {
        await updateTemplate(editingId, payload);
      } else {
        await createTemplate(payload);
      }
      closeEditor();
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: EventTemplate): Promise<void> {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    try {
      await deleteTemplate(t.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  function startApply(t: EventTemplate): void {
    setApply({
      open: true,
      templateId: t.id,
      templateName: t.name,
      date: '',
      titleOverride: t.default_title ?? t.name,
      saving: false,
      error: null,
    });
  }

  async function confirmApply(): Promise<void> {
    if (!apply.templateId) return;
    if (!apply.date) {
      setApply((prev) => ({ ...prev, error: 'Date is required.' }));
      return;
    }
    setApply((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const created = await applyTemplate(apply.templateId, {
        date: apply.date,
        title: apply.titleOverride.trim() || undefined,
      });
      setApply(EMPTY_APPLY);
      onTemplateApplied?.(created.id);
      onClose();
    } catch (err) {
      setApply((prev) => ({
        ...prev,
        saving: false,
        error: err instanceof Error ? err.message : 'Apply failed.',
      }));
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Event Templates</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Save common event setups and apply them with one click.
            </Typography>
            <Button
              size="small"
              variant="contained"
              startIcon={<AddRounded />}
              onClick={openCreate}
            >
              New template
            </Button>
          </Stack>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={20} />
            </Box>
          ) : templates.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No templates yet. Create one to seed events with default fields.
              </Typography>
            </Box>
          ) : (
            <List dense>
              {templates.map((t) => (
                <ListItem
                  key={t.id}
                  divider
                  sx={{ pr: 18 }}
                  data-testid={`event-template-${t.id}`}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="subtitle2">{t.name}</Typography>
                        {t.default_status && (
                          <Chip label={t.default_status} size="small" variant="outlined" />
                        )}
                        {t.default_waitlist_enabled && (
                          <Chip label="Waitlist" size="small" color="warning" variant="outlined" />
                        )}
                      </Stack>
                    }
                    secondary={
                      <Box>
                        {t.description && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            {t.description}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {[
                            t.default_title && `Title: ${t.default_title}`,
                            t.default_location && `Loc: ${t.default_location}`,
                            t.default_capacity != null && `Cap: ${t.default_capacity}`,
                            t.default_event_type && `Type: ${t.default_event_type}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={() => startApply(t)}
                      title="Apply template"
                      aria-label={`Apply template ${t.name}`}
                    >
                      <PlayArrowRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => openEdit(t)}
                      title="Edit template"
                      aria-label={`Edit template ${t.name}`}
                    >
                      <EditRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(t)}
                      title="Delete template"
                      aria-label={`Delete template ${t.name}`}
                    >
                      <DeleteRounded fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}

          {editorMode !== 'closed' && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box component="form" onSubmit={saveTemplate} noValidate>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  {editorMode === 'edit' ? 'Edit template' : 'New template'}
                </Typography>
                <Stack spacing={1.5}>
                  {saveError && <Alert severity="error">{saveError}</Alert>}
                  <TextField
                    label="Template name"
                    value={form.name}
                    onChange={field('name')}
                    required
                    fullWidth
                    autoFocus
                    inputProps={{ 'aria-label': 'template-name', maxLength: 120 }}
                  />
                  <TextField
                    label="Description"
                    value={form.description}
                    onChange={field('description')}
                    multiline
                    rows={2}
                    fullWidth
                  />
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Default title"
                      value={form.default_title}
                      onChange={field('default_title')}
                      fullWidth
                    />
                    <TextField
                      label="Default location"
                      value={form.default_location}
                      onChange={field('default_location')}
                      fullWidth
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Default capacity"
                      type="number"
                      value={form.default_capacity}
                      onChange={field('default_capacity')}
                      inputProps={{ min: 1 }}
                      fullWidth
                    />
                    <TextField
                      label="Default event type"
                      value={form.default_event_type}
                      onChange={field('default_event_type')}
                      fullWidth
                    />
                    <TextField
                      label="Default status"
                      select
                      value={form.default_status}
                      onChange={field('default_status')}
                      fullWidth
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <TextField
                    label="Default tags (comma-separated)"
                    value={form.default_tags}
                    onChange={field('default_tags')}
                    fullWidth
                  />
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <input
                      id="default_waitlist_enabled"
                      type="checkbox"
                      checked={form.default_waitlist_enabled}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, default_waitlist_enabled: e.target.checked }))
                      }
                    />
                    <label htmlFor="default_waitlist_enabled">Enable waitlist by default</label>
                  </Stack>
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button onClick={closeEditor} disabled={saving}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={saving}
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                      {saving ? 'Saving…' : editorMode === 'edit' ? 'Save changes' : 'Create template'}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={apply.open}
        onClose={() => (apply.saving ? null : setApply(EMPTY_APPLY))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Apply template: {apply.templateName}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {apply.error && <Alert severity="error">{apply.error}</Alert>}
            <TextField
              label="Event date"
              type="date"
              value={apply.date}
              onChange={(e) => setApply((prev) => ({ ...prev, date: e.target.value }))}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
              inputProps={{ 'aria-label': 'apply-template-date' }}
            />
            <TextField
              label="Title override (optional)"
              value={apply.titleOverride}
              onChange={(e) => setApply((prev) => ({ ...prev, titleOverride: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApply(EMPTY_APPLY)} disabled={apply.saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void confirmApply()}
            variant="contained"
            disabled={apply.saving}
            startIcon={apply.saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {apply.saving ? 'Creating event…' : 'Create event'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default EventTemplatesDialog;
