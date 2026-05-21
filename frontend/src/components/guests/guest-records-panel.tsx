/**
 * Guest Records Panel — Task #771 / Issue #910
 *
 * Displays the first-class `guests` table entries for an event.
 * Provides create, edit, and delete operations via the /api/events/:id/guest-records endpoints.
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { AddRounded, DeleteRounded, EditRounded } from '@mui/icons-material';
import {
  createGuestRecord,
  deleteGuestRecord,
  listGuestRecords,
  updateGuestRecord,
  type GuestRecord,
  type GuestRecordInput,
} from '../../services/guest-records-service';

interface Props {
  eventId: string;
}

const EMPTY_INPUT: GuestRecordInput = {
  name: '',
  email: '',
  phone: '',
  dietary_restriction: '',
  accessibility_needs: '',
};

export function GuestRecordsPanel({ eventId }: Props): JSX.Element {
  const [records, setRecords] = useState<GuestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GuestRecord | null>(null);
  const [form, setForm] = useState<GuestRecordInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback((): void => {
    setLoading(true);
    listGuestRecords(eventId)
      .then(setRecords)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load guest records.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate(): void {
    setEditing(null);
    setForm(EMPTY_INPUT);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(record: GuestRecord): void {
    setEditing(record);
    setForm({
      name: record.name,
      email: record.email,
      phone: record.phone ?? '',
      dietary_restriction: record.dietary_restriction ?? '',
      accessibility_needs: record.accessibility_needs ?? '',
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSave(): Promise<void> {
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const input: GuestRecordInput = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone?.trim() || undefined,
        dietary_restriction: form.dietary_restriction?.trim() || undefined,
        accessibility_needs: form.accessibility_needs?.trim() || undefined,
      };
      if (editing) {
        await updateGuestRecord(eventId, editing.id, input);
      } else {
        await createGuestRecord(eventId, input);
      }
      setDialogOpen(false);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this guest record?')) return;
    try {
      await deleteGuestRecord(eventId, id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Toolbar disableGutters sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1, color: 'text.secondary' }}>
          {records.length} guest profile{records.length !== 1 ? 's' : ''}
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddRounded />}
          onClick={openCreate}
          aria-label="Add guest profile"
        >
          Add Guest Profile
        </Button>
      </Toolbar>

      {records.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          No guest profiles yet. Add one to link a guest identity to RSVP responses.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Guest profiles table">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Dietary</TableCell>
                <TableCell>RSVP Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id} hover>
                  <TableCell>{record.name}</TableCell>
                  <TableCell>{record.email}</TableCell>
                  <TableCell>{record.phone ?? '—'}</TableCell>
                  <TableCell>{record.dietary_restriction ?? '—'}</TableCell>
                  <TableCell>
                    {record.canonical_status ? (
                      <Chip label={record.canonical_status} size="small" />
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        no RSVP
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(record)} aria-label="Edit guest profile">
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(record.id)}
                        aria-label="Delete guest profile"
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Guest Profile' : 'Add Guest Profile'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {formError && (
            <Alert severity="error">{formError}</Alert>
          )}
          <TextField
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            inputProps={{ 'aria-label': 'Guest name' }}
          />
          <TextField
            label="Email"
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            inputProps={{ 'aria-label': 'Guest email' }}
          />
          <TextField
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            inputProps={{ 'aria-label': 'Guest phone' }}
          />
          <TextField
            label="Dietary restriction"
            value={form.dietary_restriction}
            onChange={(e) => setForm((f) => ({ ...f, dietary_restriction: e.target.value }))}
            inputProps={{ 'aria-label': 'Dietary restriction' }}
          />
          <TextField
            label="Accessibility needs"
            value={form.accessibility_needs}
            onChange={(e) => setForm((f) => ({ ...f, accessibility_needs: e.target.value }))}
            inputProps={{ 'aria-label': 'Accessibility needs' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
