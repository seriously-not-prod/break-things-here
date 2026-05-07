/**
 * Waitlist management panel (#413, #442).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteRounded, PlayArrowRounded, RefreshRounded } from '@mui/icons-material';
import {
  listWaitlist,
  promoteWaitlist,
  removeFromWaitlist,
  type WaitlistSummary,
} from '../../services/guest-service';

interface Props {
  eventId: string | number;
  onChanged?: () => void;
}

export function WaitlistPanel({ eventId, onChanged }: Props): JSX.Element {
  const [summary, setSummary] = useState<WaitlistSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback((): void => {
    setLoading(true);
    listWaitlist(eventId)
      .then(setSummary)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load waitlist.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePromote(): Promise<void> {
    setPromoting(true);
    setInfo(null);
    try {
      const result = await promoteWaitlist(eventId);
      setInfo(
        result.promoted.length === 0
          ? 'No spare capacity — nothing promoted.'
          : `Promoted ${result.promoted.length} guest(s) from the waitlist.`,
      );
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promotion failed.');
    } finally {
      setPromoting(false);
    }
  }

  async function handleRemove(rsvpId: number): Promise<void> {
    try {
      await removeFromWaitlist(eventId, rsvpId);
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove waitlist entry.');
    }
  }

  if (loading || !summary) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" gap={2} alignItems="center">
          <Typography variant="h6" fontWeight={600}>
            Waitlist
          </Typography>
          {summary.capacity !== null && (
            <Chip
              size="small"
              variant="outlined"
              label={`${summary.confirmedGuests} / ${summary.capacity} confirmed`}
            />
          )}
          {summary.remainingCapacity !== null && summary.remainingCapacity > 0 && (
            <Chip
              size="small"
              color="success"
              label={`${summary.remainingCapacity} seat${summary.remainingCapacity === 1 ? '' : 's'} open`}
            />
          )}
        </Stack>
        <Stack direction="row" gap={1}>
          <Button startIcon={<RefreshRounded />} variant="outlined" size="small" onClick={load}>
            Refresh
          </Button>
          <Button
            startIcon={<PlayArrowRounded />}
            variant="contained"
            size="small"
            disabled={promoting || summary.waitlist.length === 0}
            onClick={handlePromote}
          >
            {promoting ? 'Promoting…' : 'Promote eligible'}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {info}
        </Alert>
      )}

      {summary.waitlist.length === 0 ? (
        <Alert severity="success">No guests are currently waitlisted.</Alert>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Position</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell align="right">Guests</TableCell>
                <TableCell>Waitlisted at</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.waitlist.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.waitlist_position}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.phone ?? '—'}</TableCell>
                  <TableCell align="right">{row.guests}</TableCell>
                  <TableCell>{new Date(row.waitlisted_at).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Remove from waitlist">
                      <IconButton
                        size="small"
                        onClick={() => handleRemove(row.id)}
                        aria-label="Remove from waitlist"
                      >
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
