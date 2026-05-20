import { useCallback, useMemo, useState } from 'react';
import { Box, Chip, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { Event } from '../../services/events-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EventCalendarViewProps {
  events: Event[];
}

// ── Color helpers ─────────────────────────────────────────────────────────────

type CalChipColor = 'primary' | 'success' | 'default' | 'error' | 'warning';

function statusChipColor(status: string): CalChipColor {
  switch (status) {
    case 'Active':
      return 'primary'; // blue
    case 'Ongoing':
      return 'success'; // green
    case 'Completed':
      return 'default'; // grey
    case 'Cancelled':
      return 'error'; // red
    default:
      return 'warning'; // amber for Draft etc.
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function EventCalendarView({ events }: EventCalendarViewProps): JSX.Element {
  const navigate = useNavigate();
  const [activeMonth, setActiveMonth] = useState<Date>(() => startOfMonth(new Date()));

  const prevMonth = useCallback(() => setActiveMonth((m) => startOfMonth(addMonths(m, -1))), []);
  const nextMonth = useCallback(() => setActiveMonth((m) => startOfMonth(addMonths(m, 1))), []);
  const goToday = useCallback(() => setActiveMonth(startOfMonth(new Date())), []);

  // Build the full grid: weeks that cover the current month
  const gridDays = useMemo<Date[]>(() => {
    const monthStart = startOfMonth(activeMonth);
    const monthEnd = endOfMonth(activeMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    });
  }, [activeMonth]);

  // Index events by date string for O(1) lookup per cell
  const eventsByDate = useMemo<Map<string, Event[]>>(() => {
    const map = new Map<string, Event[]>();
    for (const ev of events) {
      // Accept both the current `date` field and the legacy `event_date` alias.
      const eventDate = ev.date ?? ev.event_date ?? '';
      const dateKey = eventDate.slice(0, 10);
      if (!dateKey) continue;
      const existing = map.get(dateKey);
      if (existing) {
        existing.push(ev);
      } else {
        map.set(dateKey, [ev]);
      }
    }
    return map;
  }, [events]);

  const totalWeeks = gridDays.length / 7;

  return (
    <Box>
      {/* Header navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={prevMonth} aria-label="Previous month" size="small">
          <ChevronLeftRounded />
        </IconButton>
        <Typography variant="h6" fontWeight={600} sx={{ minWidth: 180, textAlign: 'center' }}>
          {format(activeMonth, 'MMMM yyyy')}
        </Typography>
        <IconButton onClick={nextMonth} aria-label="Next month" size="small">
          <ChevronRightRounded />
        </IconButton>
        <Tooltip title="Go to today">
          <IconButton onClick={goToday} aria-label="Today" size="small">
            <TodayRounded />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Calendar grid table */}
      <Paper
        component="table"
        role="grid"
        aria-label={`Calendar for ${format(activeMonth, 'MMMM yyyy')}`}
        sx={{
          borderCollapse: 'collapse',
          width: '100%',
          tableLayout: 'fixed',
          boxShadow: 1,
        }}
      >
        {/* Day row header */}
        <Box component="thead" role="rowgroup">
          <Box
            component="tr"
            role="row"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
          >
            {WEEK_DAYS.map((day) => (
              <Box
                key={day}
                component="th"
                role="columnheader"
                aria-label={day}
                sx={{
                  p: 1,
                  textAlign: 'center',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              >
                {day}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Weeks */}
        <Box component="tbody" role="rowgroup">
          {Array.from({ length: totalWeeks }, (_, weekIdx) => {
            const weekDays = gridDays.slice(weekIdx * 7, weekIdx * 7 + 7);
            return (
              <Box
                key={weekIdx}
                component="tr"
                role="row"
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
              >
                {weekDays.map((day) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const cellEvents = eventsByDate.get(dateKey) ?? [];
                  const inMonth = isSameMonth(day, activeMonth);
                  const todayFlag = isToday(day);

                  return (
                    <Box
                      key={dateKey}
                      component="td"
                      role="gridcell"
                      aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                      sx={{
                        minHeight: 90,
                        p: 0.5,
                        verticalAlign: 'top',
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: todayFlag
                          ? 'action.selected'
                          : inMonth
                            ? 'background.paper'
                            : 'action.hover',
                        opacity: inMonth ? 1 : 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={todayFlag ? 700 : 400}
                        sx={{
                          display: 'block',
                          mb: 0.25,
                          color: todayFlag
                            ? 'primary.main'
                            : inMonth
                              ? 'text.primary'
                              : 'text.disabled',
                        }}
                      >
                        {format(day, 'd')}
                      </Typography>

                      {/* Event chips — max 3 shown, +N more indicator */}
                      {cellEvents.slice(0, 3).map((ev) => {
                        const going = Number(ev.going_count ?? 0);
                        const cap = ev.capacity;
                        const overflow = cap != null && going > cap;
                        // Only describe overflow as a "waitlist" when waitlist
                        // is actually enabled on the event — otherwise it's
                        // simply over capacity.
                        const overflowText =
                          overflow && cap != null
                            ? ev.waitlist_enabled
                              ? `waitlist ${going - cap}`
                              : `over by ${going - cap}`
                            : null;
                        const capacityText =
                          cap != null
                            ? overflow
                              ? `${going}/${cap} · ${overflowText}`
                              : `${going}/${cap} · ${Math.max(cap - going, 0)} left`
                            : null;
                        const tooltip = [
                          ev.title,
                          ev.status,
                          capacityText,
                          ev.waitlist_enabled
                            ? 'Waitlist enabled'
                            : overflow
                              ? 'Waitlist disabled'
                              : null,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        const label = capacityText ? `${ev.title} · ${capacityText}` : ev.title;
                        return (
                          <Tooltip key={ev.id} title={tooltip}>
                            <Chip
                              label={label}
                              color={overflow ? 'error' : statusChipColor(ev.status)}
                              size="small"
                              onClick={() => navigate(`/events/${ev.id}`)}
                              data-testid={`calendar-event-chip-${ev.id}`}
                              sx={{
                                mb: 0.25,
                                maxWidth: '100%',
                                cursor: 'pointer',
                                fontSize: '0.65rem',
                                height: 18,
                              }}
                            />
                          </Tooltip>
                        );
                      })}
                      {cellEvents.length > 3 && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.65rem' }}
                        >
                          +{cellEvents.length - 3} more
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
      </Paper>
    </Box>
  );
}
