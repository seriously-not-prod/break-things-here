/**
 * Upcoming Events List — issue #373
 * Shows next 4 events sorted by date with status chips.
 */

import { Box, Chip, Paper, Skeleton, Stack, Typography } from '@mui/material';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import type { DashboardEvent } from '../../services/dashboard-service';

export interface UpcomingEventsListProps {
  events: DashboardEvent[];
  loading: boolean;
}

type StatusChipColor = 'default' | 'primary' | 'success' | 'error' | 'warning';

const STATUS_CHIP_COLORS: Record<string, StatusChipColor> = {
  Draft: 'default',
  Active: 'primary',
  Completed: 'success',
  Cancelled: 'error',
};

function formatEventDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function UpcomingEventsList({ events, loading }: UpcomingEventsListProps): JSX.Element {
  if (loading) {
    return (
      <Stack spacing={1} role="list" aria-label="Loading upcoming events">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={62} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
    );
  }

  const upcoming = [...events]
    .sort((a, b) => {
      const timeA = a.event_date ? new Date(a.event_date).getTime() : 0;
      const timeB = b.event_date ? new Date(b.event_date).getTime() : 0;
      return timeA - timeB;
    })
    .slice(0, 4);

  if (upcoming.length === 0) {
    return (
      <Box
        sx={{ py: 4, textAlign: 'center' }}
        role="status"
        aria-label="No upcoming events"
      >
        <CalendarTodayIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} aria-hidden="true" />
        <Typography color="text.secondary">No events scheduled yet.</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {upcoming.map((event) => (
        <Paper
          key={event.id}
          component="li"
          variant="outlined"
          sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={700}
              noWrap
              title={event.title}
            >
              {event.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {event.event_date ? formatEventDate(event.event_date) : 'Date TBD'}
              {event.location ? ` · ${event.location}` : ''}
            </Typography>
          </Box>
          <Chip
            label={event.status}
            color={STATUS_CHIP_COLORS[event.status] ?? 'default'}
            size="small"
          />
        </Paper>
      ))}
    </Stack>
  );
}
