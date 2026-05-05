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
import { AddRounded, ArrowBackRounded, AttachMoneyRounded, CameraAltRounded, DeleteRounded, EditRounded, ViewKanbanRounded } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiFetch, ApiError, getAuthHeaders } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';
import { ActivityFeedPanel } from './activity-feed-panel';

interface PlannerEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  event_date?: string;
  capacity: number | null;
  status: string;
  creator_name: string | null;
  cover_image_url?: string | null;
  event_type?: string | null;
}

interface Task {
  id: number;
  title: string;
  notes: string | null;
  assignee_name: string | null;
  assigned_user_id: number | null;
  due_date: string | null;
  status: string;
  priority: string;
}

interface Rsvp {
  id: number;
  name: string;
  email: string;
  guests: number;
  status: string;
  notes: string | null;
  source: string;
}

interface EventMember {
  user_id: number;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
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

interface EventDocumentsResponse {
  documents?: EventDocument[];
}

interface UserOption {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

const TASK_STATUSES = ['Pending', 'In Progress', 'Blocked', 'Complete', 'Completed'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];
const RSVP_EXPORT_FORMAT = 'csv';
const API_BASE = import.meta.env.VITE_API_URL ?? '';

function normalizePlannerEvent(event: PlannerEvent): PlannerEvent {
  const eventDate = event.date ?? event.event_date ?? '';
  return {
    ...event,
    date: eventDate,
    event_date: eventDate,
  };
}

export default function EventDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<PlannerEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [documents, setDocuments] = useState<EventDocument[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  // Task dialog
  const [taskDialog, setTaskDialog] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', notes: '', assigned_user_id: '', due_date: '', status: 'Pending', priority: 'Medium' });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // RSVP dialog
  const [rsvpDialog, setRsvpDialog] = useState(false);
  const [editRsvpId, setEditRsvpId] = useState<number | null>(null);
  const [rsvpForm, setRsvpForm] = useState({ name: '', email: '', guests: '1', status: 'Pending', notes: '' });
  const [rsvpSaving, setRsvpSaving] = useState(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Cover image upload state
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Team dialog state
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('Member');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const canEdit = user && user.roleId >= 2;
  const remainingCapacity = event?.capacity === null || event?.capacity === undefined
    ? null
    : Math.max(
      event.capacity - rsvps.reduce((sum, rsvp) => sum + (rsvp.status === 'Going' ? Number(rsvp.guests || 1) : 0), 0),
      0,
    );

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.get<{ event: PlannerEvent; tasks: Task[]; rsvps: Rsvp[]; members: EventMember[]; availableUsers: UserOption[] }>(`/api/events/${id}`);
      setEvent(normalizePlannerEvent(data.event));
      setTasks(data.tasks);
      setRsvps(data.rsvps);
      setMembers(data.members ?? []);
      setAvailableUsers(data.availableUsers ?? []);
      const docs = await api.get<EventDocumentsResponse | EventDocument[]>(`/api/events/${id}/documents`);
      setDocuments(Array.isArray(docs) ? docs : docs.documents ?? []);
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
    setTaskForm({ title: '', notes: '', assigned_user_id: '', due_date: '', status: 'Pending', priority: 'Medium' });
    setTaskError(null);
    setTaskDialog(true);
  }

  function openEditTask(t: Task): void {
    setEditTaskId(t.id);
    setTaskForm({
      title: t.title,
      notes: t.notes ?? '',
      assigned_user_id: t.assigned_user_id ? String(t.assigned_user_id) : '',
      due_date: t.due_date ?? '',
      status: t.status,
      priority: t.priority ?? 'Medium',
    });
    setTaskError(null);
    setTaskDialog(true);
  }

  async function saveTask(e: FormEvent): Promise<void> {
    e.preventDefault();
    setTaskError(null);
    setTaskSaving(true);
    try {
      const assignedUserId = taskForm.assigned_user_id ? Number(taskForm.assigned_user_id) : null;
      if (editTaskId) {
        await api.put(`/api/events/${id}/tasks/${editTaskId}`, {
          ...taskForm,
          assigned_user_id: assignedUserId,
        });
      } else {
        await api.post(`/api/events/${id}/tasks`, {
          ...taskForm,
          assigned_user_id: assignedUserId,
        });
      }
      setTaskDialog(false);
      await load();
    } catch (err) {
      setTaskError(err instanceof ApiError ? err.message : 'Save failed.');
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
    setRsvpForm({ name: '', email: '', guests: '1', status: 'Pending', notes: '' });
    setRsvpError(null);
    setRsvpDialog(true);
  }

  function openEditRsvp(r: Rsvp): void {
    setEditRsvpId(r.id);
    setRsvpForm({ name: r.name, email: r.email, guests: String(r.guests ?? 1), status: r.status, notes: r.notes ?? '' });
    setRsvpError(null);
    setRsvpDialog(true);
  }

  async function saveRsvp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setRsvpError(null);
    setRsvpSaving(true);
    try {
      const guests = Number(rsvpForm.guests || 1);
      if (editRsvpId) {
        await api.patch(`/api/events/${id}/rsvps/${editRsvpId}`, { ...rsvpForm, guests });
      } else {
        await api.post(`/api/events/${id}/rsvps`, { ...rsvpForm, guests });
      }
      setRsvpDialog(false);
      await load();
    } catch (err) {
      setRsvpError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setRsvpSaving(false);
    }
  }

  async function deleteRsvp(rsvpId: number): Promise<void> {
    if (!window.confirm('Delete this RSVP?')) return;
    await api.delete(`/api/events/${id}/rsvps/${rsvpId}`).catch((err) => setError(err.message));
    await load();
  }

  async function exportRsvpsCsv(): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/api/events/${id}/rsvps/export?format=${RSVP_EXPORT_FORMAT}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(body.error ?? response.statusText);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = objectUrl;
      link.download = `event-${id}-rsvps.csv`;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.');
    }
  }

