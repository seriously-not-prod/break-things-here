import React from 'react';
import {
  Box, Typography, Paper, Avatar, Divider,
  List, ListItem, ListItemText, Chip,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';

const ROLE_MAP: Record<number, string> = { 1: 'Attendee', 2: 'Organizer', 3: 'Admin' };

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Profile</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 4, maxWidth: 560 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 26 }}>
            {user?.display_name?.[0]?.toUpperCase() ?? 'U'}
          </Avatar>
          <Box>
            <Typography variant="h6" fontWeight={700}>{user?.display_name}</Typography>
            <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
            <Chip label={ROLE_MAP[user?.role_id ?? 1] ?? 'Attendee'} size="small" color="primary" sx={{ mt: 0.5 }} />
          </Box>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <List disablePadding>
          <ListItem disableGutters>
            <ListItemText primary="Display Name" secondary={user?.display_name} />
          </ListItem>
          <ListItem disableGutters>
            <ListItemText primary="Email" secondary={user?.email} />
          </ListItem>
          <ListItem disableGutters>
            <ListItemText primary="Role" secondary={ROLE_MAP[user?.role_id ?? 1] ?? 'Attendee'} />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
}
