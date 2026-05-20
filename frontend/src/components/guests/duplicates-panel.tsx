/**
 * Duplicate detection panel (#411, #435).
 * Lists detected clusters and lets the planner merge each cluster into a chosen
 * survivor RSVP. Conflict resolution + audit happen server-side.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Paper,
  Radio,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { MergeTypeRounded, RefreshRounded } from '@mui/icons-material';
import { listDuplicates, mergeRsvps, type DuplicateCluster } from '../../services/guest-service';

interface Props {
  eventId: string | number;
  onChanged?: () => void;
}

const REASON_LABEL: Record<DuplicateCluster['reason'], string> = {
  same_phone: 'Same phone',
  same_name_and_email_domain: 'Same name + email domain',
  same_normalized_name: 'Same normalized name',
};

export function DuplicatesPanel({ eventId, onChanged }: Props): JSX.Element {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [survivors, setSurvivors] = useState<Record<number, number>>({});
  const [merging, setMerging] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback((): void => {
    setLoading(true);
    listDuplicates(eventId)
      .then((cs) => {
        setClusters(cs);
        const init: Record<number, number> = {};
        cs.forEach((c, idx) => {
          init[idx] = c.recommendedPrimaryId;
        });
        setSurvivors(init);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load duplicates.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMerge(idx: number): Promise<void> {
    const cluster = clusters[idx];
    const survivorId = survivors[idx];
    if (!cluster || !survivorId) return;
    const sourceIds = cluster.rsvps.filter((r) => r.id !== survivorId).map((r) => r.id);
    if (sourceIds.length === 0) return;
    setMerging(idx);
    try {
      await mergeRsvps(eventId, survivorId, sourceIds, notes[idx]);
      load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed.');
    } finally {
      setMerging(null);
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={600}>
          Possible duplicates
        </Typography>
        <Button startIcon={<RefreshRounded />} onClick={load} variant="outlined" size="small">
          Refresh
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {clusters.length === 0 && <Alert severity="success">No duplicate guests detected.</Alert>}

      {clusters.map((cluster, idx) => (
        <Paper key={idx} variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
            <Chip size="small" color="warning" label={REASON_LABEL[cluster.reason]} />
            <Typography variant="body2" color="text.secondary">
              {cluster.rsvps.length} matching record{cluster.rsvps.length === 1 ? '' : 's'}
            </Typography>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Survivor</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Guests</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cluster.rsvps.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell padding="checkbox">
                      <FormControl>
                        <Radio
                          checked={survivors[idx] === r.id}
                          onChange={() => setSurvivors((prev) => ({ ...prev, [idx]: r.id }))}
                          inputProps={{ 'aria-label': `Make ${r.name} the survivor` }}
                        />
                      </FormControl>
                    </TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>{r.phone ?? '—'}</TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell align="right">{r.guests}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}>
            <TextField
              label="Merge note (optional)"
              size="small"
              fullWidth
              value={notes[idx] ?? ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [idx]: e.target.value }))}
              inputProps={{ maxLength: 200 }}
            />
            <Button
              variant="contained"
              color="primary"
              startIcon={<MergeTypeRounded />}
              disabled={merging === idx || !survivors[idx]}
              onClick={() => handleMerge(idx)}
            >
              {merging === idx ? 'Merging…' : 'Merge into selected'}
            </Button>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}
