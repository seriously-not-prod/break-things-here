/**
 * KPI Cards component — issue #372
 * Displays summary metrics: active events, total guests, tasks completed, budget placeholder.
 */

import { Box, Card, CardContent, Grid, Skeleton, Typography } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PeopleIcon from '@mui/icons-material/People';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import type { ReactNode } from 'react';
import type { DashboardData } from '../../services/dashboard-service';

interface KpiCardProps {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  color: string;
}

function KpiCard({ label, value, sub, icon, color }: KpiCardProps): JSX.Element {
  return (
    <Card
      elevation={1}
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: color,
          borderRadius: '12px 12px 0 0',
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
            mb: 1.5,
          }}
        >
          <Box>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ letterSpacing: '0.08em', fontSize: '0.6875rem' }}
            >
              {label}
            </Typography>
            <Typography
              variant="h4"
              fontWeight={800}
              aria-label={`${label}: ${value}`}
              sx={{ lineHeight: 1.1, mt: 0.25 }}
            >
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.25,
              borderRadius: 2,
              bgcolor: `${color}18`,
              color,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {icon}
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {sub}
        </Typography>
      </CardContent>
    </Card>
  );
}

export interface KpiCardsProps {
  data: DashboardData | null;
  loading: boolean;
  totalBudget?: number | null;
}

export function KpiCards({ data, loading, totalBudget }: KpiCardsProps): JSX.Element {
  if (loading) {
    return (
      <Grid container spacing={2}>
        {[0, 1, 2, 3].map((i) => (
          <Grid item xs={12} sm={6} lg={3} key={i}>
            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  const events = data?.events ?? [];
  const tasks = data?.tasks ?? [];
  const rsvps = data?.rsvps ?? [];

  const activeEvents = events.filter((e) => e.status === 'Active');
  const totalGuests = rsvps.reduce((sum, r) => sum + (r.guests ?? 1), 0);
  const goingCount = rsvps.filter((r) => r.canonical_status === 'confirmed').length;
  const completedTasks = tasks.filter((t) => t.status === 'Complete').length;
  const pendingTasks = tasks.length - completedTasks;

  const budgetDisplay =
    totalBudget != null
      ? new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(totalBudget)
      : '—';
  const budgetSub =
    totalBudget != null ? 'total allocated across active events' : 'Open an event to manage its budget';

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} lg={3}>
        <KpiCard
          label="Active Events"
          value={activeEvents.length}
          sub={`${events.length} total event${events.length !== 1 ? 's' : ''}`}
          icon={<CalendarMonthIcon />}
          color="#6366f1"
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <KpiCard
          label="Total Guests"
          value={totalGuests}
          sub={`${goingCount} confirmed going`}
          icon={<PeopleIcon />}
          color="#8b5cf6"
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <KpiCard
          label="Tasks Completed"
          value={completedTasks}
          sub={`${pendingTasks} remaining`}
          icon={<TaskAltIcon />}
          color="#22c55e"
        />
      </Grid>
      <Grid item xs={12} sm={6} lg={3}>
        <KpiCard
          label="Total Budget"
          value={budgetDisplay}
          sub={budgetSub}
          icon={<AttachMoneyIcon />}
          color="#06b6d4"
        />
      </Grid>
    </Grid>
  );
}
