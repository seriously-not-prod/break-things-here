/**
 * RSVP Summary Panel — issue #373
 * Shows Confirmed/Pending/Declined counts with a Recharts PieChart.
 */

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  Formatter,
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import type { DashboardRsvp } from '../../services/dashboard-service';

export interface RsvpSummaryPanelProps {
  rsvps: DashboardRsvp[];
  loading: boolean;
}

interface StatusConfig {
  label: string;
  color: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  confirmed: { label: 'Confirmed', color: '#22c55e' },
  pending: { label: 'Pending', color: '#f59e0b' },
  maybe: { label: 'Maybe', color: '#6366f1' },
  declined: { label: 'Declined', color: '#ef4444' },
  waitlist: { label: 'Waitlist', color: '#8b5cf6' },
  cancelled: { label: 'Cancelled', color: '#94a3b8' },
};

const STATUS_ORDER = [
  'confirmed',
  'pending',
  'maybe',
  'declined',
  'waitlist',
  'cancelled',
] as const;

function normalizeTooltipValue(value: ValueType | undefined): number {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }

  return Number(value ?? 0);
}

const formatRsvpTooltip: Formatter<ValueType, NameType> = (value, name) => {
  return [normalizeTooltipValue(value), String(name ?? '')];
};

export function RsvpSummaryPanel({ rsvps, loading }: RsvpSummaryPanelProps): JSX.Element {
  if (loading) {
    return (
      <Stack spacing={1}>
        <Skeleton variant="circular" width={160} height={160} sx={{ mx: 'auto' }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={24} sx={{ borderRadius: 1 }} />
        ))}
      </Stack>
    );
  }

  if (rsvps.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }} role="status" aria-label="No RSVPs">
        <PeopleIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} aria-hidden="true" />
        <Typography color="text.secondary">No RSVPs received yet.</Typography>
      </Box>
    );
  }

  const chartData = STATUS_ORDER.map((status) => {
    const group = rsvps.filter((r) => r.canonical_status === status);
    return {
      name: STATUS_CONFIG[status]?.label ?? status,
      value: group.reduce((sum, r) => sum + (r.guests ?? 1), 0),
      color: STATUS_CONFIG[status]?.color ?? '#94a3b8',
    };
  }).filter((d) => d.value > 0);

  const totalGuests = rsvps.reduce((sum, r) => sum + (r.guests ?? 1), 0);

  return (
    <Stack spacing={2}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart aria-label="RSVP status breakdown pie chart">
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={formatRsvpTooltip} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>

      <Typography variant="caption" color="text.secondary" textAlign="center">
        {totalGuests} total guest{totalGuests !== 1 ? 's' : ''} across {rsvps.length} RSVP
        {rsvps.length !== 1 ? 's' : ''}
      </Typography>

      <Stack spacing={0.75} role="list" aria-label="RSVP status breakdown">
        {chartData.map((d) => (
          <Box
            key={d.name}
            role="listitem"
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: d.color, flexShrink: 0 }}
                aria-hidden="true"
              />
              <Typography variant="body2">{d.name}</Typography>
            </Box>
            <Typography variant="body2" fontWeight={700}>
              {d.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
