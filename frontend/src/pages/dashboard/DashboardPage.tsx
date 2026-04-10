import React, { useEffect, useState } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Skeleton,
  Paper, Chip, Avatar, List, ListItem, ListItemAvatar,
  ListItemText, Button, Stack, Divider,
} from '@mui/material';
import {
  People as PeopleIcon,
  FolderOpen as FolderIcon,
  Assignment as TaskIcon,
  CheckCircle as CheckIcon,
  Add as AddIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  dashboardApi,
  projectsApi,
  tasksApi,
  activityApi,
  type DashboardStats,
  type Project,
  type Task,
  type ActivityLog,
} from '../../services/api';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

function StatCard({ title, value, icon, color, loading }: StatCardProps) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>{title}</Typography>
            {loading
              ? <Skeleton width={60} height={40} />
              : <Typography variant="h4" fontWeight={700}>{value}</Typography>
            }
          </Box>
          <Avatar sx={{ bgcolor: color, width: 48, height: 48 }}>{icon}</Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  active: 'primary', completed: 'success', on_hold: 'warning',
  todo: 'default', in_progress: 'warning', done: 'success',
};

const PRIORITY_COLORS: Record<string, 'default' | 'error' | 'warning' | 'info'> = {
  high: 'error', medium: 'warning', low: 'info',
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks]       = useState<Task[]>([]);
  const [logs, setLogs]         = useState<ActivityLog[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      dashboardApi.stats(),
      projectsApi.list(),
      tasksApi.list(),
      activityApi.list(),
    ]).then(([s, p, t, a]) => {
      setStats(s);
      setProjects(p.slice(0, 5));
      setTasks(t.slice(0, 6));
      setLogs(a.slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight={700}>Dashboard</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => navigate('/projects')}>
            New Project
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => navigate('/tasks')}>
            New Task
          </Button>
        </Stack>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Total Users',      value: stats?.totalUsers ?? 0,      icon: <PeopleIcon />, color: '#3b82f6' },
          { title: 'Total Projects',   value: stats?.totalProjects ?? 0,   icon: <FolderIcon />, color: '#8b5cf6' },
          { title: 'Total Tasks',      value: stats?.totalTasks ?? 0,      icon: <TaskIcon />,   color: '#f59e0b' },
          { title: 'Completed Tasks',  value: stats?.completedTasks ?? 0,  icon: <CheckIcon />,  color: '#10b981' },
        ].map((c) => (
          <Grid item xs={12} sm={6} lg={3} key={c.title}>
            <StatCard {...c} loading={loading} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {/* Recent Projects */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" fontWeight={600}>Recent Projects</Typography>
              <Button size="small" onClick={() => navigate('/projects')}>View all</Button>
            </Box>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} sx={{ mx: 2, my: 1 }} height={40} />)
            ) : projects.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <FolderIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No projects yet</Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {projects.map((p, i) => (
                  <React.Fragment key={p.id}>
                    <ListItem
                      sx={{ px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                      onClick={() => navigate('/projects')}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.light', width: 36, height: 36, fontSize: 14 }}>
                          {p.title[0].toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={500}>{p.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{p.owner_name} · {formatDate(p.created_at)}</Typography>}
                      />
                      <Chip label={p.status} size="small" color={STATUS_COLORS[p.status] ?? 'default'} variant="outlined" />
                    </ListItem>
                    {i < projects.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Recent Tasks */}
        <Grid item xs={12} md={6}>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" fontWeight={600}>Recent Tasks</Typography>
              <Button size="small" onClick={() => navigate('/tasks')}>View all</Button>
            </Box>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} sx={{ mx: 2, my: 1 }} height={40} />)
            ) : tasks.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <TaskIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No tasks yet</Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {tasks.map((t, i) => (
                  <React.Fragment key={t.id}>
                    <ListItem sx={{ px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => navigate('/tasks')}>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={500}>{t.title}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{t.project_title} · {t.assignee_name ?? 'Unassigned'}</Typography>}
                      />
                      <Stack direction="row" spacing={0.5}>
                        <Chip label={t.priority} size="small" color={PRIORITY_COLORS[t.priority] ?? 'default'} variant="outlined" />
                        <Chip label={t.status.replace('_', ' ')} size="small" color={STATUS_COLORS[t.status] ?? 'default'} />
                      </Stack>
                    </ListItem>
                    {i < tasks.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        {/* Activity Feed */}
        <Grid item xs={12}>
          <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimelineIcon fontSize="small" color="action" />
              <Typography variant="subtitle1" fontWeight={600}>Recent Activity</Typography>
            </Box>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} sx={{ mx: 2, my: 1 }} height={36} />)
            ) : logs.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No activity yet</Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {logs.map((log, i) => (
                  <React.Fragment key={log.id}>
                    <ListItem sx={{ px: 2, py: 1 }}>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 30, height: 30, bgcolor: 'secondary.light', fontSize: 12 }}>
                          {(log.user_name ?? 'S')[0].toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={<Typography variant="body2">{log.description}</Typography>}
                        secondary={<Typography variant="caption" color="text.secondary">{log.user_name ?? 'System'} · {formatDate(log.created_at)}</Typography>}
                      />
                      <Chip label={log.action} size="small" variant="outlined" />
                    </ListItem>
                    {i < logs.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
