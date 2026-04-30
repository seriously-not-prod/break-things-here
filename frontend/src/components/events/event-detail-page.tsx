import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
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

interface Venue {
  id: number;
  event_id: number;
  name: string;
  address: string | null;
  city: string | null;
  capacity: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  notes: string | null;
}

interface Vendor {
  id: number;
  event_id: number;
  name: string;
  category: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  cost: number | null;
  status: string;
  notes: string | null;
}

const TASK_STATUSES = ['Pending', 'In Progress', 'Completed'];
const RSVP_STATUSES = ['Going', 'Maybe', 'Not Going', 'Pending'];
const VENUE_STATUSES = ['Tentative', 'Confirmed', 'Cancelled'];
const VENDOR_STATUSES = ['Pending', 'Confirmed', 'Cancelled'];

export default function EventDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<PlannerEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
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

  // Venue dialog
  const [venueDialog, setVenueDialog] = useState(false);
  const [editVenueId, setEditVenueId] = useState<number | null>(null);
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', capacity: '', contact_name: '', contact_email: '', contact_phone: '', status: 'Tentative', notes: '' });
  const [venueSaving, setVenueSaving] = useState(false);

  // Vendor dialog
  const [vendorDialog, setVendorDialog] = useState(false);
  const [editVendorId, setEditVendorId] = useState<number | null>(null);
  const [vendorForm, setVendorForm] = useState({ name: '', category: '', contact_name: '', contact_email: '', contact_phone: '', cost: '', status: 'Pending', notes: '' });
  const [vendorSaving, setVendorSaving] = useState(false);

  const canEdit = user && user.roleId >= 2;

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [data, venuesData, vendorsData] = await Promise.all([
        api.get<{ event: PlannerEvent; tasks: Task[]; rsvps: Rsvp[] }>(`/api/events/${id}`),
        api.get<{ venues: Venue[] }>(`/api/events/${id}/venues`),
        api.get<{ vendors: Vendor[] }>(`/api/events/${id}/vendors`),
      ]);
      setEvent(data.event);
      setTasks(data.tasks);
      setRsvps(data.rsvps);
      setVenues(venuesData.venues);
      setVendors(vendorsData.vendors);
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

  // ---- Venues ----
  function openAddVenue(): void {
    setEditVenueId(null);
    setVenueForm({ name: '', address: '', city: '', capacity: '', contact_name: '', contact_email: '', contact_phone: '', status: 'Tentative', notes: '' });
    setVenueDialog(true);
  }

  function openEditVenue(v: Venue): void {
    setEditVenueId(v.id);
    setVenueForm({
      name: v.name,
      address: v.address ?? '',
      city: v.city ?? '',
      capacity: v.capacity != null ? String(v.capacity) : '',
      contact_name: v.contact_name ?? '',
      contact_email: v.contact_email ?? '',
      contact_phone: v.contact_phone ?? '',
      status: v.status,
      notes: v.notes ?? '',
    });
    setVenueDialog(true);
  }

  async function saveVenue(e: FormEvent): Promise<void> {
    e.preventDefault();
    setVenueSaving(true);
    const payload = {
      ...venueForm,
      capacity: venueForm.capacity ? Number(venueForm.capacity) : undefined,
    };
    try {
      if (editVenueId) {
        await api.patch(`/api/events/${id}/venues/${editVenueId}`, payload);
      } else {
        await api.post(`/api/events/${id}/venues`, payload);
      }
      setVenueDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setVenueSaving(false);
    }
  }

  async function deleteVenue(venueId: number): Promise<void> {
    if (!window.confirm('Delete this venue?')) return;
    await api.delete(`/api/events/${id}/venues/${venueId}`).catch((err) => setError(err.message));
    await load();
  }

  // ---- Vendors ----
  function openAddVendor(): void {
    setEditVendorId(null);
    setVendorForm({ name: '', category: '', contact_name: '', contact_email: '', contact_phone: '', cost: '', status: 'Pending', notes: '' });
    setVendorDialog(true);
  }

  function openEditVendor(v: Vendor): void {
    setEditVendorId(v.id);
    setVendorForm({
      name: v.name,
      category: v.category ?? '',
      contact_name: v.contact_name ?? '',
      contact_email: v.contact_email ?? '',
      contact_phone: v.contact_phone ?? '',
      cost: v.cost != null ? String(v.cost) : '',
      status: v.status,
      notes: v.notes ?? '',
    });
    setVendorDialog(true);
  }

  async function saveVendor(e: FormEvent): Promise<void> {
    e.preventDefault();
    setVendorSaving(true);
    const payload = {
      ...vendorForm,
      cost: vendorForm.cost ? Number(vendorForm.cost) : undefined,
    };
    try {
      if (editVendorId) {
        await api.patch(`/api/events/${id}/vendors/${editVendorId}`, payload);
      } else {
        await api.post(`/api/events/${id}/vendors`, payload);
      }
      setVendorDialog(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setVendorSaving(false);
    }
  }

  async function deleteVendor(vendorId: number): Promise<void> {
    if (!window.confirm('Delete this vendor?')) return;
    await api.delete(`/api/events/${id}/vendors/${vendorId}`).catch((err) => setError(err.message));
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
        <Tab label={`Venues (${venues.length})`} />
        <Tab label={`Vendors (${vendors.length})`} />
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

      {/* Venues Tab */}
      {tab === 2 && (
        <>
          {canEdit && (
            <Button variant="contained" startIcon={<AddRounded />} sx={{ mb: 2 }} onClick={openAddVenue}>
              Add Venue
            </Button>
          )}
          {venues.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No venues yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>City</strong></TableCell>
                    <TableCell><strong>Capacity</strong></TableCell>
                    <TableCell><strong>Contact</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {venues.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.city ?? '—'}</TableCell>
                      <TableCell>{v.capacity != null ? v.capacity.toLocaleString() : '—'}</TableCell>
                      <TableCell>{v.contact_name ?? '—'}</TableCell>
                      <TableCell>
                        <Chip label={v.status} size="small" color={v.status === 'Confirmed' ? 'success' : v.status === 'Cancelled' ? 'error' : 'default'} />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<EditRounded />} onClick={() => openEditVenue(v)}>Edit</Button>
                            <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteVenue(v.id)}>Delete</Button>
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

      {/* Vendors Tab */}
      {tab === 3 && (
        <>
          {canEdit && (
            <Button variant="contained" startIcon={<AddRounded />} sx={{ mb: 2 }} onClick={openAddVendor}>
              Add Vendor
            </Button>
          )}
          {vendors.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}><Typography color="text.secondary">No vendors yet.</Typography></Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Category</strong></TableCell>
                    <TableCell><strong>Contact</strong></TableCell>
                    <TableCell><strong>Cost</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.category ?? '—'}</TableCell>
                      <TableCell>{v.contact_name ?? '—'}</TableCell>
                      <TableCell>{v.cost != null ? `$${v.cost.toLocaleString()}` : '—'}</TableCell>
                      <TableCell>
                        <Chip label={v.status} size="small" color={v.status === 'Confirmed' ? 'success' : v.status === 'Cancelled' ? 'error' : 'default'} />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<EditRounded />} onClick={() => openEditVendor(v)}>Edit</Button>
                            <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteVendor(v.id)}>Delete</Button>
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

      {/* Venue Dialog */}
      <Dialog open={venueDialog} onClose={() => setVenueDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editVenueId ? 'Edit Venue' : 'New Venue'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="venue-form" onSubmit={saveVenue} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" value={venueForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Address" value={venueForm.address} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, address: e.target.value }))} fullWidth />
              <TextField label="City" value={venueForm.city} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, city: e.target.value }))} fullWidth />
              <TextField label="Capacity" type="number" value={venueForm.capacity} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, capacity: e.target.value }))} fullWidth inputProps={{ min: 0 }} />
              <TextField label="Contact Name" value={venueForm.contact_name} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, contact_name: e.target.value }))} fullWidth />
              <TextField label="Contact Email" type="email" value={venueForm.contact_email} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, contact_email: e.target.value }))} fullWidth />
              <TextField label="Contact Phone" value={venueForm.contact_phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, contact_phone: e.target.value }))} fullWidth />
              <TextField label="Status" select value={venueForm.status} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, status: e.target.value }))} fullWidth>
                {VENUE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={venueForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setVenueForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVenueDialog(false)}>Cancel</Button>
          <Button type="submit" form="venue-form" variant="contained" disabled={venueSaving}
            startIcon={venueSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {venueSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Vendor Dialog */}
      <Dialog open={vendorDialog} onClose={() => setVendorDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editVendorId ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="vendor-form" onSubmit={saveVendor} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Name" value={vendorForm.name} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, name: e.target.value }))} required fullWidth />
              <TextField label="Category" value={vendorForm.category} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, category: e.target.value }))} fullWidth />
              <TextField label="Contact Name" value={vendorForm.contact_name} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, contact_name: e.target.value }))} fullWidth />
              <TextField label="Contact Email" type="email" value={vendorForm.contact_email} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, contact_email: e.target.value }))} fullWidth />
              <TextField label="Contact Phone" value={vendorForm.contact_phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, contact_phone: e.target.value }))} fullWidth />
              <TextField label="Cost ($)" type="number" value={vendorForm.cost} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, cost: e.target.value }))} fullWidth inputProps={{ min: 0, step: '0.01' }} />
              <TextField label="Status" select value={vendorForm.status} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, status: e.target.value }))} fullWidth>
                {VENDOR_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={vendorForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setVendorForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVendorDialog(false)}>Cancel</Button>
          <Button type="submit" form="vendor-form" variant="contained" disabled={vendorSaving}
            startIcon={vendorSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {vendorSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
