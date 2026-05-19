/**
 * Store Suggestions Panel (#464)
 * Allows users to suggest, review, and manage store suggestions for an event.
 */

import { useCallback, useEffect, useState } from 'react';
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
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import {
  StoreSuggestion,
  createStoreSuggestion,
  deleteStoreSuggestion,
  listStoreSuggestions,
  updateStoreSuggestionStatus,
} from '../../services/store-suggestions-service';

interface Props {
  eventId: number | string;
  /** Whether the current user can approve/reject (event owner) */
  canModerate?: boolean;
}

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

const FILTER_OPTIONS = ['all', 'pending', 'approved', 'rejected'] as const;

export default function StoreSuggestionsPanel({ eventId, canModerate = false }: Props): JSX.Element {
  const [suggestions, setSuggestions] = useState<StoreSuggestion[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const data = await listStoreSuggestions(eventId, filter === 'all' ? undefined : filter);
      setSuggestions(data);
    } catch {
      setError('Failed to load store suggestions.');
    } finally {
      setLoading(false);
    }
  }, [eventId, filter]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (): Promise<void> => {
    setFormError(null);
    if (!name.trim()) { setFormError('Store name is required.'); return; }
    try {
      setSaving(true);
      await createStoreSuggestion(eventId, {
        name: name.trim(),
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
        category: category.trim() || undefined,
      });
      setAddOpen(false);
      setName('');
      setWebsite('');
      setNotes('');
      setCategory('');
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add suggestion.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, status: 'approved' | 'rejected'): Promise<void> => {
    try {
      const updated = await updateStoreSuggestionStatus(eventId, id, status);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      setError('Failed to update suggestion status.');
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    try {
      await deleteStoreSuggestion(eventId, id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to delete suggestion.');
    }
  };

  if (loading) return <CircularProgress />;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Store Suggestions</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAddOpen(true)}>
          Suggest Store
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filter */}
      <Stack direction="row" spacing={1} mb={2}>
        {FILTER_OPTIONS.map((f) => (
          <Chip
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            onClick={() => setFilter(f)}
            color={filter === f ? 'primary' : 'default'}
            size="small"
            variant={filter === f ? 'filled' : 'outlined'}
          />
        ))}
      </Stack>

      {suggestions.length === 0 ? (
        <Alert severity="info">No store suggestions found.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {suggestions.map((s) => (
            <Box
              key={s.id}
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                  <Typography variant="subtitle2">{s.name}</Typography>
                  <Chip label={s.status} color={STATUS_COLORS[s.status] ?? 'default'} size="small" />
                  {s.category && <Chip label={s.category} size="small" variant="outlined" />}
                </Stack>
                {s.website && (
                  <Typography variant="body2">
                    <a href={s.website} target="_blank" rel="noopener noreferrer">{s.website}</a>
                  </Typography>
                )}
                {s.notes && (
                  <Typography variant="body2" color="text.secondary">{s.notes}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  Suggested by {s.suggester_name ?? 'Unknown'} · {new Date(s.created_at).toLocaleDateString()}
                </Typography>
              </Box>

              <Stack direction="row" spacing={0.5}>
                {canModerate && s.status === 'pending' && (
                  <>
                    <Tooltip title="Approve">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => void handleStatusChange(s.id, 'approved')}
                        aria-label={`Approve ${s.name}`}
                      >
                        <CheckRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Reject">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void handleStatusChange(s.id, 'rejected')}
                        aria-label={`Reject ${s.name}`}
                      >
                        <CloseRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Delete">
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => void handleDelete(s.id)}
                    aria-label={`Delete ${s.name}`}
                  >
                    <DeleteRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Suggest a Store</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Store Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              size="small"
            />
            <TextField
              label="Website (optional)"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              fullWidth
              size="small"
              placeholder="https://example.com"
            />
            <TextField
              label="Category (optional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              fullWidth
              size="small"
              placeholder="e.g. Catering, Décor, AV"
            />
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              fullWidth
              multiline
              rows={2}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleCreate()} disabled={saving}>
            {saving ? 'Saving…' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
