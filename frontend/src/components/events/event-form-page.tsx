import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import MyLocationRounded from '@mui/icons-material/MyLocationRounded';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import EventLocationMap from './event-location-map';
import { PageLayout } from '../layout/page-layout';
import { geocodeAddress } from '../../services/events-service';

interface CreatedEventResponse {
  id?: number;
  event?: { id: number };
}

const EVENT_TYPES = ['Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other'];
// BRD v2 (#575) — full event lifecycle status set.
const STATUS_OPTIONS = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];

export default function EventFormPage(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_type: 'Other',
    status: 'Draft',
    date: '',
    event_time: '',
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
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<string | null>(null);

  function handleField<K extends keyof typeof form>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };
  }

  /** #806 — Resolve coordinates for the typed address via the configured provider. */
  async function handleGeocode(): Promise<void> {
    const address = form.location.trim();
    if (!address) {
      setGeocodeStatus('Enter a location first.');
      return;
    }
    setGeocoding(true);
    setGeocodeStatus(null);
    try {
      const result = await geocodeAddress(address);
      setForm((prev) => ({
        ...prev,
        latitude: String(result.latitude),
        longitude: String(result.longitude),
      }));
      setGeocodeStatus(`Matched via ${result.provider}: ${result.display_name}`);
    } catch (err) {
      // Fallback: leave coords blank so the placeholder map renders.
      setGeocodeStatus(
        err instanceof ApiError && err.status === 422
          ? 'No match for that address. You can still save the event; the map will show a placeholder.'
          : 'Geocoding failed. You can still save the event; the map will show a placeholder.',
      );
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError('Event name is required.');
    if (!form.date) return setError('Event date is required.');
    if (!form.event_time) return setError('Event time is required.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.event_time))
      return setError('Event time must be in HH:MM format (e.g. 09:00, 14:30).');
    if (!form.location.trim()) return setError('Location is required.');
    // BRD v2 (#574) — events must start today or in the future, unless created
    // as a historical record (Completed/Cancelled).
    const isHistorical = form.status === 'Completed' || form.status === 'Cancelled';
    if (!isHistorical) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.date < today) {
        return setError('Event date must be today or in the future.');
      }
    }
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
        event_date: form.date,
        event_time: form.event_time,
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
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
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
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
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
                label="Event time"
                type="time"
                value={form.event_time}
                onChange={handleField('event_time')}
                InputLabelProps={{ shrink: true }}
                fullWidth
                required
                inputProps={{ step: 300 }}
                helperText="Start time (required)"
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
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
              <Button
                variant="outlined"
                onClick={() => void handleGeocode()}
                disabled={geocoding || !form.location.trim()}
                startIcon={
                  geocoding ? <CircularProgress size={14} color="inherit" /> : <MyLocationRounded />
                }
                sx={{ mt: { xs: 0, sm: 1 }, minWidth: 160 }}
                data-testid="event-geocode-button"
              >
                {geocoding ? 'Locating…' : 'Geocode address'}
              </Button>
            </Stack>
            {geocodeStatus && (
              <Alert
                severity={geocodeStatus.startsWith('Matched') ? 'success' : 'info'}
                sx={{ py: 0.5 }}
              >
                {geocodeStatus}
              </Alert>
            )}

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
