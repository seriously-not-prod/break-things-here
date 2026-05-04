/**
 * Event Analytics Page
 * Route target: /events/:id/analytics
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportEventReport,
  getEventAnalytics,
  type EventAnalytics,
} from '../../services/analytics-service';

const RSVP_COLORS = ['#16a34a', '#f59e0b', '#dc2626'];
const DIETARY_COLOR = '#0ea5e9';
const BUDGET_COLOR = '#f97316';
const ALLOCATED_COLOR = '#cbd5e1';

interface KpiChipProps {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'info';
}

function KpiChip({ label, value, tone }: KpiChipProps): JSX.Element {
  return <Chip label={`${label}: ${value}`} color={tone} variant="filled" />;
}

function StatCard({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <Card elevation={1} sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={800} sx={{ mt: 0.5 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <Card elevation={2} sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={800}>
            {title}
          </Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AnalyticsPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<EventAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      if (!id) {
        setError('Event id is missing.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await getEventAnalytics(id);
        if (active) setData(result);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load analytics.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  const rsvpPieData = useMemo(
    () => [
      { name: 'Confirmed', value: data?.confirmedRsvps ?? 0 },
      { name: 'Pending', value: data?.pendingRsvps ?? 0 },
      { name: 'Declined', value: data?.declinedRsvps ?? 0 },
    ],
    [data],
  );

  const budgetChartData = useMemo(
    () => (data?.topExpenseCategories ?? []).map((item) => ({
      category: item.category,
      spent: item.spent,
      allocated: data?.totalBudgetAllocated && (data.topExpenseCategories.length > 0)
        ? Math.round(data.totalBudgetAllocated / data.topExpenseCategories.length)
        : 0,
    })),
    [data],
  );

  const taskTotal = (data?.tasksByStatus.Pending ?? 0)
    + (data?.tasksByStatus.InProgress ?? 0)
    + (data?.tasksByStatus.Blocked ?? 0)
    + (data?.tasksByStatus.Complete ?? 0);

  async function handleExport(): Promise<void> {
    if (!id) return;
    setExporting(true);
    try {
      await exportEventReport(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export report.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, maxWidth: 1400 }}>
        <Stack spacing={2}>
          <Skeleton variant="text" width={240} height={48} />
          <Grid container spacing={2}>
            {[0, 1, 2].map((index) => (
              <Grid item xs={12} md={4} key={index}>
                <Skeleton variant="rounded" height={48} />
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={3}>
            {[0, 1, 2, 3].map((index) => (
              <Grid item xs={12} md={6} key={index}>
                <Skeleton variant="rounded" height={320} />
              </Grid>
            ))}
          </Grid>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography component="h1" variant="h4" fontWeight={900}>
              Event Analytics
            </Typography>
            <Typography color="text.secondary">
              RSVP, budget, and task reporting for this event.
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<DownloadRounded />}
            onClick={() => void handleExport()}
            disabled={exporting || !id}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <KpiChip label="Acceptance rate" value={`${data?.acceptanceRate ?? 0}%`} tone="success" />
          <KpiChip label="Budget utilization" value={`${data?.budgetUtilizationPct ?? 0}%`} tone="warning" />
          <KpiChip label="Task completion" value={`${data?.taskCompletionRate ?? 0}%`} tone="info" />
        </Stack>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <SectionCard title="RSVP Breakdown">
              <Grid container spacing={2}>
                <Grid item xs={12} md={7}>
                  <Box sx={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={rsvpPieData} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50}>
                          {rsvpPieData.map((entry, index) => (
                            <Cell key={entry.name} fill={RSVP_COLORS[index % RSVP_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                </Grid>
                <Grid item xs={12} md={5}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}><StatCard label="Confirmed" value={data?.confirmedRsvps ?? 0} /></Grid>
                    <Grid item xs={6}><StatCard label="Pending" value={data?.pendingRsvps ?? 0} /></Grid>
                    <Grid item xs={6}><StatCard label="Declined" value={data?.declinedRsvps ?? 0} /></Grid>
                    <Grid item xs={6}><StatCard label="Checked-in" value={data?.checkedInCount ?? 0} /></Grid>
                  </Grid>
                </Grid>
              </Grid>
            </SectionCard>
          </Grid>

          <Grid item xs={12} lg={5}>
            <SectionCard title="Task Summary">
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  Completion rate: {data?.taskCompletionRate ?? 0}%
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ flexGrow: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={taskTotal > 0 ? ((data?.tasksByStatus.Complete ?? 0) / taskTotal) * 100 : 0}
                      sx={{ height: 12, borderRadius: 999 }}
                    />
                  </Box>
                  <Typography variant="body2" fontWeight={700}>
                    {data?.tasksByStatus.Complete ?? 0}/{taskTotal}
                  </Typography>
                </Stack>
                <Grid container spacing={2}>
                  <Grid item xs={6}><StatCard label="Pending" value={data?.tasksByStatus.Pending ?? 0} /></Grid>
                  <Grid item xs={6}><StatCard label="In progress" value={data?.tasksByStatus.InProgress ?? 0} /></Grid>
                  <Grid item xs={6}><StatCard label="Blocked" value={data?.tasksByStatus.Blocked ?? 0} /></Grid>
                  <Grid item xs={6}><StatCard label="Complete" value={data?.tasksByStatus.Complete ?? 0} /></Grid>
                </Grid>
              </Stack>
            </SectionCard>
          </Grid>

          <Grid item xs={12} lg={7}>
            <SectionCard title="Budget">
              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <StatCard label="Allocated" value={`$${(data?.totalBudgetAllocated ?? 0).toLocaleString()}`} />
                  <StatCard label="Spent" value={`$${(data?.totalBudgetSpent ?? 0).toLocaleString()}`} />
                </Stack>
                <Box sx={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={budgetChartData}>
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="allocated" fill={ALLOCATED_COLOR} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="spent" fill={BUDGET_COLOR} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Stack>
            </SectionCard>
          </Grid>

          <Grid item xs={12} lg={5}>
            <SectionCard title="Dietary Breakdown">
              {data?.rsvpByDietaryRestriction.length ? (
                <Box sx={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart layout="vertical" data={data.rsvpByDietaryRestriction}>
                      <XAxis type="number" />
                      <YAxis dataKey="dietary" type="category" width={110} />
                      <Tooltip />
                      <Bar dataKey="count" fill={DIETARY_COLOR} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Alert severity="info">
                  Dietary restriction data is not available in the current RSVP schema.
                </Alert>
              )}
            </SectionCard>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}
