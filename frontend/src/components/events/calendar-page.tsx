import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, CircularProgress, Grid, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import { api, ApiError } from '../../lib/api-client';
import { useNavigate } from 'react-router-dom';

interface PlannerEvent {
  id: number;
  title: string;
  event_date: string;
  location?: string | null;
}

export default function CalendarPage(): JSX.Element {
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month'|'week'|'day'>('month');
  const navigate = useNavigate();

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.get<PlannerEvent[] | { events: PlannerEvent[] }>('/api/events');
      const list: PlannerEvent[] = Array.isArray(data) ? data : (data as any).events ?? [];
      setEvents(list.map((e) => ({ ...e, event_date: e.event_date })));
    } catch (err) {
      console.error('Calendar load failed', err instanceof ApiError ? err.message : err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    // group by date YYYY-MM-DD
    const m = new Map<string, PlannerEvent[]>();
    for (const e of events) {
      const d = new Date(e.event_date).toISOString().slice(0,10);
      const arr = m.get(d) ?? [];
      arr.push(e);
      m.set(d, arr);
    }
    return m;
  }, [events]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Calendar</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Select value={view} size="small" onChange={(e) => setView(e.target.value as any)}>
            <MenuItem value="month">Month</MenuItem>
            <MenuItem value="week">Week</MenuItem>
            <MenuItem value="day">Day</MenuItem>
          </Select>
          <Button variant="outlined" onClick={() => navigate('/events/new')}>Create</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        {Array.from(grouped.entries()).slice(0, 30).map(([date, evs]) => (
          <Grid item xs={12} md={6} lg={4} key={date}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">{new Date(date).toDateString()}</Typography>
                {evs.map((e) => (
                  <Paper key={e.id} sx={{ p: 1, mt: 1, cursor: 'pointer' }} onClick={() => navigate(`/events/${e.id}`)}>
                    <Typography variant="body1">{e.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{e.location ?? ''}</Typography>
                  </Paper>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
