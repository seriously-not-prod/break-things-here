/**
 * Real-time attendance board (#595).
 *
 * Subscribes to the backend SSE stream and displays:
 *  - Live attendance KPIs (confirmed, checked in, attendance rate, late
 *    arrivals)
 *  - A scrolling feed of recent scan events
 *
 * The SSE stream emits two event types: `summary` (a complete stats
 * snapshot) and `attendance` (an individual delta). The page renders the
 * latest summary at all times and keeps the last 50 deltas in memory for
 * the feed.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  getAttendanceSummary,
  listRecentAttendance,
  attendanceStreamUrl,
  type AttendanceStats,
  type AttendanceRecentEvent,
} from '../../services/guest-service';

interface DeltaEvent {
  id: string;
  type: 'checkin' | 'undo_checkin' | string;
  name: string;
  email: string;
  late: boolean;
  delayMinutes: number | null;
  timestamp: string;
}

function statCard(
  label: string,
  value: number | string,
  accent?: 'primary' | 'success' | 'warning' | 'error',
) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h4" fontWeight={800} color={accent ? `${accent}.main` : 'inherit'}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function AttendanceBoardPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [feed, setFeed] = useState<DeltaEvent[]>([]);
  const [recent, setRecent] = useState<AttendanceRecentEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ stats }, events] = await Promise.all([
          getAttendanceSummary(eventId),
          listRecentAttendance(eventId),
        ]);
        if (cancelled) return;
        setStats(stats);
        setRecent(events);
      } catch {
        /* swallow — SSE may still deliver stats */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const source = new EventSource(attendanceStreamUrl(eventId), { withCredentials: true });
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('summary', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { stats: AttendanceStats };
        setStats(data.stats);
      } catch {
        /* noop */
      }
    });
    source.addEventListener('attendance', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as {
          type: string;
          rsvp?: {
            id: number;
            name: string;
            email: string;
            late_arrival: boolean;
            arrival_delay_minutes: number | null;
          };
          rsvpId?: number;
          timestamp: string;
        };
        if (data.type === 'checkin' && data.rsvp) {
          setFeed((prev) =>
            [
              {
                id: `${data.rsvp!.id}-${data.timestamp}`,
                type: 'checkin',
                name: data.rsvp!.name,
                email: data.rsvp!.email,
                late: data.rsvp!.late_arrival,
                delayMinutes: data.rsvp!.arrival_delay_minutes,
                timestamp: data.timestamp,
              },
              ...prev,
            ].slice(0, 50),
          );
        } else if (data.type === 'undo_checkin' && data.rsvpId) {
          setFeed((prev) =>
            [
              {
                id: `undo-${data.rsvpId}-${data.timestamp}`,
                type: 'undo_checkin',
                name: '',
                email: '',
                late: false,
                delayMinutes: null,
                timestamp: data.timestamp,
              },
              ...prev,
            ].slice(0, 50),
          );
        }
      } catch {
        /* noop */
      }
    });
    return () => source.close();
  }, [eventId]);

  const recentRows = useMemo(() => {
    if (feed.length > 0) return feed;
    return recent.map<DeltaEvent>((e) => ({
      id: `r-${e.id}`,
      type: e.action,
      name: e.name,
      email: e.email,
      late: Boolean(e.late_arrival),
      delayMinutes: e.arrival_delay_minutes,
      timestamp: e.occurred_at,
    }));
  }, [feed, recent]);

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Real-time attendance
        </Typography>
        <Chip
          size="small"
          color={connected ? 'success' : 'default'}
          label={connected ? 'Live' : 'Disconnected'}
        />
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('Invited', stats?.invited ?? 0)}
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('Confirmed', stats?.confirmed ?? 0, 'success')}
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('Checked in', stats?.checked_in ?? 0, 'primary')}
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('Late', stats?.late_arrivals ?? 0, 'warning')}
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('No-shows', stats?.no_show ?? 0, 'error')}
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          {statCard('Attendance rate', `${stats?.attendance_rate ?? 0}%`)}
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ mt: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Guest</TableCell>
                <TableCell>Notes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    No scans yet.
                  </TableCell>
                </TableRow>
              )}
              {recentRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{new Date(row.timestamp).toLocaleTimeString()}</TableCell>
                  <TableCell>
                    <Chip size="small" label={row.type.replace('_', ' ')} />
                  </TableCell>
                  <TableCell>{row.name || '—'}</TableCell>
                  <TableCell>
                    {row.late && (
                      <Chip
                        size="small"
                        color="warning"
                        label={`Late ${row.delayMinutes ?? '?'}m`}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
