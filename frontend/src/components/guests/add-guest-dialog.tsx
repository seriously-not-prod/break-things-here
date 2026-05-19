import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from '@mui/material';
import type {
  DietaryRestriction,
  GuestEmailLookupResult,
  GuestGroup,
  RsvpGuestInput,
  RsvpStatus,
} from '../../services/guest-service';
import { lookupRsvpsByEmail } from '../../services/guest-service';

interface AddGuestDialogProps {
  eventId: number | string;
  open: boolean;
  onClose: () => void;
  onSubmit: (input: RsvpGuestInput) => Promise<void>;
  onReviewDuplicates?: () => void;
}

const DIETARY_OPTIONS: DietaryRestriction[] = [
  'None',
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Halal',
  'Kosher',
  'Nut-Free',
  'Other',
];

const GROUP_OPTIONS: GuestGroup[] = ['Family', 'Friends', 'Colleagues', 'VIPs', 'Custom'];

const STATUS_OPTIONS: RsvpStatus[] = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];

function hasLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes('@') && trimmed.includes('.');
}

export function AddGuestDialog({
  eventId,
  open,
  onClose,
  onSubmit,
  onReviewDuplicates,
}: AddGuestDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dietary, setDietary] = useState<DietaryRestriction>('None');
  const [accessibilityNeeds, setAccessibilityNeeds] = useState('');
  const [plusOne, setPlusOne] = useState(false);
  const [plusOneName, setPlusOneName] = useState('');
  const [guestGroup, setGuestGroup] = useState<GuestGroup | ''>('');
  const [status, setStatus] = useState<RsvpStatus>('Pending');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<GuestEmailLookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const latestLookupRequest = useRef(0);

  useEffect(() => {
    if (!open) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!hasLikelyEmail(normalizedEmail)) {
      setLookupLoading(false);
      setLookupResult(null);
      setLookupError(null);
      return;
    }

    const requestId = latestLookupRequest.current + 1;
    latestLookupRequest.current = requestId;

    const timer = window.setTimeout(() => {
      setLookupLoading(true);
      setLookupError(null);
      void lookupRsvpsByEmail(eventId, normalizedEmail)
        .then((result) => {
          if (latestLookupRequest.current !== requestId) return;
          setLookupResult(result);
        })
        .catch((err) => {
          if (latestLookupRequest.current !== requestId) return;
          setLookupError(err instanceof Error ? err.message : 'Unable to check for duplicates right now.');
          setLookupResult(null);
        })
        .finally(() => {
          if (latestLookupRequest.current !== requestId) return;
          setLookupLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [email, eventId, open]);

  function reset(): void {
    setName('');
    setEmail('');
    setPhone('');
    setDietary('None');
    setAccessibilityNeeds('');
    setPlusOne(false);
    setPlusOneName('');
    setGuestGroup('');
    setStatus('Pending');
    setNotes('');
    setError(null);
    setLookupLoading(false);
    setLookupResult(null);
    setLookupError(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const input: RsvpGuestInput = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        ...(phone.trim() && { phone: phone.trim() }),
        status,
        dietary_restriction: dietary,
        ...(accessibilityNeeds.trim() && { accessibility_needs: accessibilityNeeds.trim() }),
        plus_one: plusOne,
        ...(plusOne && plusOneName.trim() && { plus_one_name: plusOneName.trim() }),
        ...(guestGroup && { guest_group: guestGroup }),
        ...(notes.trim() && { notes: notes.trim() }),
      };
      await onSubmit(input);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add guest.');
    } finally {
      setSubmitting(false);
    }
  }

  const duplicateMatches = lookupResult?.matches ?? [];
  const hasDuplicateEmail = duplicateMatches.length > 0;
  const mergeSuggestion = lookupResult?.mergeSuggestion ?? null;
  const suggestedPrimary =
    mergeSuggestion === null
      ? null
      : duplicateMatches.find((match) => match.id === mergeSuggestion.recommendedPrimaryId) ?? null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <DialogTitle>Add Guest</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {error && (
              <Typography color="error" variant="body2" role="alert">
                {error}
              </Typography>
            )}

            {hasDuplicateEmail && (
              <Alert
                severity="warning"
                action={
                  onReviewDuplicates ? (
                    <Button
                      color="inherit"
                      size="small"
                      onClick={() => {
                        onReviewDuplicates();
                        handleClose();
                      }}
                    >
                      Review Duplicates
                    </Button>
                  ) : undefined
                }
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Duplicate email detected for {duplicateMatches.length} guest{duplicateMatches.length === 1 ? '' : 's'}.
                </Typography>
                {mergeSuggestion && suggestedPrimary ? (
                  <Typography variant="body2">
                    Merge suggestion: keep {suggestedPrimary.name} as primary and merge {mergeSuggestion.sourceRsvpIds.length} duplicate record{mergeSuggestion.sourceRsvpIds.length === 1 ? '' : 's'}.
                  </Typography>
                ) : (
                  <Typography variant="body2">
                    Consider updating the existing record instead of adding a duplicate guest.
                  </Typography>
                )}
              </Alert>
            )}

            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              inputProps={{ 'aria-label': 'Guest name' }}
            />

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              helperText={lookupError ?? undefined}
              error={Boolean(lookupError)}
              InputProps={{
                endAdornment: lookupLoading ? <CircularProgress size={16} /> : undefined,
              }}
              inputProps={{ 'aria-label': 'Guest email' }}
            />

            <TextField
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputProps={{ 'aria-label': 'Guest phone' }}
            />

            <FormControl fullWidth>
              <InputLabel id="dietary-label">Dietary Restriction</InputLabel>
              <Select
                labelId="dietary-label"
                value={dietary}
                label="Dietary Restriction"
                onChange={(e: SelectChangeEvent<DietaryRestriction>) =>
                  setDietary(e.target.value as DietaryRestriction)
                }
              >
                {DIETARY_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Accessibility Needs"
              value={accessibilityNeeds}
              onChange={(e) => setAccessibilityNeeds(e.target.value)}
              multiline
              rows={2}
              inputProps={{ 'aria-label': 'Accessibility needs' }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={plusOne}
                  onChange={(e) => setPlusOne(e.target.checked)}
                  inputProps={{ 'aria-label': 'Plus one' }}
                />
              }
              label="Plus One"
            />

            {plusOne && (
              <TextField
                label="Plus One Name"
                value={plusOneName}
                onChange={(e) => setPlusOneName(e.target.value)}
                inputProps={{ 'aria-label': 'Plus one name' }}
              />
            )}

            <FormControl fullWidth>
              <InputLabel id="group-label">Guest Group</InputLabel>
              <Select
                labelId="group-label"
                value={guestGroup}
                label="Guest Group"
                onChange={(e: SelectChangeEvent<GuestGroup | ''>) =>
                  setGuestGroup(e.target.value as GuestGroup | '')
                }
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {GROUP_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="status-label">RSVP Status</InputLabel>
              <Select
                labelId="status-label"
                value={status}
                label="RSVP Status"
                onChange={(e: SelectChangeEvent<RsvpStatus>) =>
                  setStatus(e.target.value as RsvpStatus)
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              inputProps={{ 'aria-label': 'Notes' }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Guest'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
