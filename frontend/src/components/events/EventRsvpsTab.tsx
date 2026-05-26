import { ChangeEvent, FormEvent, useState } from 'react';
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
import { AddRounded, DeleteRounded, EditRounded } from '@mui/icons-material';
import { api, ApiError, getAuthHeaders } from '../../lib/api-client';

interface Rsvp {
  id: number;
  name: string;
  email: string;
  guests: number;
  status: string;
  notes: string | null;
  source: string;
}

interface EventRsvpsTabProps {
  eventId: string;
  rsvps: Rsvp[];
  canEdit: boolean;
  capacity: number | null | undefined;
  remainingCapacity: number | null;
  onRefresh: () => Promise<void>;
  onError: (msg: string) => void;
}

const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];
const RSVP_EXPORT_FORMAT = 'csv';
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function EventRsvpsTab({
  eventId,
  rsvps,
  canEdit,
  capacity,
  remainingCapacity,
  onRefresh,
  onError,
}: EventRsvpsTabProps): JSX.Element {
  const [rsvpDialog, setRsvpDialog] = useState(false);
  const [editRsvpId, setEditRsvpId] = useState<number | null>(null);
  const [rsvpForm, setRsvpForm] = useState({
    name: '',
    email: '',
    guests: '1',
    status: 'Pending',
    notes: '',
  });
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  function openAddRsvp(): void {
    setEditRsvpId(null);
    setRsvpForm({ name: '', email: '', guests: '1', status: 'Pending', notes: '' });
    setRsvpError(null);
    setRsvpDialog(true);
  }

  function openEditRsvp(r: Rsvp): void {
    setEditRsvpId(r.id);
    setRsvpForm({
      name: r.name,
      email: r.email,
      guests: String(r.guests ?? 1),
      status: r.status,
      notes: r.notes ?? '',
    });
    setRsvpError(null);
    setRsvpDialog(true);
  }

  async function saveRsvp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRsvpError(null);
    setRsvpSaving(true);
    try {
      const guests = Number(rsvpForm.guests || 1);
      if (editRsvpId) {
        await api.patch(`/api/events/${eventId}/rsvps/${editRsvpId}`, { ...rsvpForm, guests });
      } else {
        await api.post(`/api/events/${eventId}/rsvps`, { ...rsvpForm, guests });
      }
      setRsvpDialog(false);
      await onRefresh();
    } catch (err) {
      setRsvpError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setRsvpSaving(false);
    }
  }

  async function deleteRsvp(rsvpId: number): Promise<void> {
    if (!window.confirm('Delete this RSVP?')) return;
    await api.delete(`/api/events/${eventId}/rsvps/${rsvpId}`).catch((err) => onError(err.message));
    await onRefresh();
  }

  async function exportRsvpsCsv(): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE}/api/events/${eventId}/rsvps/export?format=${RSVP_EXPORT_FORMAT}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
          credentials: 'include',
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({ error: response.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? response.statusText);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = window.document.createElement('a');
        link.href = objectUrl;
        link.download = `event-${eventId}-rsvps.csv`;
        link.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'CSV export failed.');
    }
  }

  return (
    <>
      <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {canEdit && (
          <Button variant="contained" startIcon={<AddRounded />} onClick={openAddRsvp}>
            Add RSVP
          </Button>
        )}
        {canEdit && (
          <Button variant="outlined" onClick={exportRsvpsCsv}>
            Export CSV
          </Button>
        )}
        {capacity !== null && capacity !== undefined && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Remaining capacity: {remainingCapacity === null ? 'n/a' : remainingCapacity}
          </Typography>
        )}
      </Stack>
      {rsvpError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {rsvpError}
        </Alert>
      )}
      {rsvps.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No RSVPs yet.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>Name</strong>
                </TableCell>
                <TableCell>
                  <strong>Email</strong>
                </TableCell>
                <TableCell>
                  <strong>Guests</strong>
                </TableCell>
                <TableCell>
                  <strong>Status</strong>
                </TableCell>
                <TableCell>
                  <strong>Source</strong>
                </TableCell>
                {canEdit && (
                  <TableCell align="right">
                    <strong>Actions</strong>
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {rsvps.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>{r.guests ?? 1}</TableCell>
                  <TableCell>
                    <Chip
                      label={r.status}
                      size="small"
                      color={
                        r.status === 'Going'
                          ? 'success'
                          : r.status === 'Maybe'
                            ? 'warning'
                            : 'default'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={r.source} size="small" variant="outlined" />
                  </TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button
                          size="small"
                          startIcon={<EditRounded />}
                          onClick={() => openEditRsvp(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteRounded />}
                          onClick={() => deleteRsvp(r.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* RSVP Dialog */}
      <Dialog open={rsvpDialog} onClose={() => setRsvpDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editRsvpId ? 'Edit RSVP' : 'New RSVP'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="rsvp-form" onSubmit={saveRsvp} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {rsvpError && <Alert severity="error">{rsvpError}</Alert>}
              <TextField
                label="Name"
                value={rsvpForm.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRsvpForm((p) => ({ ...p, name: e.target.value }))
                }
                required
                fullWidth
              />
              <TextField
                label="Email"
                type="email"
                value={rsvpForm.email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRsvpForm((p) => ({ ...p, email: e.target.value }))
                }
                required
                fullWidth
              />
              <TextField
                label="Guest Count"
                type="number"
                value={rsvpForm.guests}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRsvpForm((p) => ({ ...p, guests: e.target.value }))
                }
                inputProps={{ min: 1 }}
                fullWidth
              />
              <TextField
                label="Status"
                select
                value={rsvpForm.status}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRsvpForm((p) => ({ ...p, status: e.target.value }))
                }
                fullWidth
              >
                {RSVP_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Notes"
                value={rsvpForm.notes}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setRsvpForm((p) => ({ ...p, notes: e.target.value }))
                }
                multiline
                rows={2}
                fullWidth
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRsvpDialog(false)}>Cancel</Button>
          <Button
            type="submit"
            form="rsvp-form"
            variant="contained"
            disabled={rsvpSaving}
            startIcon={rsvpSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {rsvpSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
