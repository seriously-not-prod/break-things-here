import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { LockRounded, LockOpenRounded, DeleteRounded, EditRounded, AddRounded } from '@mui/icons-material';
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

interface AdminUserForm {
  id?: number;
  email: string;
  display_name: string;
  password: string;
  role_id: number;
  email_verified: boolean;
  account_locked: boolean;
}

const initialFormState: AdminUserForm = {
  email: '',
  display_name: '',
  password: '',
  role_id: 2,
  email_verified: false,
  account_locked: false,
};

export default function AdminPage(): JSX.Element {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formState, setFormState] = useState<AdminUserForm>(initialFormState);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const availableRoles = useMemo(() => roles, [roles]);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
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

  function openCreate(): void {
    setEditingUser(null);
    setFormState(initialFormState);
    setDialogOpen(true);
    setSuccess(null);
    setError(null);
  }

  function openEdit(user: AdminUser): void {
    setEditingUser(user);
    setFormState({
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      password: '',
      role_id: user.role_id,
      email_verified: Boolean(user.email_verified),
      account_locked: Boolean(user.account_locked),
    });
    setDialogOpen(true);
    setSuccess(null);
    setError(null);
  }

  async function saveUser(): Promise<void> {
    setError(null);
    setSuccess(null);

    if (!formState.email || !formState.display_name || !formState.role_id) {
      setError('Please complete required fields.');
      return;
    }

    try {
      if (editingUser) {
        await api.put(`/api/admin/users/${editingUser.id}`, {
          email: formState.email,
          display_name: formState.display_name,
          password: formState.password || undefined,
          role_id: formState.role_id,
          email_verified: formState.email_verified,
          account_locked: formState.account_locked,
        });
        setSuccess('User updated successfully.');
      } else {
        await api.post('/api/admin/users', {
          email: formState.email,
          password: formState.password,
          display_name: formState.display_name,
          role_id: formState.role_id,
          email_verified: formState.email_verified,
        });
        setSuccess('User created successfully.');
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save user.');
    }
  }

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
    setSuccess(null);
    try {
      await api.delete(`/api/admin/users/${userId}`);
      setSuccess('User deleted.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.');
    }
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>User Management</Typography>
        <Button startIcon={<AddRounded />} variant="contained" onClick={openCreate}>Create user</Button>
      </Stack>

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
                      sx={{ minWidth: 140 }}
                    >
                      {availableRoles.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
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
                      {!isDeleted && (
                        <>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<EditRounded />}
                            onClick={() => openEdit(u)}
                          >
                            Edit
                          </Button>
                          {!isSelf && (
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
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editingUser ? 'Edit user' : 'Create user'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              autoFocus
              label="Full name"
              value={formState.display_name}
              onChange={(e) => setFormState({ ...formState, display_name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Email"
              type="email"
              value={formState.email}
              onChange={(e) => setFormState({ ...formState, email: e.target.value })}
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={formState.password}
              onChange={(e) => setFormState({ ...formState, password: e.target.value })}
              fullWidth
              helperText={editingUser ? 'Leave blank to keep existing password.' : ''}
              required={!editingUser}
            />
            <Select
              label="Role"
              value={formState.role_id}
              onChange={(e) => setFormState({ ...formState, role_id: Number(e.target.value) })}
              fullWidth
              size="small"
            >
              {availableRoles.map((role) => (
                <MenuItem key={role.id} value={role.id}>{role.name}</MenuItem>
              ))}
            </Select>
            <FormControlLabel
              control={
                <Switch
                  checked={formState.email_verified}
                  onChange={(e) => setFormState({ ...formState, email_verified: e.target.checked })}
                />
              }
              label="Email verified"
            />
            {editingUser && (
              <FormControlLabel
                control={
                  <Switch
                    checked={formState.account_locked}
                    onChange={(e) => setFormState({ ...formState, account_locked: e.target.checked })}
                  />
                }
                label="Account locked"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveUser}>{editingUser ? 'Save' : 'Create'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
