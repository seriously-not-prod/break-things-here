/**
 * Communication metrics panel (#467, story #419).
 *
 * Shows email open/click aggregates for a single event. Renders an empty state
 * when no campaigns have been sent or no tracking data has arrived yet.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { CampaignRounded, MailOutlined, TrendingUpRounded, OpenInNewRounded } from '@mui/icons-material';
import {
  getCommunicationMetrics,
  type CommunicationMetrics,
} from '../../services/analytics-service';

interface CommunicationMetricsPanelProps {
  eventId: string | number;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: JSX.Element;
  label: string;
  primary: string;
  secondary?: string;
}): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {icon}
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" fontWeight={700}>
        {primary}
      </Typography>
      {secondary && (
        <Typography variant="caption" color="text.secondary">
          {secondary}
        </Typography>
      )}
    </Paper>
  );
}

export function CommunicationMetricsPanel({
  eventId,
}: CommunicationMetricsPanelProps): JSX.Element {
  const [metrics, setMetrics] = useState<CommunicationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getCommunicationMetrics(eventId)
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load communication metrics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!metrics || metrics.totals.sent === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }} role="status">
        <MailOutlined sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
        <Typography variant="subtitle1" fontWeight={600}>
          No communication metrics yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Send an invitation or reminder to begin collecting open and click data.
        </Typography>
      </Paper>
    );
  }

  const { totals, byCampaign } = metrics;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <CampaignRounded color="primary" />
        <Typography variant="h6" fontWeight={700}>
          Communication metrics
        </Typography>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <MetricCard
            icon={<MailOutlined fontSize="small" />}
            label="Sent"
            primary={String(totals.sent)}
            secondary={
              totals.failed > 0
                ? `${totals.delivered} delivered · ${totals.failed} failed`
                : `${totals.delivered} delivered`
            }
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            icon={<OpenInNewRounded fontSize="small" />}
            label="Open rate"
            primary={formatPercent(totals.openRate)}
            secondary={`${totals.uniqueOpens} unique · ${totals.totalOpens} total`}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            icon={<TrendingUpRounded fontSize="small" />}
            label="Click rate"
            primary={formatPercent(totals.clickRate)}
            secondary={`${totals.uniqueClicks} unique · ${totals.totalClicks} total`}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <MetricCard
            icon={<CampaignRounded fontSize="small" />}
            label="Campaigns"
            primary={String(byCampaign.length)}
            secondary="distinct campaign types"
          />
        </Grid>
      </Grid>

      {byCampaign.length > 0 && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Table size="small" aria-label="Per-campaign communication breakdown">
            <TableHead>
              <TableRow>
                <TableCell>Campaign</TableCell>
                <TableCell align="right">Sent</TableCell>
                <TableCell align="right">Opens</TableCell>
                <TableCell align="right">Clicks</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {byCampaign.map((row) => (
                <TableRow key={row.campaignType}>
                  <TableCell sx={{ textTransform: 'capitalize' }}>{row.campaignType}</TableCell>
                  <TableCell align="right">{row.sent}</TableCell>
                  <TableCell align="right">{row.opens}</TableCell>
                  <TableCell align="right">{row.clicks}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
