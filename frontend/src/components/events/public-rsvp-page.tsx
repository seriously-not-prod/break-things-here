import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];

interface PublicRsvpEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  event_date?: string;
  capacity: number | null;
}

interface PublicRsvpContext {
  event: PublicRsvpEvent;
  remainingCapacity: number | null;
}

function normalizePublicEvent(event: PublicRsvpEvent): PublicRsvpEvent {
  const eventDate = event.date ?? event.event_date ?? '';
  return {
    ...event,
    date: eventDate,
    event_date: eventDate,
  };
}

export default function PublicRsvpPage(): JSX.Element {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<PublicRsvpEvent | null>(null);
  const [remainingCapacity, setRemainingCapacity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', guests: '1', status: 'Pending', notes: '' });

  useEffect(() => {
    async function load(): Promise<void> {
      if (!eventId) {
        setError('Missing event identifier.');
        setLoading(false);
        return;
      }

      try {
        const data = await api.get<PublicRsvpContext>(`/api/public/events/${eventId}`);
        setEvent(normalizePublicEvent(data.event));
        setRemainingCapacity(data.remainingCapacity);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load RSVP details.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [eventId]);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!eventId) {
        throw new Error('Missing event identifier.');
      }

      await api.post(`/api/events/${eventId}/rsvps`, {
        ...form,
        guests: Number(form.guests || 1),
      });
      setSuccess('Your RSVP has been recorded.');
      setForm({ name: '', email: '', guests: '1', status: 'Pending', notes: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit RSVP.');
    } finally {
      setSaving(false);
    }
  }

  function handleField(field: 'name' | 'email' | 'guests' | 'status' | 'notes') {
    return (e: ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!event) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2 }}>
        <Paper sx={{ p: 4, width: '100%', maxWidth: 560 }}>
          <Alert severity="error">{error ?? 'Event not found.'}</Alert>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        px: 2,
        py: 6,
        background: 'radial-gradient(circle at top, #eef7ff 0%, #f7f8fc 55%, #eef3f7 100%)',
      }}
    >
      <Paper sx={{ width: '100%', maxWidth: 720, mx: 'auto', p: { xs: 3, sm: 4 } }} elevation={8}>
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary">Public RSVP</Typography>
          <Typography variant="h4" fontWeight={800}>{event.title}</Typography>
          <Typography color="text.secondary">
            {new Date(event.date).toLocaleDateString()}
            {event.location ? ` · ${event.location}` : ''}
          </Typography>
          {event.capacity !== null && (
            <Typography color="text.secondary">
              Capacity: {event.capacity}{remainingCapacity !== null ? ` · Remaining: ${remainingCapacity}` : ''}
            </Typography>
          )}
          {event.description && <Typography>{event.description}</Typography>}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Box component="form" onSubmit={submit} noValidate>
          <Stack spacing={2}>
            <TextField label="Name" value={form.name} onChange={handleField('name')} required fullWidth />
            <TextField label="Email" type="email" value={form.email} onChange={handleField('email')} required fullWidth />
            <TextField label="Guests" type="number" value={form.guests} onChange={handleField('guests')} inputProps={{ min: 1 }} fullWidth />
            <TextField label="Status" select value={form.status} onChange={handleField('status')} helperText="Use Pending, Going, Maybe, Not Going, or Declined" fullWidth>
              {RSVP_STATUSES.map((status) => (
                <MenuItem key={status} value={status}>{status}</MenuItem>
              ))}
            </TextField>
            <TextField label="Notes" value={form.notes} onChange={handleField('notes')} multiline rows={3} fullWidth />
            <Button type="submit" variant="contained" size="large" disabled={saving}>
              {saving ? 'Submitting…' : 'Submit RSVP'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
