/**
 * Task Workload / Capacity Page — #796
 *
 * Full-page workload dashboard with filters (date range, assignee, status)
 * and a configurable daily-hours capacity flag. Reuses the existing
 * `WorkloadDashboard` table component for the per-user rows; this page
 * adds the filter bar, capacity-threshold control, summary chips, and
 * an empty-state.
 */

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import {
  type WorkloadEntry,
  type WorkloadFilters,
  type WorkloadMeta,
  getWorkloadWithMeta,
} from '../../services/workload-service';
import WorkloadDashboard from './workload-dashboard';

const TASK_STATUSES = [
  'Pending',
  'In Progress',
  'Blocked',
  'Verification',
  'Complete',
  'Cancelled',
];

interface FilterState {
  from: string;
  to: string;
  assignee: string;
  status: string;
  dailyHours: string;
}

const defaultFilters: FilterState = {
  from: '',
  to: '',
  assignee: '',
  status: '',
  dailyHours: '8',
};

export default function TaskWorkloadPage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [workload, setWorkload] = useState<WorkloadEntry[]>([]);
  const [meta, setMeta] = useState<WorkloadMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildServiceFilters = useCallback((state: FilterState): WorkloadFilters | undefined => {
    const f: WorkloadFilters = {};
    if (state.from) f.from = state.from;
    if (state.to) f.to = state.to;
    if (state.assignee && /^\d+$/.test(state.assignee)) f.assignee = Number(state.assignee);
    if (state.status) f.status = state.status;
    if (state.dailyHours && Number(state.dailyHours) > 0) f.dailyHours = Number(state.dailyHours);
    return Object.keys(f).length === 0 ? undefined : f;
  }, []);

  const load = useCallback(
    async (state: FilterState): Promise<void> => {
      if (!Number.isFinite(eventId)) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getWorkloadWithMeta(eventId, buildServiceFilters(state));
        setWorkload(data.workload);
        setMeta(data.meta);
      } catch {
        setError('Failed to load workload data.');
        setWorkload([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [eventId, buildServiceFilters],
  );

  useEffect(() => {
    void load(appliedFilters);
  }, [load, appliedFilters]);

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    workload.forEach((w) => {
      if (w.user_id !== null && !seen.has(String(w.user_id))) {
        seen.set(String(w.user_id), w.display_name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [workload]);

  const overCapacityCount = workload.filter((w) => w.is_over_capacity).length;

  const handleApply = (): void => setAppliedFilters(filters);
  const handleReset = (): void => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handleTextField = (key: keyof FilterState) => (e: ChangeEvent<HTMLInputElement>) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSelect = (key: keyof FilterState) => (e: SelectChangeEvent) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <PageLayout
      title="Team Workload"
      subtitle="Per-assignee task hours over time with capacity flags."
      breadcrumbs={[
        { label: 'Events', to: '/events' },
        { label: 'Tasks', to: `/events/${eventId}/tasks` },
        { label: 'Workload' },
      ]}
      actions={
        <Button
          startIcon={<RefreshRounded />}
          onClick={() => void load(appliedFilters)}
          disabled={loading}
        >
          Refresh
        </Button>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper
        variant="outlined"
        sx={{ p: 2, mb: 2 }}
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          handleApply();
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-end' }}>
          <TextField
            label="From"
            type="date"
            value={filters.from}
            onChange={handleTextField('from')}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 150 }}
          />
          <TextField
            label="To"
            type="date"
            value={filters.to}
            onChange={handleTextField('to')}
            InputLabelProps={{ shrink: true }}
            size="small"
            sx={{ minWidth: 150 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="workload-assignee-label">Assignee</InputLabel>
            <Select
              labelId="workload-assignee-label"
              label="Assignee"
              value={filters.assignee}
              onChange={handleSelect('assignee')}
              inputProps={{ 'aria-label': 'Filter by assignee' }}
            >
              <MenuItem value="">All</MenuItem>
              {assigneeOptions.map((opt) => (
                <MenuItem key={opt.id} value={opt.id}>
                  {opt.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="workload-status-label">Status</InputLabel>
            <Select
              labelId="workload-status-label"
              label="Status"
              value={filters.status}
              onChange={handleSelect('status')}
              inputProps={{ 'aria-label': 'Filter by status' }}
            >
              <MenuItem value="">All</MenuItem>
              {TASK_STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Capacity (h/day)"
            type="number"
            value={filters.dailyHours}
            onChange={handleTextField('dailyHours')}
            size="small"
            inputProps={{ min: 1, step: 0.5, max: 24, 'aria-label': 'Daily capacity in hours' }}
            sx={{ minWidth: 140 }}
          />
          <Stack direction="row" spacing={1}>
            <Button type="submit" variant="contained" size="small">
              Apply
            </Button>
            <Button onClick={handleReset} size="small">
              Reset
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {meta && (
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }} useFlexGap>
          <Chip
            size="small"
            label={`Capacity: ${meta.daily_hours}h/day × ${meta.window_days} day${meta.window_days === 1 ? '' : 's'} = ${meta.capacity_threshold_hours}h`}
          />
          <Chip
            size="small"
            color={overCapacityCount > 0 ? 'warning' : 'default'}
            variant={overCapacityCount > 0 ? 'filled' : 'outlined'}
            label={`Over capacity: ${overCapacityCount}`}
            data-testid="workload-over-capacity-chip"
          />
          <Chip size="small" variant="outlined" label={`Team members: ${workload.length}`} />
        </Stack>
      )}

      {loading ? (
        <Skeleton variant="rounded" height={320} />
      ) : workload.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No workload data for the selected filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Assign tasks to team members or relax the filters to see workload data.
          </Typography>
        </Paper>
      ) : (
        <Box data-testid="workload-page-table">
          <WorkloadDashboard
            eventId={eventId}
            workloadOverride={workload}
            capacityThresholdHours={meta?.capacity_threshold_hours ?? 40}
          />
        </Box>
      )}
    </PageLayout>
  );
}
