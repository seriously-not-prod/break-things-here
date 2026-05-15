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
import EventLocationMap from './event-location-map';
import { PageLayout } from '../layout/page-layout';

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
    latitude: '',
    longitude: '',
    waitlist_enabled: false,
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
      const lat = form.latitude === '' ? null : Number(form.latitude);
      const lng = form.longitude === '' ? null : Number(form.longitude);
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
        setError('Latitude must be between -90 and 90.');
        setSaving(false);
        return;
      }
      if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
        setError('Longitude must be between -180 and 180.');
        setSaving(false);
        return;
      }
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
        latitude: lat,
        longitude: lng,
        waitlist_enabled: form.waitlist_enabled,
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
    <PageLayout
      title="Create Event"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Create Event' }]}
      actions={<Button onClick={() => navigate('/events')}>Back to Events</Button>}
    >
      <Paper elevation={1} sx={{ p: 3, maxWidth: 720 }}>
        <form onSubmit={handleSubmit} id="create-event-form">
          <Stack spacing={2.5}>
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Latitude"
                type="number"
                value={form.latitude}
                onChange={handleField('latitude')}
                inputProps={{ step: '0.000001', min: -90, max: 90 }}
                fullWidth
                helperText="-90 to 90"
              />
              <TextField
                label="Longitude"
                type="number"
                value={form.longitude}
                onChange={handleField('longitude')}
                inputProps={{ step: '0.000001', min: -180, max: 180 }}
                fullWidth
                helperText="-180 to 180"
              />
            </Stack>

            <EventLocationMap
              latitude={form.latitude === '' ? null : Number(form.latitude)}
              longitude={form.longitude === '' ? null : Number(form.longitude)}
              locationLabel={form.location || null}
              height={200}
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

            <FormControlLabel
              control={
                <Switch
                  checked={form.waitlist_enabled}
                  onChange={(e) => setForm((p) => ({ ...p, waitlist_enabled: e.target.checked }))}
                />
              }
              label="Enable waitlist when capacity is reached"
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
    </PageLayout>
  );
}
