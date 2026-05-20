/**
 * Global Analytics Widget
 * Compact dashboard card for cross-event analytics.
 */

import { useEffect, useState } from 'react';
import { Alert, Card, CardContent, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { getGlobalAnalytics, type GlobalAnalytics } from '../../services/analytics-service';

interface StatProps {
  label: string;
  value: string | number;
}

function Stat({ label, value }: StatProps): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
    </Stack>
  );
}

export function GlobalAnalyticsWidget(): JSX.Element {
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const result = await getGlobalAnalytics();
        if (active) setData(result);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : 'Failed to load global analytics.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="primary">
              Analytics
            </Typography>
            <Typography variant="h6" fontWeight={800}>
              Portfolio Snapshot
            </Typography>
          </Stack>

          {loading ? (
            <Grid container spacing={2}>
              {[0, 1, 2, 3].map((index) => (
                <Grid item xs={6} key={index}>
                  <Skeleton variant="rounded" height={64} />
                </Grid>
              ))}
            </Grid>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Stat label="Total events" value={data?.totalEvents ?? 0} />
              </Grid>
              <Grid item xs={6}>
                <Stat label="Total guests" value={data?.totalGuestsManaged ?? 0} />
              </Grid>
              <Grid item xs={6}>
                <Stat label="Avg acceptance" value={`${data?.averageRsvpRate ?? 0}%`} />
              </Grid>
              <Grid item xs={6}>
                <Stat
                  label="Budget managed"
                  value={`$${(data?.totalBudgetManaged ?? 0).toLocaleString()}`}
                />
              </Grid>
            </Grid>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
