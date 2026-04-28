import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
} from '@mui/material';
import {
  CalendarMonthRounded,
  CheckCircleRounded,
  GroupRounded,
  TaskAltRounded,
} from '@mui/icons-material';
import { api } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

interface Stats {
  totalEvents: number;
  activeEvents: number;
  totalTasks: number;
  pendingTasks: number;
  totalRsvps: number;
  goingRsvps: number;
}

interface StatCardProps {
  label: string;
  value: number;
  sub?: string;
  icon: JSX.Element;
  color?: string;
}

function StatCard({ label, value, sub, icon, color = 'primary.main' }: StatCardProps): JSX.Element {
  return (
    <Card elevation={2}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color }}>{icon}</Box>
          <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
        </Box>
        <Typography variant="h4" fontWeight={700}>{value}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard(): JSX.Element {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>('/api/events/stats')
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Welcome back{user?.displayName ? `, ${user.displayName}` : ''}!
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Here's an overview of your festival planning activity.
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label="Total Events"
              value={stats?.totalEvents ?? 0}
              sub={`${stats?.activeEvents ?? 0} active`}
              icon={<CalendarMonthRounded />}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label="Tasks"
              value={stats?.totalTasks ?? 0}
              sub={`${stats?.pendingTasks ?? 0} pending`}
              icon={<TaskAltRounded />}
              color="warning.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label="RSVPs"
              value={stats?.totalRsvps ?? 0}
              sub={`${stats?.goingRsvps ?? 0} going`}
              icon={<GroupRounded />}
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              label="Completed Tasks"
              value={(stats?.totalTasks ?? 0) - (stats?.pendingTasks ?? 0)}
              icon={<CheckCircleRounded />}
              color="info.main"
            />
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
