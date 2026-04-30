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
import { AddRounded, DeleteRounded, EditRounded, OpenInNewRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

interface PlannerEvent {
  id: number;
  title: string;
  location: string | null;
  event_date: string;
  capacity: number | null;
  status: string;
  creator_name: string | null;
}

const STATUS_OPTIONS = ['Draft', 'Active', 'Completed', 'Cancelled'];
const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error'> = {
  Draft: 'default',
  Active: 'primary',
  Completed: 'success',
  Cancelled: 'error',
};

interface EventForm {
  title: string;
  description: string;
  location: string;
  event_date: string;
  capacity: string;
  status: string;
}

const EMPTY_FORM: EventForm = { title: '', description: '', location: '', event_date: '', capacity: '', status: 'Draft' };

export default function EventsPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canCreate = user && user.roleId >= 2; // Organizer or Admin

  async function loadEvents(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.get<{ events: PlannerEvent[] }>('/api/events');
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  function openCreate(): void {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(event: PlannerEvent): void {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: '',
      location: event.location ?? '',
      event_date: event.event_date,
      capacity: event.capacity === null || event.capacity === undefined ? '' : String(event.capacity),
      status: event.status,
    });
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/api/events/${editingId}`, { ...form, capacity: form.capacity ? Number(form.capacity) : null });
      } else {
        await api.post('/api/events', { ...form, capacity: form.capacity ? Number(form.capacity) : null });
      }
      setDialogOpen(false);
      await loadEvents();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    try {
      await api.delete(`/api/events/${id}`);
      await loadEvents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  function handleField(field: keyof EventForm): (e: ChangeEvent<HTMLInputElement>) => void {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Events</Typography>
        {canCreate && (
          <Button variant="contained" startIcon={<AddRounded />} onClick={openCreate}>
            New Event
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : events.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No events yet. Create your first event!</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Title</strong></TableCell>
                <TableCell><strong>Date</strong></TableCell>
                <TableCell><strong>Location</strong></TableCell>
                <TableCell><strong>Capacity</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Created by</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id} hover>
                  <TableCell>{event.title}</TableCell>
                  <TableCell>{new Date(event.event_date).toLocaleDateString()}</TableCell>
                  <TableCell>{event.location ?? '—'}</TableCell>
                  <TableCell>{event.capacity ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={event.status}
                      color={STATUS_COLORS[event.status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{event.creator_name ?? '—'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button size="small" startIcon={<OpenInNewRounded />} onClick={() => navigate(`/events/${event.id}`)}>
                        Open
                      </Button>
                      {canCreate && (
                        <>
                          <Button size="small" startIcon={<EditRounded />} onClick={() => openEdit(event)}>
                            Edit
                          </Button>
                          <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => handleDelete(event.id)}>
                            Delete
                          </Button>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Edit Event' : 'New Event'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="event-form" onSubmit={handleSave} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {saveError && <Alert severity="error">{saveError}</Alert>}
              <TextField label="Title" value={form.title} onChange={handleField('title')} required fullWidth />
              <TextField label="Description" value={form.description} onChange={handleField('description')} multiline rows={3} fullWidth />
              <TextField label="Location" value={form.location} onChange={handleField('location')} fullWidth />
              <TextField
                label="Capacity"
                type="number"
                value={form.capacity}
                onChange={handleField('capacity')}
                fullWidth
                inputProps={{ min: 1 }}
              />
              <TextField
                label="Event Date"
                type="date"
                value={form.event_date}
                onChange={handleField('event_date')}
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Status"
                select
                value={form.status}
                onChange={handleField('status')}
                fullWidth
              >
                {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            type="submit"
            form="event-form"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
