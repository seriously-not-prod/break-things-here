import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Paper,
  Stack,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

const EVENT_TYPES = ['Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other'];
const STATUS_OPTIONS = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];

export default function EventFormPage(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'Other',
    status: 'Draft',
    start_date: '',
    end_date: '',
    venue_name: '',
    address: '',
    location: '',
    capacity: '',
    is_public: true,
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleField<K extends keyof typeof form>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Event name is required.');
    if (!form.start_date) return setError('Start date is required.');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        status: form.status,
        start_date: form.start_date,
        end_date: form.end_date || null,
        venue_name: form.venue_name || null,
        address: form.address || null,
        location: form.location || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        is_public: form.is_public,
        tags: form.tags || null,
      };
      const res = await api.post('/api/events', payload);
      // on success redirect to detail
      const id = (res as any)?.id || (res as any)?.event?.id || (res as any)?.event?.id;
      // if the API returns the created event in different shape, try common locations
      const newId = id ?? (res as any)?.event?.id ?? (res as any)?.id ?? (res as any)?.event?.id;
      if (newId) navigate(`/events/${newId}`);
      else navigate('/events');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Create Event</Typography>
        <Button onClick={() => navigate('/events')}>Back to events</Button>
      </Box>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit} id="create-event-form">
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Event name" value={form.title} onChange={handleField('title')} required fullWidth />
            <TextField label="Description" value={form.description} onChange={handleField('description')} multiline rows={4} fullWidth />
            <TextField label="Event type" select value={form.event_type} onChange={handleField('event_type')} fullWidth>
              {EVENT_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField label="Status" select value={form.status} onChange={handleField('status')} fullWidth>
              {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Start date" type="datetime-local" value={form.start_date} onChange={handleField('start_date')} InputLabelProps={{ shrink: true }} fullWidth required />
              <TextField label="End date" type="datetime-local" value={form.end_date} onChange={handleField('end_date')} InputLabelProps={{ shrink: true }} fullWidth />
            </Stack>
            <TextField label="Venue name" value={form.venue_name} onChange={handleField('venue_name')} fullWidth />
            <TextField label="Address" value={form.address} onChange={handleField('address')} fullWidth />
            <TextField label="Location" value={form.location} onChange={handleField('location')} fullWidth />
            <TextField label="Capacity" type="number" value={form.capacity} onChange={handleField('capacity')} fullWidth />
            <TextField label="Tags (comma separated)" value={form.tags} onChange={handleField('tags')} fullWidth />
            <FormControlLabel control={<Switch checked={form.is_public} onChange={(e) => setForm((p) => ({ ...p, is_public: e.target.checked }))} />} label="Public event" />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => navigate('/events')}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={saving}>
                {saving ? 'Saving…' : 'Create Event'}
              </Button>
            </Box>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