  async function addMember(): Promise<void> {
    if (!memberUserId) {
      setMemberError('Please choose a user to add.');
      return;
    }
    setMemberSaving(true);
    setMemberError(null);
    try {
      await api.post(`/api/events/${id}/members`, { user_id: Number(memberUserId), role: memberRole });
      setMemberUserId('');
      setMemberRole('Member');
      await load();
    } catch (err) {
      setMemberError(err instanceof ApiError ? err.message : 'Failed to add member.');
    } finally {
      setMemberSaving(false);
    }
  }

  async function removeMember(userId: number): Promise<void> {
    if (!window.confirm('Remove this team member?')) return;
    await api.delete(`/api/events/${id}/members/${userId}`).catch((err) => setError(err.message));
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
      const res = await apiFetch(`/api/events/${id}/documents`, {
        method: 'POST',
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
      const res = await fetch(`${API_BASE}/api/events/${id}/documents/${doc.id}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
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

  async function uploadCoverImage(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      // Step 1: upload the file via the existing documents endpoint
      const formData = new FormData();
      formData.append('document', file);
      const uploadRes = await apiFetch(`/api/events/${id}/documents`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({ error: uploadRes.statusText })) as { error?: string };
        throw new Error(body.error ?? uploadRes.statusText);
      }
      const uploadData = await uploadRes.json() as { document?: { file_name?: string } };
      const fileName: string = uploadData.document?.file_name ?? '';
      if (!fileName) throw new Error('Upload did not return a file name.');

      // Step 2: set the cover_image_url reference on the event
      const coverUrl = `/api/uploads/event-documents/${fileName}`;
      await api.patch(`/api/events/${id}/cover`, { cover_image_url: coverUrl });
      await load();
      if (coverInputRef.current) coverInputRef.current.value = '';
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Cover image upload failed.');
    } finally {
      setCoverUploading(false);
    }
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
        {/* Cover image banner */}
        {event.cover_image_url && (
          <Box
            sx={{
              width: '100%',
              height: 220,
              overflow: 'hidden',
              mb: 2,
              borderRadius: 1,
              position: 'relative',
            }}
          >
            <Box
              component="img"
              src={event.cover_image_url}
              alt="Event cover"
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {canEdit && (
              <Box
                component="label"
                aria-label="Change cover image"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  borderRadius: '50%',
                  p: 0.75,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                {coverUploading ? <CircularProgress size={20} color="inherit" /> : <CameraAltRounded fontSize="small" />}
                <input hidden type="file" accept="image/jpeg,image/png,image/webp" ref={coverInputRef} onChange={uploadCoverImage} />
              </Box>
            )}
          </Box>
        )}
        {!event.cover_image_url && canEdit && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button
              component="label"
              size="small"
              startIcon={coverUploading ? <CircularProgress size={14} color="inherit" /> : <CameraAltRounded />}
              variant="outlined"
              disabled={coverUploading}
            >
              {coverUploading ? 'Uploading…' : 'Set Cover Image'}
              <input hidden type="file" accept="image/jpeg,image/png,image/webp" ref={coverInputRef} onChange={uploadCoverImage} />
            </Button>
            {coverError && <Typography variant="caption" color="error">{coverError}</Typography>}
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>{event.title}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
              {event.event_type && (
                <Chip label={event.event_type} size="small" color="info" variant="outlined" />
              )}
              <Typography variant="body2" color="text.secondary">
                {new Date(event.date).toLocaleDateString()} {event.location ? `· ${event.location}` : ''}
              </Typography>
            </Stack>
            {event.capacity !== null && event.capacity !== undefined && (
              <Typography variant="body2" color="text.secondary">
                Capacity: {event.capacity} {remainingCapacity !== null ? `· Remaining: ${remainingCapacity}` : ''}
              </Typography>
            )}
            {event.description && <Typography variant="body1" sx={{ mt: 1 }}>{event.description}</Typography>}
          </Box>
          <Chip label={event.status} color={event.status === 'Active' ? 'primary' : event.status === 'Completed' ? 'success' : 'default'} />
        </Box>
      </Paper>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AttachMoneyRounded />}
          onClick={() => navigate(`/events/${id}/budget`)}
        >
          Manage Budget
        </Button>
      </Stack>

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Tasks (${tasks.length})`} />
        <Tab label={`RSVPs (${rsvps.length})`} />
        <Tab label={`Team (${members.length})`} />
        <Tab label={`Documents (${documents.length})`} />
        <Tab label="Activity" />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      {/* Tasks Tab */}
      {tab === 0 && (
        <>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            {canEdit && (
              <Button variant="contained" startIcon={<AddRounded />} onClick={openAddTask}>
                Add Task
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<ViewKanbanRounded />}
              onClick={() => navigate(`/events/${id}/tasks`)}
            >
              Kanban Board
            </Button>
          </Stack>
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
                    <TableCell><strong>Priority</strong></TableCell>
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
                      <TableCell><Chip label={t.priority ?? 'Medium'} size="small" variant="outlined" /></TableCell>
                      <TableCell>
                        <Chip label={t.status} size="small" color={t.status === 'Complete' || t.status === 'Completed' ? 'success' : t.status === 'In Progress' ? 'warning' : t.status === 'Blocked' ? 'error' : 'default'} />
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
          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
            {canEdit && (
              <Button variant="contained" startIcon={<AddRounded />} onClick={openAddRsvp}>
                Add RSVP
              </Button>
            )}
            {canEdit && (
              <Button variant="outlined" onClick={exportRsvpsCsv}>
                Export CSV
              </Button>
            )}
            {event.capacity !== null && event.capacity !== undefined && (
              <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                Remaining capacity: {remainingCapacity === null ? 'n/a' : remainingCapacity}
              </Typography>
            )}
          </Stack>
          {rsvpError && <Alert severity="error" sx={{ mb: 2 }}>{rsvpError}</Alert>}
          {rsvps.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No RSVPs yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Guests</strong></TableCell>
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
                      <TableCell>{r.guests ?? 1}</TableCell>
                      <TableCell>
                        <Chip label={r.status} size="small" color={r.status === 'Going' ? 'success' : r.status === 'Maybe' ? 'warning' : r.status === 'Declined' || r.status === 'Not Going' ? 'default' : 'default'} />
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

      {/* Team Tab */}
      {tab === 2 && (
        <>
          {canEdit && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
                <TextField
                  label="Invite User"
                  select
                  value={memberUserId}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMemberUserId(e.target.value)}
                  fullWidth
                >
                  {availableUsers
                    .filter((option) => !members.some((member) => member.user_id === option.user_id))
                    .map((option) => (
                      <MenuItem key={option.user_id} value={option.user_id}>
                        {option.display_name} ({option.email})
                      </MenuItem>
                    ))}
                </TextField>
                <TextField
                  label="Role"
                  value={memberRole}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMemberRole(e.target.value)}
                  fullWidth
                />
                <Button variant="contained" onClick={addMember} disabled={memberSaving}>
                  {memberSaving ? 'Adding…' : 'Invite'}
                </Button>
              </Stack>
              {memberError && <Alert severity="error" sx={{ mt: 2 }}>{memberError}</Alert>}
            </Paper>
          )}
          {members.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No team members yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    <TableCell><strong>Role</strong></TableCell>
                    <TableCell><strong>Joined</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.user_id} hover>
                      <TableCell>{member.display_name}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>{member.role}</TableCell>
                      <TableCell>{new Date(member.joined_at).toLocaleString()}</TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Button size="small" color="error" onClick={() => removeMember(member.user_id)}>
                            Remove
                          </Button>
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
      {tab === 3 && (
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

      {/* Activity Tab */}
      {tab === 4 && (
        <ActivityFeedPanel eventId={id ?? ''} />
      )}

      {/* Task Dialog */}
      <Dialog open={taskDialog} onClose={() => setTaskDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTaskId ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="task-form" onSubmit={saveTask} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {taskError && <Alert severity="error">{taskError}</Alert>}
              <TextField label="Title" value={taskForm.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, title: e.target.value }))} required fullWidth />
              <TextField
                label="Assignee"
                select
                value={taskForm.assigned_user_id}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, assigned_user_id: e.target.value }))}
                fullWidth
              >
                <MenuItem value="">Unassigned</MenuItem>
                {availableUsers.map((option) => (
                  <MenuItem key={option.user_id} value={option.user_id}>
                    {option.display_name} ({option.email})
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Due Date" type="date" value={taskForm.due_date} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, due_date: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Priority" select value={taskForm.priority} onChange={(e: ChangeEvent<HTMLInputElement>) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} fullWidth>
                {TASK_PRIORITIES.map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
              </TextField>
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
              {rsvpError && <Alert severity="error">{rsvpError}</Alert>}
              <TextField label="Name" value={rsvpForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Email" type="email" value={rsvpForm.email} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, email: e.target.value }))} required fullWidth />
              <TextField label="Guest Count" type="number" value={rsvpForm.guests} onChange={(e: ChangeEvent<HTMLInputElement>) => setRsvpForm((p) => ({ ...p, guests: e.target.value }))} inputProps={{ min: 1 }} fullWidth />
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
