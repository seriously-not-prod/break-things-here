/**
 * Workload Dashboard (#451)
 * Shows assigned tasks and capacity metrics per user.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
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
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { WorkloadEntry, getWorkload } from '../../services/workload-service';

interface Props {
  eventId: number | string;
  /** When provided, skips the internal fetch and renders the supplied rows. */
  workloadOverride?: WorkloadEntry[];
  /** Capacity threshold used for the progress bar denominator. Default 40 h. */
  capacityThresholdHours?: number;
}

const DEFAULT_CAPACITY_HOURS = 40;

export default function WorkloadDashboard({
  eventId,
  workloadOverride,
  capacityThresholdHours = DEFAULT_CAPACITY_HOURS,
}: Props): JSX.Element {
  const [workload, setWorkload] = useState<WorkloadEntry[]>(workloadOverride ?? []);
  const [loading, setLoading] = useState(workloadOverride === undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workloadOverride !== undefined) {
      setWorkload(workloadOverride);
      setLoading(false);
      return;
    }
    getWorkload(eventId)
      .then(setWorkload)
      .catch(() => setError('Failed to load workload data.'))
      .finally(() => setLoading(false));
  }, [eventId, workloadOverride]);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (workload.length === 0) {
    return (
      <Alert severity="info">
        No assigned tasks found. Assign tasks to team members to see workload data.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" mb={2}>
        Workload Dashboard
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Workload by team member">
          <TableHead>
            <TableRow>
              <TableCell>Team Member</TableCell>
              <TableCell align="right">Open Tasks</TableCell>
              <TableCell align="right">Blocked</TableCell>
              <TableCell align="right">Est. Hours</TableCell>
              <TableCell align="right">Logged Hours</TableCell>
              <TableCell sx={{ minWidth: 120 }}>Capacity</TableCell>
              <TableCell>Status Breakdown</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workload.map((row) => {
              const denominator =
                capacityThresholdHours > 0 ? capacityThresholdHours : DEFAULT_CAPACITY_HOURS;
              const capacityPct = Math.min(
                100,
                Math.round((row.estimated_hours / denominator) * 100),
              );
              return (
                <TableRow key={row.user_id ?? row.display_name} hover>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2">{row.display_name}</Typography>
                      {row.is_over_capacity && (
                        <Tooltip
                          title={`Over capacity — estimated hours exceed ${capacityThresholdHours}h`}
                        >
                          <WarningAmberRounded
                            fontSize="small"
                            color="warning"
                            data-testid={`workload-over-${row.user_id ?? row.display_name}`}
                          />
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{row.total_tasks}</TableCell>
                  <TableCell align="right">
                    {row.blocked_tasks > 0 ? (
                      <Chip label={row.blocked_tasks} color="error" size="small" />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell align="right">{row.estimated_hours.toFixed(1)}</TableCell>
                  <TableCell align="right">{row.actual_hours_logged.toFixed(1)}</TableCell>
                  <TableCell>
                    <Tooltip title={`${capacityPct}% of ${capacityThresholdHours}h capacity`}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={capacityPct}
                          color={
                            row.is_over_capacity
                              ? 'error'
                              : capacityPct > 80
                                ? 'warning'
                                : 'primary'
                          }
                          sx={{ flex: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="caption">{capacityPct}%</Typography>
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {row.pending_tasks > 0 && (
                        <Chip label={`${row.pending_tasks} pending`} size="small" />
                      )}
                      {row.in_progress_tasks > 0 && (
                        <Chip
                          label={`${row.in_progress_tasks} in progress`}
                          color="info"
                          size="small"
                        />
                      )}
                      {row.complete_tasks > 0 && (
                        <Chip label={`${row.complete_tasks} done`} color="success" size="small" />
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
