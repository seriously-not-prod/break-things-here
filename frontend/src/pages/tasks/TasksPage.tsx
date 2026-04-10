import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Stack, IconButton, Tooltip, Alert, Avatar,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Assignment as TaskIcon } from '@mui/icons-material';
import { tasksApi, projectsApi, usersApi, type Task, type Project, type UserRow } from '../../services/api';

const STATUS_OPTS = ['todo', 'in_progress', 'done'];
const PRIORITY_OPTS = ['low', 'medium', 'high'];

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'success'> = {
  todo: 'default', in_progress: 'warning', done: 'success',
};
const PRIORITY_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  low: 'info', medium: 'warning', high: 'error',
};

const EMPTY = { title: '', description: '', status: 'todo', priority: 'medium', project_id: undefined as number | undefined, assignee_id: undefined as number | undefined };

export default function TasksPage() {
  const [rows, setRows]         = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers]       = useState<UserRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialog] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState<typeof EMPTY>({ ...EMPTY });
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [t, p, u] = await Promise.all([tasksApi.list(), projectsApi.list(), usersApi.list()]);
    setRows(t);
    setProjects(p);
    setUsers(u);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm({ ...EMPTY }); setEditId(null); setError(''); setDialog(true); };
  const openEdit   = (t: Task) => {
    setForm({ title: t.title, description: t.description ?? '', status: t.status, priority: t.priority, project_id: t.project_id, assignee_id: t.assignee_id });
    setEditId(t.id); setError(''); setDialog(true);
  };
  const closeDialog = () => setDialog(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value || undefined }));

  const handleSave = async () => {
    if (!form.title?.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      if (editId) {
        await tasksApi.update(editId, form);
        setSuccess('Task updated');
      } else {
        await tasksApi.create(form);
        setSuccess('Task created');
      }
      closeDialog();
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    await tasksApi.delete(id).catch(() => {});
    setSuccess('Task deleted');
    load();
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight={700}>Tasks</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2 }}>New Task</Button>
      </Box>

      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>{success}</Alert>}

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <TaskIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary" gutterBottom>No tasks yet</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Create your first task</Button>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Task</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Project</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Assignee</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Priority</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{t.title}</Typography>
                      {t.description && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</Typography>}
                    </TableCell>
                    <TableCell><Typography variant="body2">{t.project_title ?? '—'}</Typography></TableCell>
                    <TableCell>
                      {t.assignee_name ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: 'primary.light' }}>{t.assignee_name[0]}</Avatar>
                          <Typography variant="body2">{t.assignee_name}</Typography>
                        </Box>
                      ) : <Typography variant="body2" color="text.secondary">Unassigned</Typography>}
                    </TableCell>
                    <TableCell>
                      <Chip label={t.priority} size="small" color={PRIORITY_COLORS[t.priority] ?? 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip label={t.status.replace('_', ' ')} size="small" color={STATUS_COLORS[t.status] ?? 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(t)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(t.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle>{editId ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Title" fullWidth value={form.title ?? ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
            <TextField label="Description" fullWidth multiline rows={2} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Status" select fullWidth value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Task['status'] }))}>
                {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
              </TextField>
              <TextField label="Priority" select fullWidth value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Task['priority'] }))}>
                {PRIORITY_OPTS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField label="Project" select fullWidth value={form.project_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value ? Number(e.target.value) : undefined }))}>
              <MenuItem value="">— None —</MenuItem>
              {projects.map((p) => <MenuItem key={p.id} value={p.id}>{p.title}</MenuItem>)}
            </TextField>
            <TextField label="Assign to" select fullWidth value={form.assignee_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value ? Number(e.target.value) : undefined }))}>
              <MenuItem value="">— Unassigned —</MenuItem>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.display_name} ({u.email})</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ borderRadius: 2 }}>
            {saving ? <CircularProgress size={18} color="inherit" /> : (editId ? 'Save Changes' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
