/**
 * Vendor Performance Tab — #798
 *
 * Renders a vendor's performance metrics with a 90-day / lifetime window
 * toggle. Reuses the existing `vendor-performance` endpoint with the new
 * `window` query param. Shows mean/median response time, on-time
 * delivery rate, and complaint count along with the existing summary
 * metrics. Empty-state message is shown when the vendor has no
 * communications and no timeline items in the chosen window.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Rating,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import {
  type VendorPerformance,
  type VendorPerformanceWindow,
  getVendorPerformance,
} from '../../services/vendor-performance-service';

interface Props {
  eventId: number | string;
  vendorId: number | string;
  /** Optional override; defaults to 'lifetime'. */
  initialWindow?: VendorPerformanceWindow;
}

function formatHours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 24) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} d`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

export default function VendorPerformanceTab({
  eventId,
  vendorId,
  initialWindow = 'lifetime',
}: Props): JSX.Element {
  const [windowFilter, setWindowFilter] = useState<VendorPerformanceWindow>(initialWindow);
  const [perf, setPerf] = useState<VendorPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVendorPerformance(eventId, vendorId, windowFilter);
      setPerf(data);
    } catch {
      setError('Failed to load performance data.');
      setPerf(null);
    } finally {
      setLoading(false);
    }
  }, [eventId, vendorId, windowFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleWindowChange = (
    _: React.MouseEvent<HTMLElement>,
    value: VendorPerformanceWindow | null,
  ): void => {
    if (value && value !== windowFilter) setWindowFilter(value);
  };

  const scoreColor: 'success' | 'warning' | 'error' | 'primary' = perf
    ? perf.performance_score >= 80
      ? 'success'
      : perf.performance_score >= 50
        ? 'warning'
        : 'error'
    : 'primary';

  const isEmpty =
    perf &&
    perf.total_communications === 0 &&
    perf.timeline_items === 0 &&
    perf.total_expenses === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="vendor-performance-tab">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        spacing={1}
        sx={{ mb: 2 }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Performance{perf?.vendor_name ? ` — ${perf.vendor_name}` : ''}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={windowFilter}
          onChange={handleWindowChange}
          aria-label="Performance window"
        >
          <ToggleButton value="90d" aria-label="Last 90 days" data-testid="perf-window-90d">
            90 days
          </ToggleButton>
          <ToggleButton value="lifetime" aria-label="Lifetime" data-testid="perf-window-lifetime">
            Lifetime
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress size={24} />
        </Box>
      ) : !perf ? null : isEmpty ? (
        <Box sx={{ py: 4, textAlign: 'center' }} data-testid="vendor-performance-empty">
          <Typography variant="body2" color="text.secondary">
            No performance data for{' '}
            {windowFilter === '90d' ? 'the last 90 days' : 'this vendor lifetime'} yet.
            Communications and timeline activities will populate this view as they accrue.
          </Typography>
        </Box>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Tooltip title={`Performance score: ${perf.performance_score}/100`}>
              <Chip
                label={`Score: ${perf.performance_score}`}
                color={scoreColor}
                size="small"
                data-testid="perf-score-chip"
              />
            </Tooltip>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Rating
              </Typography>
              {perf.rating ? (
                <Rating value={perf.rating} readOnly size="small" />
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Stack>
          </Stack>

          <LinearProgress
            variant="determinate"
            value={perf.performance_score}
            color={scoreColor}
            sx={{ mb: 2, height: 8, borderRadius: 4 }}
            aria-label={`Performance score ${perf.performance_score}%`}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1 }}>
            <Stat
              label="Mean response"
              value={formatHours(perf.mean_response_hours)}
              testId="perf-mean-response"
            />
            <Stat
              label="Median response"
              value={formatHours(perf.median_response_hours)}
              testId="perf-median-response"
            />
            <Stat
              label="On-time delivery"
              value={
                perf.on_time_total_completed > 0
                  ? `${formatPercent(perf.on_time_rate)} (${perf.on_time_completed}/${perf.on_time_total_completed})`
                  : '—'
              }
              testId="perf-on-time"
            />
            <Stat
              label="Complaints"
              value={String(perf.complaint_count)}
              testId="perf-complaints"
              severity={perf.complaint_count > 0 ? 'warning' : undefined}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack spacing={0.75}>
            <Row label="Communications" value={String(perf.total_communications)} />
            <Row
              label="Last contact"
              value={perf.last_contact_at ? new Date(perf.last_contact_at).toLocaleString() : '—'}
            />
            <Row
              label="Contract on file"
              value={perf.contract_on_file ? 'Yes' : 'No'}
              icon={
                perf.contract_on_file ? (
                  <CheckCircleOutlineRounded fontSize="small" color="success" />
                ) : (
                  <CancelOutlined fontSize="small" color="error" />
                )
              }
            />
            <Row label="Timeline items" value={String(perf.timeline_items)} />
            <Row
              label="Total paid"
              value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                perf.total_paid,
              )}
            />
            <Row
              label="Outstanding"
              value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                perf.total_pending,
              )}
            />
          </Stack>
        </>
      )}
    </Paper>
  );
}

function Stat({
  label,
  value,
  testId,
  severity,
}: {
  label: string;
  value: string;
  testId?: string;
  severity?: 'warning' | 'error';
}): JSX.Element {
  return (
    <Box
      sx={{
        flex: 1,
        p: 1.25,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor:
          severity === 'warning'
            ? 'warning.50'
            : severity === 'error'
              ? 'error.50'
              : 'background.paper',
      }}
      data-testid={testId}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="subtitle1" fontWeight={700}>
        {value}
      </Typography>
    </Box>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: JSX.Element;
}): JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        {icon}
        <Typography variant="body2">{value}</Typography>
      </Stack>
    </Stack>
  );
}
