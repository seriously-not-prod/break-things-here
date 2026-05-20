/**
 * Vendor Performance Card (#463)
 * Displays post-event performance metrics for a vendor.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  LinearProgress,
  Rating,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import { VendorPerformance, getVendorPerformance } from '../../services/vendor-performance-service';

interface Props {
  eventId: number | string;
  vendorId: number | string;
}

export default function VendorPerformanceCard({ eventId, vendorId }: Props): JSX.Element {
  const [perf, setPerf] = useState<VendorPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVendorPerformance(eventId, vendorId)
      .then(setPerf)
      .catch(() => setError('Failed to load performance data.'))
      .finally(() => setLoading(false));
  }, [eventId, vendorId]);

  if (loading) return <CircularProgress size={20} />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!perf) return <></>;

  const scoreColor =
    perf.performance_score >= 80 ? 'success' : perf.performance_score >= 50 ? 'warning' : 'error';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2">Performance — {perf.vendor_name}</Typography>
        <Tooltip title={`Performance score: ${perf.performance_score}/100`}>
          <Chip label={`Score: ${perf.performance_score}`} color={scoreColor} size="small" />
        </Tooltip>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={perf.performance_score}
        color={scoreColor}
        sx={{ mb: 2, height: 8, borderRadius: 4 }}
        aria-label={`Performance score ${perf.performance_score}%`}
      />

      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Rating
          </Typography>
          {perf.rating ? (
            <Rating value={perf.rating} readOnly size="small" />
          ) : (
            <Typography variant="body2">—</Typography>
          )}
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Contract on File
          </Typography>
          {perf.contract_on_file ? (
            <CheckCircleOutlineRounded fontSize="small" color="success" />
          ) : (
            <CancelOutlined fontSize="small" color="error" />
          )}
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Communications
          </Typography>
          <Typography variant="body2">{perf.total_communications}</Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Last Contact
          </Typography>
          <Typography variant="body2">
            {perf.last_contact_at ? new Date(perf.last_contact_at).toLocaleDateString() : '—'}
          </Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Timeline Items
          </Typography>
          <Typography variant="body2">{perf.timeline_items}</Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Total Paid
          </Typography>
          <Typography variant="body2">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
              perf.total_paid,
            )}
          </Typography>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
          <Typography variant="body2" color="text.secondary">
            Outstanding
          </Typography>
          <Typography
            variant="body2"
            color={perf.total_pending > 0 ? 'warning.main' : 'text.primary'}
          >
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
              perf.total_pending,
            )}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
