/**
 * Custom RSVP question authoring panel (#413, #443).
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AddRounded, DeleteRounded, EditRounded } from '@mui/icons-material';
import {
  createRsvpQuestion,
  deleteRsvpQuestion,
  listRsvpQuestions,
  updateRsvpQuestion,
  type RsvpQuestion,
  type RsvpQuestionInput,
  type RsvpQuestionType,
} from '../../services/guest-service';

interface Props {
  eventId: string | number;
}

const TYPE_LABEL: Record<RsvpQuestionType, string> = {
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multi_choice: 'Multi choice',
  number: 'Number',
  boolean: 'Yes/No',
};

const ALL_TYPES: RsvpQuestionType[] = [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'number',
  'boolean',
];

interface DraftQuestion {
  prompt: string;
  question_type: RsvpQuestionType;
  options: string;
  required: boolean;
  sort_order: number;
}

const EMPTY: DraftQuestion = {
  prompt: '',
  question_type: 'short_text',
  options: '',
  required: false,
  sort_order: 0,
};

export function RsvpQuestionsPanel({ eventId }: Props): JSX.Element {
  const [questions, setQuestions] = useState<RsvpQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<RsvpQuestion | null>(null);
  const [draft, setDraft] = useState<DraftQuestion>(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback((): void => {
    setLoading(true);
    listRsvpQuestions(eventId)
      .then(setQuestions)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load RSVP questions.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew(): void {
    setEditing(null);
    setDraft({ ...EMPTY, sort_order: questions.length });
    setOpen(true);
  }

  function openEdit(q: RsvpQuestion): void {
    setEditing(q);
    setDraft({
      prompt: q.prompt,
      question_type: q.question_type,
      options: (q.options ?? []).join('\n'),
      required: q.required,
      sort_order: q.sort_order,
    });
    setOpen(true);
  }

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      const requiresOptions =
        draft.question_type === 'single_choice' || draft.question_type === 'multi_choice';
      const opts = requiresOptions
        ? draft.options
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : undefined;
      if (requiresOptions && (!opts || opts.length === 0)) {
        throw new Error('Single/multi choice questions need at least one option.');
      }
      const payload: RsvpQuestionInput = {
        prompt: draft.prompt.trim(),
        question_type: draft.question_type,
        required: draft.required,
        sort_order: draft.sort_order,
        options: opts,
      };
      if (editing) {
        await updateRsvpQuestion(eventId, editing.id, payload);
      } else {
        await createRsvpQuestion(eventId, payload);
      }
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(q: RsvpQuestion): Promise<void> {
    if (!window.confirm(`Delete the question "${q.prompt}"? Existing responses will be removed.`)) {
      return;
    }
    try {
      await deleteRsvpQuestion(eventId, q.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete question.');
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Custom RSVP questions
        </Typography>
        <Button startIcon={<AddRounded />} variant="contained" size="small" onClick={openNew}>
          New question
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {questions.length === 0 ? (
        <Alert severity="info">No custom RSVP questions yet.</Alert>
      ) : (
        questions.map((q) => (
          <Paper key={q.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
            <Stack direction="row" alignItems="flex-start" gap={2}>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {q.prompt}
                  </Typography>
                  <Chip size="small" label={TYPE_LABEL[q.question_type]} />
                  {q.required && <Chip size="small" color="warning" label="Required" />}
                </Stack>
                {q.options && q.options.length > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    Options: {q.options.join(', ')}
                  </Typography>
                )}
              </Box>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => openEdit(q)} aria-label="Edit question">
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton size="small" onClick={() => handleDelete(q)} aria-label="Delete question">
                  <DeleteRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Paper>
        ))
      )}

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={handleSave}>
          <DialogTitle>{editing ? 'Edit RSVP question' : 'New RSVP question'}</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 1 }}>
              <TextField
                label="Prompt"
                required
                value={draft.prompt}
                onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                inputProps={{ maxLength: 500 }}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel id="qtype-label">Question type</InputLabel>
                <Select
                  labelId="qtype-label"
                  label="Question type"
                  value={draft.question_type}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, question_type: e.target.value as RsvpQuestionType }))
                  }
                >
                  {ALL_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(draft.question_type === 'single_choice' ||
                draft.question_type === 'multi_choice') && (
                <TextField
                  label="Options (one per line)"
                  multiline
                  minRows={3}
                  value={draft.options}
                  onChange={(e) => setDraft((d) => ({ ...d, options: e.target.value }))}
                  fullWidth
                />
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={draft.required}
                    onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
                  />
                }
                label="Required"
              />
              <TextField
                label="Sort order"
                type="number"
                value={draft.sort_order}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))
                }
                inputProps={{ min: 0 }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add question'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
