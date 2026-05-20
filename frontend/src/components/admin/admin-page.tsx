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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
} from '@mui/material';
import {
  LockRounded,
  LockOpenRounded,
  DeleteRounded,
  RestoreRounded,
  EditRounded,
  PersonAddRounded,
} from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';
import { PageLayout } from '../layout/page-layout';
import { UserFormDialog } from './user-form-dialog';
import { EventAccessPanel } from './event-access-panel';

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
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<'users' | 'access'>('users');

  function openCreate(): void {
    setEditingUser(null);
    setFormOpen(true);
  }

  function openEdit(u: AdminUser): void {
    setEditingUser(u);
    setFormOpen(true);
  }

  async function handleSaved(message: string): Promise<void> {
    setSuccess(message);
    setError(null);
    await load();
  }

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
    <PageLayout
      title="User Management"
      subtitle="Manage user accounts, roles, and access control"
      breadcrumbs={[{ label: 'Admin' }, { label: 'User Management' }]}
      actions={
        tab === 'users' ? (
          <Button
            variant="contained"
            startIcon={<PersonAddRounded />}
            onClick={openCreate}
          >
            Create User
          </Button>
        ) : undefined
      }
    >
      <Tabs
        value={tab}
        onChange={(_, val) => setTab(val as 'users' | 'access')}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="users" label="All Users" />
        <Tab value="access" label="Event Access" />
      </Tabs>

      {tab === 'access' ? (
        <EventAccessPanel />
      ) : (
        <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <TableContainer component={Paper} elevation={1}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Verified</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Joined</TableCell>
              <TableCell align="right">Actions</TableCell>
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
                      {!isDeleted && (
                        <Button
                          size="small"
                          startIcon={<EditRounded />}
                          onClick={() => openEdit(u)}
                        >
                          Edit
                        </Button>
                      )}
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
        </>
      )}

      <UserFormDialog
        open={formOpen}
        user={editingUser}
        roles={roles}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </PageLayout>
  );
}
