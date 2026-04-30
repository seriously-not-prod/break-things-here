import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
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
  Divider,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { AddRounded, ArrowBackRounded, DeleteRounded, EditRounded } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';

interface PlannerEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  status: string;
  creator_name: string | null;
}

interface Task {
  id: number;
  title: string;
  notes: string | null;
  assignee_name: string | null;
  due_date: string | null;
  status: string;
}

interface Rsvp {
  id: number;
  name: string;
  email: string;
  status: string;
  notes: string | null;
  source: string;
}

interface EventDocument {
  id: number;
  event_id: number;
  original_name: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const RSVP_STATUSES = ['Going', 'Maybe', 'Not Going', 'Pending'];
const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function EventDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<PlannerEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [documents, setDocuments] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  // Task dialog
  const [taskDialog, setTaskDialog] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', notes: '', assignee_name: '', due_date: '', status: 'Pending' });
  const [taskSaving, setTaskSaving] = useState(false);

  // RSVP dialog
  const [rsvpDialog, setRsvpDialog] = useState(false);
  const [editRsvpId, setEditRsvpId] = useState<number | null>(null);
  const [rsvpForm, setRsvpForm] = useState({ name: '', email: '', status: 'Pending', notes: '' });
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const canEdit = user && user.roleId >= 2;

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.get<{ event: PlannerEvent; tasks: Task[]; rsvps: Rsvp[]; documents: EventDocument[] }>(`/api/events/${id}`);
      setEvent(data.event);
      setTasks(data.tasks);
      setRsvps(data.rsvps);
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [id]);

  // ---- Tasks ----
  function openAddTask(): void {
    setEditTaskId(null);
    setTaskForm({ title: '', notes: '', assignee_name: '', due_date: '', status: 'Pending' });
    setTaskDialog(true);
  }

  function openEditTask(t: Task): void {
    setEditTaskId(t.id);
    setTaskForm({ title: t.title, notes: t.notes ?? '', assignee_name: t.assignee_name ?? '', due_date: t.due_date ?? '', status: t.status });
    setTaskDialog(true);
  }

  async function saveTask(e: FormEvent): Promise<void> {
    e.preventDefault();
    setTaskSaving(true);
    try {
      if (editTaskId) {
        await api.patch(`/api/events/${id}/tasks/${editTaskId}`, taskForm);
      } else {
        await api.post(`/api/events/${id}/tasks`, taskForm);
      }
      setTaskDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setTaskSaving(false);
    }
  }

  async function deleteTask(taskId: number): Promise<void> {
    if (!window.confirm('Delete this task?')) return;
    await api.delete(`/api/events/${id}/tasks/${taskId}`).catch((err) => setError(err.message));
    await load();
  }

  // ---- RSVPs ----
  function openAddRsvp(): void {
    setEditRsvpId(null);
    setRsvpForm({ name: '', email: '', status: 'Pending', notes: '' });
    setRsvpDialog(true);
  }

  function openEditRsvp(r: Rsvp): void {
    setEditRsvpId(r.id);
    setRsvpForm({ name: r.name, email: r.email, status: r.status, notes: r.notes ?? '' });
    setRsvpDialog(true);
  }

  async function saveRsvp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRsvpSaving(true);
    try {
      if (editRsvpId) {
        await api.patch(`/api/events/${id}/rsvps/${editRsvpId}`, rsvpForm);
      } else {
        await api.post(`/api/events/${id}/rsvps`, rsvpForm);
      }
      setRsvpDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setRsvpSaving(false);
    }
  }

  async function deleteRsvp(rsvpId: number): Promise<void> {
    if (!window.confirm('Delete this RSVP?')) return;
    await api.delete(`/api/events/${id}/rsvps/${rsvpId}`).catch((err) => setError(err.message));
    await load();
  }

  async function uploadDocument(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocumentUploading(true);
    setDocumentError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/api/events/${id}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      await load();
      if (documentInputRef.current) documentInputRef.current.value = '';
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setDocumentUploading(false);
    }
  }

  async function downloadDocument(doc: EventDocument): Promise<void> {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${API_BASE}/api/events/${id}/documents/${doc.id}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = doc.original_name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document download failed.');
    }
  }

  async function deleteDocument(documentId: number): Promise<void> {
    if (!window.confirm('Delete this document?')) return;
    await api.delete(`/api/events/${id}/documents/${documentId}`).catch((err) => setError(err.message));
    await load();
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  if (!event) {
    return <Box sx={{ p: 4 }}><Alert severity="error">{error ?? 'Event not found.'}</Alert></Box>;
  }

  return (
    <Box sx={{ p: 4 }}>
      <Button startIcon={<ArrowBackRounded />} onClick={() => navigate('/events')} sx={{ mb: 2 }}>
        Back to Events
      </Button>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>{event.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(event.event_date).toLocaleDateString()} {event.location ? `· ${event.location}` : ''}
            </Typography>
            {event.description && <Typography variant="body1" sx={{ mt: 1 }}>{event.description}</Typography>}
          </Box>
          <Chip label={event.status} color={event.status === 'Active' ? 'primary' : event.status === 'Completed' ? 'success' : 'default'} />
        </Box>
      </Paper>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Tasks (${tasks.length})`} />
        <Tab label={`RSVPs (${rsvps.length})`} />
        <Tab label={`Documents (${documents.length})`} />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      {/* Tasks Tab */}
      {tab === 0 && (
        <>
          {canEdit && (
            <Button variant="contained" startIcon={<AddRounded />} sx={{ mb: 2 }} onClick={openAddTask}>
              Add Task
            </Button>
          )}
          {tasks.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No tasks yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Title</strong></TableCell>
                    <TableCell><strong>Assignee</strong></TableCell>
                    <TableCell><strong>Due Date</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>{t.title}</TableCell>
                      <TableCell>{t.assignee_name ?? '—'}</TableCell>
                      <TableCell>{t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</TableCell>
                      <TableCell>
                        <Chip label={t.status} size="small" color={t.status === 'Completed' ? 'success' : t.status === 'In Progress' ? 'warning' : 'default'} />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<EditRounded />} onClick={() => openEditTask(t)}>Edit</Button>
                            <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteTask(t.id)}>Delete</Button>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* RSVPs Tab */}
      {tab === 1 && (
        <>
          {canEdit && (
            <Button variant="contained" startIcon={<AddRounded />} sx={{ mb: 2 }} onClick={openAddRsvp}>
              Add RSVP
            </Button>
          )}
          {rsvps.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No RSVPs yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    <TableCell><strong>Source</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rsvps.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>
                        <Chip label={r.status} size="small" color={r.status === 'Going' ? 'success' : r.status === 'Maybe' ? 'warning' : 'default'} />
                      </TableCell>
                      <TableCell><Chip label={r.source} size="small" variant="outlined" /></TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<EditRounded />} onClick={() => openEditRsvp(r)}>Edit</Button>
                            <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteRsvp(r.id)}>Delete</Button>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Documents Tab */}
      {tab === 2 && (
        <>
          {canEdit && (
            <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
              <Button variant="contained" component="label">
                {documentUploading ? 'Uploading…' : 'Upload Document'}
                <input
                  ref={documentInputRef}
                  hidden
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={uploadDocument}
                />
              </Button>
              <Typography variant="caption" color="text.secondary">PDF, JPEG, PNG, WebP · max 5 MB</Typography>
            </Stack>
          )}
          {documentError && <Alert severity="error" sx={{ mb: 2 }}>{documentError}</Alert>}
          {documents.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No documents yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Size</strong></TableCell>
                    <TableCell><strong>Uploaded</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id} hover>
                      <TableCell>{doc.original_name}</TableCell>
                      <TableCell>{doc.mime_type}</TableCell>
                      <TableCell>{Math.ceil(doc.file_size / 1024)} KB</TableCell>
                      <TableCell>{new Date(doc.created_at).toLocaleString()}</TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" onClick={() => downloadDocument(doc)}>Download</Button>
                            <Button size="small" color="error" onClick={() => deleteDocument(doc.id)}>Delete</Button>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Task Dialog */}
      <Dialog open={taskDialog} onClose={() => setTaskDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTaskId ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="task-form" onSubmit={saveTask} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Title" value={taskForm.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required fullWidth />
              <TextField label="Assignee" value={taskForm.assignee_name} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, assignee_name: e.target.value }))} fullWidth />
              <TextField label="Due Date" type="date" value={taskForm.due_date} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, due_date: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Notes" value={taskForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
              <TextField label="Status" select value={taskForm.status} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, status: e.target.value }))} fullWidth>
                {TASK_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialog(false)}>Cancel</Button>
          <Button type="submit" form="task-form" variant="contained" disabled={taskSaving}
            startIcon={taskSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {taskSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* RSVP Dialog */}
      <Dialog open={rsvpDialog} onClose={() => setRsvpDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editRsvpId ? 'Edit RSVP' : 'New RSVP'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="rsvp-form" onSubmit={saveRsvp} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" value={rsvpForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Email" type="email" value={rsvpForm.email} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, email: e.target.value }))} required fullWidth />
              <TextField label="Status" select value={rsvpForm.status} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, status: e.target.value }))} fullWidth>
                {RSVP_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={rsvpForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRsvpDialog(false)}>Cancel</Button>
          <Button type="submit" form="rsvp-form" variant="contained" disabled={rsvpSaving}
            startIcon={rsvpSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {rsvpSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
