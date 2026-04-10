import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Stack, IconButton, Tooltip, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  FolderOpen as FolderIcon,
} from '@mui/icons-material';
import { projectsApi, type Project } from '../../services/api';

const STATUS_OPTS = ['active', 'completed', 'on_hold'];
const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning'> = {
  active: 'primary', completed: 'success', on_hold: 'warning',
};

const EMPTY: Partial<Project> = { title: '', description: '', status: 'active' };

export default function ProjectsPage() {
  const [rows, setRows]         = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialog] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [editId, setEditId]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await projectsApi.list().catch(() => []);
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setDialog(true); };
  const openEdit   = (p: Project) => { setForm({ title: p.title, description: p.description, status: p.status }); setEditId(p.id); setError(''); setDialog(true); };
  const closeDialog = () => { setDialog(false); setSaving(false); };

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.title?.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      if (editId) {
        await projectsApi.update(editId, form);
        setSuccess('Project updated');
      } else {
        await projectsApi.create(form);
        setSuccess('Project created');
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
    if (!confirm('Delete this project? All tasks will be removed.')) return;
    await projectsApi.delete(id).catch(() => {});
    setSuccess('Project deleted');
    load();
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight={700}>Projects</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2 }}>
          New Project
        </Button>
      </Box>

      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>{success}</Alert>}

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Box sx={{ p: 8, textAlign: 'center' }}>
            <FolderIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary" gutterBottom>No projects yet</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Create your first project</Button>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Owner</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} hover>
                    <TableCell><Typography variant="body2" fontWeight={500}>{p.title}</Typography></TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description ?? '—'}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{p.owner_name ?? '—'}</Typography></TableCell>
                    <TableCell>
                      <Chip label={p.status.replace('_', ' ')} size="small" color={STATUS_COLORS[p.status] ?? 'default'} />
                    </TableCell>
                    <TableCell><Typography variant="body2" color="text.secondary">{new Date(p.created_at).toLocaleDateString()}</Typography></TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ pb: 1 }}>{editId ? 'Edit Project' : 'New Project'}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Title" fullWidth value={form.title ?? ''} onChange={set('title')} autoFocus />
            <TextField label="Description" fullWidth multiline rows={3} value={form.description ?? ''} onChange={set('description')} />
            <TextField label="Status" select fullWidth value={form.status ?? 'active'} onChange={set('status')}>
              {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{s.replace('_', ' ')}</MenuItem>)}
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
