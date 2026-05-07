import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

interface CreatedEventResponse {
  id?: number;
  event?: { id: number };
}

const EVENT_TYPES = ['Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other'];
// Must match DB check constraint: Draft | Active | Completed
const STATUS_OPTIONS = ['Draft', 'Active', 'Completed'];

export default function EventFormPage(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'Other',
    status: 'Draft',
    date: '',
    location: '',
    capacity: '',
    is_public: true,
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleField<K extends keyof typeof form>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Event name is required.');
    if (!form.date) return setError('Event date is required.');
    if (!form.location.trim()) return setError('Location is required.');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_type: form.event_type,
        status: form.status,
        date: form.date,
        location: form.location.trim(),
        capacity: form.capacity ? Number(form.capacity) : null,
        is_public: form.is_public,
        tags: form.tags.trim() || null,
      };
      const res = await api.post<CreatedEventResponse>('/api/events', payload);
      const newId = res.id ?? res.event?.id;
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
        <Typography variant="h5" fontWeight={700}>
          Create Event
        </Typography>
        <Button onClick={() => navigate('/events')}>Back to events</Button>
      </Box>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit} id="create-event-form">
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Event name"
              value={form.title}
              onChange={handleField('title')}
              required
              fullWidth
            />

            <TextField
              label="Description"
              value={form.description}
              onChange={handleField('description')}
              multiline
              rows={3}
              fullWidth
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Event type"
                select
                value={form.event_type}
                onChange={handleField('event_type')}
                fullWidth
              >
                {EVENT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>

              <TextField
                label="Status"
                select
                value={form.status}
                onChange={handleField('status')}
                fullWidth
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Event date"
                type="date"
                value={form.date}
                onChange={handleField('date')}
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
              />
              <TextField
                label="Capacity (guests)"
                type="number"
                value={form.capacity}
                onChange={handleField('capacity')}
                fullWidth
                inputProps={{ min: 1 }}
              />
            </Stack>

            <TextField
              label="Location / Venue"
              value={form.location}
              onChange={handleField('location')}
              fullWidth
              required
              placeholder="e.g. City Park Amphitheater, Downtown"
            />

            <TextField
              label="Tags (comma separated)"
              value={form.tags}
              onChange={handleField('tags')}
              fullWidth
              placeholder="e.g. music, outdoor, festival"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.is_public}
                  onChange={(e) => setForm((p) => ({ ...p, is_public: e.target.checked }))}
                />
              }
              label="Public event (visible on public RSVP page)"
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => navigate('/events')}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={saving}>
                {saving ? 'Saving\u2026' : 'Create Event'}
              </Button>
            </Box>
          </Stack>
        </form>
      </Paper>
    </Box>
  );
}
