import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EventStatusCount { status: string; count: number }
interface RsvpStatusCount { status: string; count: number }
interface BudgetKpi { total_budget: number; total_spent: number; utilisation_pct: number }

interface Overview {
  total_events: number;
  events_by_status: EventStatusCount[];
  total_rsvps: number;
  rsvps_by_status: RsvpStatusCount[];
  active_users_30d: number;
  overdue_tasks: number;
  budget: BudgetKpi;
}

// ---------------------------------------------------------------------------
// Palette for status chips
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  Draft: '#94a3b8',
  Published: '#22c55e',
  Cancelled: '#ef4444',
  Completed: '#6366f1',
  Complete: '#6366f1',
  Going: '#22c55e',
  Pending: '#f59e0b',
  'Not Going': '#ef4444',
  Maybe: '#a855f7',
  Declined: '#64748b',
};

function colorFor(status: string): string {
  return STATUS_COLORS[status] ?? '#6366f1';
}

// ---------------------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------------------
interface StatCardProps { label: string; value: number | string; sub?: string }
function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h4" fontWeight={700} sx={{ my: 0.5 }}>{value}</Typography>
        {sub && <Typography variant="body2" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Analytics page
// ---------------------------------------------------------------------------
export default function AnalyticsPage(): JSX.Element {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<{ overview: Overview }>('/api/analytics/overview')
      .then((data) => setOverview(data.overview))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !overview) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error ?? 'No data available.'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Analytics &amp; KPI Dashboard
      </Typography>

      {/* ── KPI Stat Cards ───────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Total Events" value={overview.total_events} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label="Total RSVPs" value={overview.total_rsvps} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Active Users (30d)"
            value={overview.active_users_30d}
            sub="Logged in within last 30 days"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="Overdue Tasks"
            value={overview.overdue_tasks}
            sub="Past due date, not complete"
          />
        </Grid>
      </Grid>

      {/* ── Budget KPI ─────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 2, mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Budget Utilisation (All Events)</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Total Budget</Typography>
            <Typography fontWeight={600}>${overview.budget.total_budget.toLocaleString()}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Total Spent</Typography>
            <Typography fontWeight={600}>${overview.budget.total_spent.toLocaleString()}</Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="caption" color="text.secondary">Utilisation</Typography>
            <Typography
              fontWeight={600}
              color={overview.budget.utilisation_pct > 90 ? 'error.main' : overview.budget.utilisation_pct > 70 ? 'warning.main' : 'success.main'}
            >
              {overview.budget.utilisation_pct}%
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* ── Events by Status (Bar Chart) ─────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Events by Status</Typography>
            {overview.events_by_status.length === 0 ? (
              <Typography color="text.secondary">No event data.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overview.events_by_status} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {overview.events_by_status.map((entry) => (
                      <Cell key={entry.status} fill={colorFor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* ── RSVPs by Status (Pie Chart) ───────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>RSVPs by Status</Typography>
            {overview.rsvps_by_status.length === 0 ? (
              <Typography color="text.secondary">No RSVP data.</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={overview.rsvps_by_status}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ status, count }) => `${status}: ${count}`}
                  >
                    {overview.rsvps_by_status.map((entry) => (
                      <Cell key={entry.status} fill={colorFor(entry.status)} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Divider sx={{ my: 4 }} />

      <Typography variant="caption" color="text.secondary">
        Data is live from the database · Last loaded {new Date().toLocaleString()}
      </Typography>
    </Box>
  );
}
