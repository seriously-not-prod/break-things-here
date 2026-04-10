import React from 'react';
import {
  Box, Typography, Paper, List, ListItem, ListItemText,
  Switch, Divider,
} from '@mui/material';

export default function SettingsPage() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Settings</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, maxWidth: 560, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>Notifications</Typography>
        </Box>
        <List disablePadding>
          {[
            ['Email notifications', 'Receive updates about your tasks and projects via email'],
            ['Push notifications', 'Receive browser push notifications'],
            ['Activity digest', 'Weekly summary of team activity'],
          ].map(([label, desc], i, arr) => (
            <React.Fragment key={label}>
              <ListItem sx={{ px: 3 }}>
                <ListItemText primary={label} secondary={desc} />
                <Switch defaultChecked={i === 0} />
              </ListItem>
              {i < arr.length - 1 && <Divider component="li" />}
            </React.Fragment>
          ))}
        </List>

        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>Appearance</Typography>
        </Box>
        <List disablePadding>
          <ListItem sx={{ px: 3 }}>
            <ListItemText primary="Dark mode" secondary="Use dark theme across the app" />
            <Switch />
          </ListItem>
          <Divider component="li" />
          <ListItem sx={{ px: 3 }}>
            <ListItemText primary="Compact layout" secondary="Reduce spacing in tables and lists" />
            <Switch />
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
}
