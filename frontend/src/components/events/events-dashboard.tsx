import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Grid, Typography, Chip, Paper, Stack } from '@mui/material';
import { AddRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';

interface Stats {
  totalEvents: number;
  activeEvents: number;
  totalTasks: number;
  pendingTasks: number;
  totalRsvps: number;
  goingRsvps: number;
}

interface EventItem {
  id: number;
  title: string;
  event_date: string;
  status: string;
  event_type?: string;
}

export default function EventsDashboard(): JSX.Element {
  const [stats, setStats] = useState<Stats | null>(null);
  const [upcoming, setUpcoming] = useState<EventItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      try {
        const s = await api.get<Stats>('/api/events/stats');
        setStats(s);
      } catch (e) {
        // ignore — show zeros
        setStats({ totalEvents: 0, activeEvents: 0, totalTasks: 0, pendingTasks: 0, totalRsvps: 0, goingRsvps: 0 });
      }

      try {
        const list = await api.get<{ events: EventItem[] }>('/api/events');
        const now = new Date();
        const upcomingList = (list.events ?? [])
          .filter((ev) => new Date(ev.event_date) >= now)
          .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
          .slice(0, 5);
        setUpcoming(upcomingList);
      } catch (e) {
        setUpcoming([]);
      }
    })();
  }, []);

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Event Hub</Typography>
        <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/events/new')}>
          Create Event
        </Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Total Events</Typography>
              <Typography variant="h6" fontWeight={700}>{stats?.totalEvents ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Upcoming Events</Typography>
              <Typography variant="h6" fontWeight={700}>{(upcoming && upcoming.length) ?? 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Active Events</Typography>
              <Typography variant="h6" fontWeight={700}>{stats?.activeEvents ?? '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">Completed Events</Typography>
              <Typography variant="h6" fontWeight={700}>{stats ? Math.max(0, (stats.totalEvents - stats.activeEvents)) : '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" fontWeight={700}>Upcoming</Typography>
              <Chip label={`${upcoming.length} shown`} />
            </Box>
            <Stack spacing={1}>
              {upcoming.length === 0 ? (
                <Typography color="text.secondary">No upcoming events. Create one to get started.</Typography>
              ) : upcoming.map((ev) => (
                <Paper key={ev.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography fontWeight={700}>{ev.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{new Date(ev.event_date).toLocaleString()}</Typography>
                  </Box>
                  <Chip label={ev.status} color={ev.status === 'Active' ? 'primary' : 'default'} />
                </Paper>
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Events by Status</Typography>
            <Box>
              {/* Simple bar chart using inline widths */}
              {stats ? (
                ['Active', 'Planning', 'Confirmed', 'Completed', 'Draft', 'Cancelled'].map((s) => {
                  const count = 0; // backend currently returns only some metrics — placeholder
                  const pct = stats.totalEvents ? (count / Math.max(1, stats.totalEvents)) * 100 : 0;
                  return (
                    <Box key={s} sx={{ mb: 1 }}>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>{s}</Typography>
                      <Box sx={{ height: 12, bgcolor: 'grey.200', borderRadius: 1 }}>
                        <Box sx={{ width: `${Math.round(pct)}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1 }} />
                      </Box>
                    </Box>
                  );
                })
              ) : (
                <Typography color="text.secondary">No data</Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
