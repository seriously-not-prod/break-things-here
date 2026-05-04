import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { LockRounded, LockOpenRounded, DeleteRounded, RestoreRounded } from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  email_verified: number;
  account_locked: number;
  role_name: string;
  role_id: number;
  deleted_at: string | null;
  created_at: string;
}

interface Role {
  id: number;
  name: string;
}

export default function AdminPage(): JSX.Element {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [usersData, rolesData] = await Promise.all([
        api.get<{ users: AdminUser[] }>('/api/admin/users'),
        api.get<{ roles: Role[] }>('/api/admin/roles'),
      ]);
      setUsers(usersData.users);
      setRoles(rolesData.roles);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function changeRole(userId: number, roleId: number): Promise<void> {
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/api/admin/users/${userId}/role`, { role_id: roleId });
      setSuccess('Role updated.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change role.');
    }
  }

  async function toggleLock(userId: number, locked: boolean): Promise<void> {
    setError(null);
    setSuccess(null);
    try {
      await api.patch(`/api/admin/users/${userId}/lock`, { locked });
      setSuccess(locked ? 'Account locked.' : 'Account unlocked.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to toggle lock.');
    }
  }

  async function deleteUser(userId: number): Promise<void> {
    if (!window.confirm('Delete this user? This action cannot be undone.')) return;
    setError(null);
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setSuccess('User deleted.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.');
    }
  }

  async function restoreUser(userId: number): Promise<void> {
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/api/admin/users/${userId}/restore`);
      setSuccess('User restored.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to restore user.');
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>User Management</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Name</strong></TableCell>
              <TableCell><strong>Email</strong></TableCell>
              <TableCell><strong>Role</strong></TableCell>
              <TableCell><strong>Verified</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Joined</strong></TableCell>
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const isDeleted = Boolean(u.deleted_at);
              return (
                <TableRow key={u.id} hover sx={{ opacity: isDeleted ? 0.5 : 1 }}>
                  <TableCell>{u.display_name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={u.role_id}
                      disabled={isSelf || isDeleted}
                      onChange={(e) => changeRole(u.id, Number(e.target.value))}
                      sx={{ minWidth: 120 }}
                    >
                      {roles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Chip label={u.email_verified ? 'Yes' : 'No'} size="small" color={u.email_verified ? 'success' : 'warning'} />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={isDeleted ? 'Deleted' : u.account_locked ? 'Locked' : 'Active'}
                      size="small"
                      color={isDeleted ? 'error' : u.account_locked ? 'warning' : 'success'}
                    />
                  </TableCell>
                  <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {!isSelf && !isDeleted && (
                        <>
                          <Button
                            size="small"
                            color={u.account_locked ? 'success' : 'warning'}
                            startIcon={u.account_locked ? <LockOpenRounded /> : <LockRounded />}
                            onClick={() => toggleLock(u.id, !u.account_locked)}
                          >
                            {u.account_locked ? 'Unlock' : 'Lock'}
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<DeleteRounded />}
                            onClick={() => deleteUser(u.id)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                      {!isSelf && isDeleted && (
                        <Button
                          size="small"
                          color="success"
                          startIcon={<RestoreRounded />}
                          onClick={() => restoreUser(u.id)}
                        >
                          Restore
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
