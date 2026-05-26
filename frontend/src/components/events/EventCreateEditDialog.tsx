import { ChangeEvent, FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { api, ApiError } from '../../lib/api-client';

const STATUS_OPTIONS = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];

interface EventForm {
  title: string;
  description: string;
  location: string;
  date: string;
  event_time: string;
  capacity: string;
  status: string;
  latitude: string;
  longitude: string;
  waitlist_enabled: boolean;
  tags: string;
  event_type: string;
}

const EMPTY_FORM: EventForm = {
  title: '',
  description: '',
  location: '',
  date: '',
  event_time: '',
  capacity: '',
  status: 'Draft',
  latitude: '',
  longitude: '',
  waitlist_enabled: false,
  tags: '',
  event_type: '',
};

interface EventCreateEditDialogProps {
  open: boolean;
  editingId: number | null;
  initialForm?: Partial<EventForm>;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function EventCreateEditDialog({
  open,
  editingId,
  initialForm,
  onClose,
  onSaved,
  onError,
}: EventCreateEditDialogProps): JSX.Element {
  const [form, setForm] = useState<EventForm>({ ...EMPTY_FORM, ...initialForm });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset form when dialog opens with new data
  const formKey = editingId ?? 'new';
  const [lastKey, setLastKey] = useState<string | number | null>(null);
  if (open && formKey !== lastKey) {
    setLastKey(formKey);
    setForm({ ...EMPTY_FORM, ...initialForm });
    setSaveError(null);
  }

  function handleField(fieldKey: keyof EventForm): (_e: ChangeEvent<HTMLInputElement>) => void {
    return (e) => {
      const value = fieldKey === 'waitlist_enabled' ? e.target.checked : e.target.value;
      setForm((prev) => ({ ...prev, [fieldKey]: value }));
    };
  }

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaveError(null);
    if (!form.title.trim()) {
      setSaveError('Title is required.');
      return;
    }
    if (!form.date) {
      setSaveError('Event Date is required.');
      return;
    }
    if (!form.event_time) {
      setSaveError('Event time is required (HH:MM).');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.event_time)) {
      setSaveError('Event time must be in HH:MM format (e.g. 09:00, 14:30).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        event_date: form.date,
        event_time: form.event_time,
        capacity: form.capacity ? Number(form.capacity) : null,
        status: form.status,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        waitlist_enabled: form.waitlist_enabled,
        tags: form.tags || null,
        event_type: form.event_type || null,
      };
      if (editingId) {
        await api.put(`/api/events/${editingId}`, payload);
      } else {
        await api.post('/api/events', payload);
      }
      onClose();
      onSaved();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editingId ? 'Edit Event' : 'New Event'}</DialogTitle>
      <DialogContent>
        <Box component="form" id="event-form" onSubmit={handleSave} noValidate>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label="Title"
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
            <TextField
              label="Location"
              value={form.location}
              onChange={handleField('location')}
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
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
            <TextField
              label="Event type"
              value={form.event_type}
              onChange={handleField('event_type')}
              fullWidth
            />
            <TextField
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={handleField('tags')}
              fullWidth
            />
            <TextField
              label="Capacity"
              type="number"
              value={form.capacity}
              onChange={handleField('capacity')}
              fullWidth
              inputProps={{ min: 1 }}
            />
            <Stack direction="row" alignItems="center" spacing={1}>
              <input
                id="event-form-waitlist"
                type="checkbox"
                checked={form.waitlist_enabled}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, waitlist_enabled: e.target.checked }))
                }
              />
              <label htmlFor="event-form-waitlist">Enable waitlist</label>
            </Stack>
            <TextField
              label="Event Date"
              type="date"
              value={form.date}
              onChange={handleField('date')}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Event time"
              type="time"
              value={form.event_time}
              onChange={handleField('event_time')}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              helperText="Start time (required)"
            />
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
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
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
  );
}
