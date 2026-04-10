import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, List, ListItem, ListItemAvatar,
  ListItemText, Avatar, Chip, CircularProgress, Divider,
} from '@mui/material';
import { activityApi, type ActivityLog } from '../../services/api';

const ACTION_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  login: 'info', created: 'primary', updated: 'warning', deleted: 'error', completed: 'success',
};

export default function ActivityPage() {
  const [logs, setLogs]       = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    activityApi.list().then(setLogs).finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Activity Logs</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : logs.length === 0 ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <Typography color="text.secondary">No activity logged yet</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {logs.map((log, i) => (
              <React.Fragment key={log.id}>
                <ListItem sx={{ px: 3, py: 2 }}>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.light', width: 36, height: 36, fontSize: 14 }}>
                      {(log.user_name ?? 'S')[0].toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<Typography variant="body2" fontWeight={500}>{log.description ?? log.action}</Typography>}
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                        <Typography variant="caption" color="text.secondary">
                          {log.user_name ?? 'System'} · {new Date(log.created_at).toLocaleString()}
                        </Typography>
                        {log.entity_type && (
                          <Typography variant="caption" color="text.secondary">
                            · {log.entity_type} #{log.entity_id}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <Chip
                    label={log.action}
                    size="small"
                    color={ACTION_COLORS[log.action] ?? 'default'}
                    variant="outlined"
                  />
                </ListItem>
                {i < logs.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
