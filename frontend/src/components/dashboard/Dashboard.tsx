/**
 * Dashboard — Festival Event Planner
 * Covers issues: #372 #373 #374 #375
 *
 * Assembles KPI cards, upcoming events, RSVP breakdown, task summary,
 * budget overview (placeholder), and quick access navigation.
 * All panels show MUI Skeleton while loading and a helpful message when empty.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Grid, Paper, Typography } from '@mui/material';
import { useAuth } from '../../contexts/auth-context';
import { fetchDashboardData } from '../../services/dashboard-service';
import type { DashboardData } from '../../services/dashboard-service';
import { KpiCards } from './kpi-cards';
import { UpcomingEventsList } from './upcoming-events-list';
import { TaskSummaryPanel } from './task-summary-panel';
import { RsvpSummaryPanel } from './rsvp-summary-panel';
import { BudgetOverviewPanel } from './budget-overview-panel';
import { QuickAccessGrid } from './quick-access-grid';
import { GlobalAnalyticsWidget } from '../analytics/global-analytics-widget';
import { PageLayout } from '../layout/page-layout';

export default function Dashboard(): JSX.Element {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboardData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  return (
    <PageLayout
      title={`Welcome back, ${firstName} 👋`}
      subtitle="Here's what's happening with your events today."
    >
      {/* Error banner */}
      {error !== null && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => setError(null)}
          data-testid="dashboard-error-alert"
        >
          {error}
        </Alert>
      )}

      {/* KPI row */}
      <Box sx={{ mb: 3 }}>
        <KpiCards data={data} loading={loading} />
      </Box>

      {/* Main panels row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={1} sx={{ p: 2.5, height: '100%' }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Upcoming Events
            </Typography>
            <UpcomingEventsList events={data?.events ?? []} loading={loading} />
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={1} sx={{ p: 2.5, height: '100%' }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              RSVP Breakdown
            </Typography>
            <RsvpSummaryPanel rsvps={data?.rsvps ?? []} loading={loading} />
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper elevation={1} sx={{ p: 2.5, height: '100%' }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Task Summary
            </Typography>
            <TaskSummaryPanel tasks={data?.tasks ?? []} loading={loading} />
          </Paper>
        </Grid>
      </Grid>

      {/* Budget, analytics, and quick access row */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={4}>
          <Paper elevation={1} sx={{ p: 2.5 }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Budget Overview
            </Typography>
            <BudgetOverviewPanel />
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <GlobalAnalyticsWidget />
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper elevation={1} sx={{ p: 2.5 }}>
            <Typography component="h2" variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Quick Access
            </Typography>
            <QuickAccessGrid user={user} />
          </Paper>
        </Grid>
      </Grid>
    </PageLayout>
  );
}
