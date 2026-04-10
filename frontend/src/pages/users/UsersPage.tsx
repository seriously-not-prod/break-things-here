import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Avatar,
} from '@mui/material';
import { usersApi, type UserRow } from '../../services/api';

const ROLE_COLORS: Record<string, 'default' | 'primary' | 'success' | 'secondary'> = {
  Admin: 'primary', Organizer: 'secondary', Attendee: 'default',
};

export default function UsersPage() {
  const [rows, setRows]       = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.list().then(setRows).finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Users</Typography>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Verified</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Joined</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 30, height: 30, fontSize: 13, bgcolor: 'primary.main' }}>
                          {u.display_name[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="body2" fontWeight={500}>{u.display_name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant="body2">{u.email}</Typography></TableCell>
                    <TableCell>
                      <Chip label={u.role_name ?? 'Attendee'} size="small" color={ROLE_COLORS[u.role_name] ?? 'default'} />
                    </TableCell>
                    <TableCell>
                      <Chip label={u.email_verified ? 'Verified' : 'Pending'} size="small" color={u.email_verified ? 'success' : 'warning'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(u.created_at).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
