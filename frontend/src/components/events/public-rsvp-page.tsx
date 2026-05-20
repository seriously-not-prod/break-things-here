import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];
const DIETARY = [
  'None',
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Halal',
  'Kosher',
  'Nut-Free',
  'Other',
];
const AGE_GROUPS = ['', 'Child (0-12)', 'Teen (13-17)', 'Adult (18-64)', 'Senior (65+)'];

interface PublicRsvpEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  event_date?: string;
  capacity: number | null;
}

interface MealOption {
  id: number;
  name: string;
  description: string | null;
}

interface PublicRsvpContext {
  event: PublicRsvpEvent;
  remainingCapacity: number | null;
  mealOptions?: MealOption[];
  rsvpDeadline?: string | null;
  deadlinePassed?: boolean;
  waitlistEnabled?: boolean;
}

interface RsvpFormState {
  name: string;
  email: string;
  phone: string;
  guests: string;
  status: string;
  notes: string;
  dietary_restriction: string;
  meal_choice: string;
  company: string;
  title: string;
  relation_type: string;
  age_group: string;
  address_line1: string;
  city: string;
  postal_code: string;
  country: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  accept_waitlist: boolean;
}

const INITIAL_FORM: RsvpFormState = {
  name: '',
  email: '',
  phone: '',
  guests: '1',
  status: 'Going',
  notes: '',
  dietary_restriction: 'None',
  meal_choice: '',
  company: '',
  title: '',
  relation_type: '',
  age_group: '',
  address_line1: '',
  city: '',
  postal_code: '',
  country: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  accept_waitlist: false,
};

function normalizePublicEvent(event: PublicRsvpEvent): PublicRsvpEvent {
  const eventDate = event.date ?? event.event_date ?? '';
  return { ...event, date: eventDate, event_date: eventDate };
}

export default function PublicRsvpPage(): JSX.Element {
  const { eventId } = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<PublicRsvpEvent | null>(null);
  const [remainingCapacity, setRemainingCapacity] = useState<number | null>(null);
  const [mealOptions, setMealOptions] = useState<MealOption[]>([]);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [rsvpDeadline, setRsvpDeadline] = useState<string | null>(null);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<RsvpFormState>(INITIAL_FORM);

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
        setMealOptions(data.mealOptions ?? []);
        setDeadlinePassed(Boolean(data.deadlinePassed));
        setRsvpDeadline(data.rsvpDeadline ?? null);
        setWaitlistEnabled(Boolean(data.waitlistEnabled));
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
      if (!eventId) throw new Error('Missing event identifier.');
      const payload: Record<string, unknown> = {
        ...form,
        guests: Number(form.guests || 1),
        waitlist: form.accept_waitlist,
      };
      // Drop empty optional strings so the backend stores NULL rather than ''
      for (const k of Object.keys(payload)) {
        if (payload[k] === '') delete payload[k];
      }
      await api.post(`/api/events/${eventId}/rsvps`, payload);
      setSuccess('Your RSVP has been recorded. We will email you a confirmation shortly.');
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit RSVP.');
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof RsvpFormState>(field: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value as RsvpFormState[K] }));
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

  const capacityFull = remainingCapacity !== null && remainingCapacity <= 0;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        px: 2,
        py: 6,
        background: 'radial-gradient(circle at top, #eef7ff 0%, #f7f8fc 55%, #eef3f7 100%)',
      }}
    >
      <Paper sx={{ width: '100%', maxWidth: 840, mx: 'auto', p: { xs: 3, sm: 4 } }} elevation={8}>
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary">
            Public RSVP
          </Typography>
          <Typography variant="h4" fontWeight={800}>
            {event.title}
          </Typography>
          <Typography color="text.secondary">
            {new Date(event.date).toLocaleDateString()}
            {event.location ? ` · ${event.location}` : ''}
          </Typography>
          {event.capacity !== null && (
            <Typography color="text.secondary">
              Capacity: {event.capacity}
              {remainingCapacity !== null ? ` · Remaining: ${remainingCapacity}` : ''}
            </Typography>
          )}
          {rsvpDeadline && (
            <Typography color={deadlinePassed ? 'error' : 'text.secondary'}>
              RSVP deadline: {new Date(rsvpDeadline).toLocaleString()}
              {deadlinePassed ? ' — passed' : ''}
            </Typography>
          )}
          {event.description && <Typography>{event.description}</Typography>}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        {deadlinePassed && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            The RSVP deadline has passed. Please contact the organizer if you still wish to attend.
          </Alert>
        )}
        {!deadlinePassed && capacityFull && waitlistEnabled && (
          <Alert severity="info" sx={{ mb: 2 }}>
            The event is full. Toggle &quot;Join waitlist&quot; below to be queued for promotion.
          </Alert>
        )}

        <Box component="form" onSubmit={submit} noValidate aria-disabled={deadlinePassed}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={700}>
              Your details
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Name"
                  value={form.name}
                  onChange={update('name')}
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  required
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Phone" value={form.phone} onChange={update('phone')} fullWidth />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Guests"
                  type="number"
                  value={form.guests}
                  onChange={update('guests')}
                  inputProps={{ min: 1 }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Status"
                  select
                  value={form.status}
                  onChange={update('status')}
                  fullWidth
                >
                  {RSVP_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" fontWeight={700}>
              Profile
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Company"
                  value={form.company}
                  onChange={update('company')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Title" value={form.title} onChange={update('title')} fullWidth />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Relation"
                  value={form.relation_type}
                  onChange={update('relation_type')}
                  placeholder="Friend, family, colleague…"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Age group"
                  select
                  value={form.age_group}
                  onChange={update('age_group')}
                  fullWidth
                >
                  {AGE_GROUPS.map((a) => (
                    <MenuItem key={a} value={a}>
                      {a || 'Prefer not to say'}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Address"
                  value={form.address_line1}
                  onChange={update('address_line1')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField label="City" value={form.city} onChange={update('city')} fullWidth />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField
                  label="Postal code"
                  value={form.postal_code}
                  onChange={update('postal_code')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Country"
                  value={form.country}
                  onChange={update('country')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Emergency contact name"
                  value={form.emergency_contact_name}
                  onChange={update('emergency_contact_name')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Emergency contact phone"
                  value={form.emergency_contact_phone}
                  onChange={update('emergency_contact_phone')}
                  fullWidth
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" fontWeight={700}>
              Meal & dietary
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Dietary restriction"
                  select
                  value={form.dietary_restriction}
                  onChange={update('dietary_restriction')}
                  fullWidth
                >
                  {DIETARY.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              {mealOptions.length > 0 && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Meal choice"
                    select
                    value={form.meal_choice}
                    onChange={update('meal_choice')}
                    fullWidth
                  >
                    <MenuItem value="">No preference</MenuItem>
                    {mealOptions.map((m) => (
                      <MenuItem key={m.id} value={m.name}>
                        {m.name}
                        {m.description ? ` — ${m.description}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              )}
              <Grid item xs={12}>
                <TextField
                  label="Notes for the organizer"
                  value={form.notes}
                  onChange={update('notes')}
                  multiline
                  rows={2}
                  fullWidth
                />
              </Grid>
            </Grid>

            {capacityFull && waitlistEnabled && (
              <FormControlLabel
                control={
                  <Switch
                    checked={form.accept_waitlist}
                    onChange={(_, v) => setForm((p) => ({ ...p, accept_waitlist: v }))}
                  />
                }
                label="Join the waitlist if the event is full"
              />
            )}

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={saving || deadlinePassed}
            >
              {saving ? 'Submitting…' : 'Submit RSVP'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
