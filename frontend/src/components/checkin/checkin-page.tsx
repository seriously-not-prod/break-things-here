/**
 * Check-In Page — issue #387 (story #379), QR link #445 (story #413)
 *
 * Route: /events/:id/checkin
 *
 * Loads RSVPs for an event and lets staff mark guests as arrived.
 * Optimistic update: row flips to checked-in immediately; reverts on API error.
 * Always shows a QR Scanner button that links to the scanner page (#445);
 * the scanner page itself uses BarcodeDetector for camera scanning and falls
 * back to manual token entry on unsupported browsers.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Button,
  Chip,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutlineRounded,
  QrCodeScannerRounded,
  SearchRounded,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import * as guestService from '../../services/guest-service';
import type { Rsvp } from '../../services/guest-service';
import { ApiError } from '../../lib/api-client';

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  confirmed: 'success',
  pending: 'warning',
  maybe: 'primary',
  declined: 'error',
  cancelled: 'error',
  no_show: 'error',
  waitlist: 'default',
  checked_in: 'success',
};

const RSVP_FILTER_OPTIONS = [
  'All',
  'confirmed',
  'pending',
  'maybe',
  'declined',
  'waitlist',
  'cancelled',
  'checked_in',
  'no_show',
];

/** Returns true when the browser natively supports BarcodeDetector. */
function hasBarcodeDetector(): boolean {
  return typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function';
}

export function CheckInPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [checkingIn, setCheckingIn] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await guestService.listRsvps(eventId);
      setRsvps(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load guests.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCheckIn = async (rsvp: Rsvp) => {
    if (!eventId || rsvp.checked_in) return;

    // Optimistic update
    setRsvps((prev) =>
      prev.map((r) =>
        r.id === rsvp.id ? { ...r, checked_in: true, checked_in_at: new Date().toISOString() } : r,
      ),
    );
    setCheckingIn((prev) => new Set(prev).add(rsvp.id));

    try {
      const updated = await guestService.checkInGuest(eventId, rsvp.id);
      setRsvps((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      // Revert optimistic update
      setRsvps((prev) =>
        prev.map((r) => (r.id === rsvp.id ? { ...r, checked_in: false, checked_in_at: null } : r)),
      );
      setError(err instanceof ApiError ? err.message : 'Check-in failed. Please try again.');
    } finally {
      setCheckingIn((prev) => {
        const next = new Set(prev);
        next.delete(rsvp.id);
        return next;
      });
    }
  };

  const filtered = rsvps.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch = r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || r.canonical_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const checkedInCount = rsvps.filter((r) => r.checked_in).length;
  const total = rsvps.length;
  const progressPct = total > 0 ? (checkedInCount / total) * 100 : 0;

  return (
    <PageLayout
      title="Guest Check-In"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Check-In' }]}
      actions={
        <Tooltip
          title={
            hasBarcodeDetector()
              ? 'Open live QR scanner'
              : 'QR scanning requires a Chromium-based browser. Use manual token paste on this device.'
          }
        >
          <span>
            <Button
              variant="outlined"
              startIcon={<QrCodeScannerRounded />}
              onClick={() => navigate(`/events/${eventId ?? ''}/checkin/scan`)}
              aria-label="Open QR scanner check-in"
            >
              QR Scanner
            </Button>
          </span>
        </Tooltip>
      }
    >
      {/* Progress bar */}
      <Paper sx={{ p: 2, mb: 3 }} variant="outlined">
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Checked in
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {checkedInCount} / {total}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={progressPct}
          aria-label={`${checkedInCount} of ${total} guests checked in`}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
          }}
          inputProps={{ 'aria-label': 'Search guests' }}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          size="small"
          label="RSVP status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
          inputProps={{ 'aria-label': 'Filter by RSVP status' }}
        >
          {RSVP_FILTER_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Guest check-in table">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>RSVP</TableCell>
              <TableCell>Guests</TableCell>
              <TableCell>Check-In Status</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  {rsvps.length === 0
                    ? 'No RSVPs for this event yet.'
                    : 'No guests match your search.'}
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              filtered.map((rsvp) => (
                <TableRow
                  key={rsvp.id}
                  sx={{
                    backgroundColor: rsvp.checked_in ? 'success.light' : undefined,
                    opacity: rsvp.checked_in ? 0.85 : 1,
                  }}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{rsvp.name}</TableCell>
                  <TableCell>{rsvp.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={rsvp.canonical_status}
                      color={STATUS_COLORS[rsvp.canonical_status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{rsvp.guests}</TableCell>
                  <TableCell>
                    {rsvp.checked_in ? (
                      <Chip
                        icon={<CheckCircleOutlineRounded />}
                        label="Checked In"
                        color="success"
                        size="small"
                        aria-label={`${rsvp.name} is checked in`}
                      />
                    ) : (
                      <Chip label="Not Yet" variant="outlined" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant={rsvp.checked_in ? 'outlined' : 'contained'}
                      color="success"
                      disabled={rsvp.checked_in || checkingIn.has(rsvp.id)}
                      onClick={() => void handleCheckIn(rsvp)}
                      aria-label={
                        rsvp.checked_in
                          ? `${rsvp.name} already checked in`
                          : `Check in ${rsvp.name}`
                      }
                    >
                      {rsvp.checked_in ? 'Done' : checkingIn.has(rsvp.id) ? 'Saving…' : 'Check In'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </PageLayout>
  );
}
