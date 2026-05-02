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
import { Cell, Pie, PieChart, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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
  capacity: number | null;
  status: string;
  creator_name: string | null;
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

interface UserOption {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

interface ExpenseCategory {
  id: number;
  name: string;
  description: string | null;
  color: string;
}

interface Budget {
  id: number;
  event_id: number;
  total_budget: number;
  currency: string;
  notes: string | null;
}

interface BudgetSummary {
  total_budget: number;
  total_spent: number;
  remaining: number;
}

interface BudgetBreakdown {
  category: string;
  color: string;
  amount: number;
}

interface Expense {
  id: number;
  event_id: number;
  category_id: number | null;
  title: string;
  amount: number;
  paid_by: string | null;
  receipt_url: string | null;
  status: string;
  notes: string | null;
  category_name: string | null;
  category_color: string | null;
}

const TASK_STATUSES = ['Pending', 'In Progress', 'Blocked', 'Complete', 'Completed'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const RSVP_STATUSES = ['Pending', 'Going', 'Maybe', 'Not Going', 'Declined'];
const RSVP_EXPORT_FORMAT = 'csv';
const API_BASE = import.meta.env.VITE_API_URL ?? '';
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

  // Team dialog state
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('Member');
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  // Budget state
  const [budget, setBudget] = useState<Budget | null>(null);
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [breakdown, setBreakdown] = useState<BudgetBreakdown[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Budget dialog
  const [budgetDialog, setBudgetDialog] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ total_budget: '', currency: 'USD', notes: '' });
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // Expense dialog
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editExpenseId, setEditExpenseId] = useState<number | null>(null);
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', category_id: '', paid_by: '', status: 'Pending', notes: '' });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

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
      const [eventData, budgetData, expensesData, categoriesData] = await Promise.all([
        api.get<{ event: PlannerEvent; tasks: Task[]; rsvps: Rsvp[]; members: EventMember[]; availableUsers: UserOption[] }>(`/api/events/${id}`),
        api.get<{ budget: Budget | null; summary: BudgetSummary | null; breakdown: BudgetBreakdown[] }>(`/api/events/${id}/budget`).catch(() => ({ budget: null, summary: null, breakdown: [] })),
        api.get<{ expenses: Expense[] }>(`/api/events/${id}/expenses`).catch(() => ({ expenses: [] })),
        api.get<{ categories: ExpenseCategory[] }>('/api/expense-categories').catch(() => ({ categories: [] })),
      ]);
      setEvent(eventData.event);
      setTasks(eventData.tasks);
      setRsvps(eventData.rsvps);
      setMembers(eventData.members ?? []);
      setAvailableUsers(eventData.availableUsers ?? []);
      setBudget(budgetData.budget);
      setBudgetSummary(budgetData.summary);
      setBreakdown(budgetData.breakdown ?? []);
      setExpenses(expensesData.expenses ?? []);
      setCategories(categoriesData.categories ?? []);
      const docs = await api.get<EventDocument[]>(`/api/events/${id}/documents`).catch(() => [] as EventDocument[]);
      setDocuments(Array.isArray(docs) ? docs : []);
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
        await api.patch(`/api/events/${id}/tasks/${editTaskId}`, {
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
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/api/events/${id}/rsvps/export?format=${RSVP_EXPORT_FORMAT}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
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

  // ---- Budget ----
  function openBudgetDialog(): void {
    setBudgetForm({
      total_budget: budget ? String(budget.total_budget) : '',
      currency: budget?.currency ?? 'USD',
      notes: budget?.notes ?? '',
    });
    setBudgetError(null);
    setBudgetDialog(true);
  }

  async function saveBudget(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBudgetError(null);
    setBudgetSaving(true);
    try {
      await api.put(`/api/events/${id}/budget`, {
        total_budget: Number(budgetForm.total_budget),
        currency: budgetForm.currency || 'USD',
        notes: budgetForm.notes || null,
      });
      setBudgetDialog(false);
      await load();
    } catch (err) {
      setBudgetError(err instanceof ApiError ? err.message : 'Failed to save budget.');
    } finally {
      setBudgetSaving(false);
    }
  }

  // ---- Expenses ----
  function openAddExpense(): void {
    setEditExpenseId(null);
    setExpenseForm({ title: '', amount: '', category_id: '', paid_by: '', status: 'Pending', notes: '' });
    setExpenseError(null);
    setExpenseDialog(true);
  }

  function openEditExpense(exp: Expense): void {
    setEditExpenseId(exp.id);
    setExpenseForm({
      title: exp.title,
      amount: String(exp.amount),
      category_id: exp.category_id ? String(exp.category_id) : '',
      paid_by: exp.paid_by ?? '',
      status: exp.status,
      notes: exp.notes ?? '',
    });
    setExpenseError(null);
    setExpenseDialog(true);
  }

  async function saveExpense(e: FormEvent): Promise<void> {
    e.preventDefault();
    setExpenseError(null);
    setExpenseSaving(true);
    try {
      const payload = {
        title: expenseForm.title,
        amount: Number(expenseForm.amount),
        category_id: expenseForm.category_id ? Number(expenseForm.category_id) : null,
        paid_by: expenseForm.paid_by || null,
        status: expenseForm.status,
        notes: expenseForm.notes || null,
      };
      if (editExpenseId) {
        await api.patch(`/api/events/${id}/expenses/${editExpenseId}`, payload);
      } else {
        await api.post(`/api/events/${id}/expenses`, payload);
      }
      setExpenseDialog(false);
      await load();
    } catch (err) {
      setExpenseError(err instanceof ApiError ? err.message : 'Failed to save expense.');
    } finally {
      setExpenseSaving(false);
    }
  }

  async function deleteExpense(expenseId: number): Promise<void> {
    if (!window.confirm('Delete this expense?')) return;
    await api.delete(`/api/events/${id}/expenses/${expenseId}`).catch((err) => setError(err.message));
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

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Tasks (${tasks.length})`} />
        <Tab label={`RSVPs (${rsvps.length})`} />
        <Tab label={`Team (${members.length})`} />
        <Tab label={`Documents (${documents.length})`} />
        <Tab label="Budget" />
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

      {/* Budget Tab */}
      {tab === 4 && (
        <>
          {/* Summary card */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
              <Box>
                <Typography variant="h6" fontWeight={700}>Budget Overview</Typography>
                {budget ? (
                  <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Total Budget</Typography>
                      <Typography fontWeight={600}>{budget.currency} {budgetSummary ? budgetSummary.total_budget.toFixed(2) : '0.00'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Total Spent</Typography>
                      <Typography fontWeight={600}>{budget.currency} {budgetSummary ? budgetSummary.total_spent.toFixed(2) : '0.00'}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Remaining</Typography>
                      <Typography fontWeight={600} color={budgetSummary && budgetSummary.remaining < 0 ? 'error.main' : 'success.main'}>
                        {budget.currency} {budgetSummary ? budgetSummary.remaining.toFixed(2) : '0.00'}
                      </Typography>
                    </Box>
                  </Stack>
                ) : (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>No budget set.</Typography>
                )}
              </Box>
              {canEdit && (
                <Button variant="outlined" onClick={openBudgetDialog}>
                  {budget ? 'Edit Budget' : 'Set Budget'}
                </Button>
              )}
            </Stack>
          </Paper>

          {/* Pie chart breakdown — #235 requirement */}
          {breakdown.length > 0 && (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Expense Breakdown by Category</Typography>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={breakdown} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={90} label>
                    {breakdown.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.color ?? '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => (typeof value === 'number' ? `$${value.toFixed(2)}` : value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {/* Expenses table */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>Expenses ({expenses.length})</Typography>
            {canEdit && (
              <Button startIcon={<AddRounded />} variant="contained" size="small" onClick={openAddExpense}>
                Add Expense
              </Button>
            )}
          </Box>

          {expenses.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">No expenses recorded.</Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Title</strong></TableCell>
                    <TableCell><strong>Category</strong></TableCell>
                    <TableCell align="right"><strong>Amount</strong></TableCell>
                    <TableCell><strong>Paid By</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                    {canEdit && <TableCell align="right"><strong>Actions</strong></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id} hover>
                      <TableCell>{exp.title}</TableCell>
                      <TableCell>
                        {exp.category_name ? (
                          <Chip label={exp.category_name} size="small" sx={{ bgcolor: exp.category_color ?? '#6366f1', color: '#fff', fontWeight: 600 }} />
                        ) : (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">${Number(exp.amount).toFixed(2)}</TableCell>
                      <TableCell>{exp.paid_by ?? '—'}</TableCell>
                      <TableCell>
                        <Chip label={exp.status} size="small"
                          color={exp.status === 'Approved' ? 'success' : exp.status === 'Rejected' ? 'error' : 'default'}
                        />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button size="small" startIcon={<EditRounded />} onClick={() => openEditExpense(exp)}>Edit</Button>
                            <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteExpense(exp.id)}>Delete</Button>
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

      {/* Budget Dialog */}
      <Dialog open={budgetDialog} onClose={() => setBudgetDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{budget ? 'Edit Budget' : 'Set Budget'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="budget-form" onSubmit={saveBudget} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {budgetError && <Alert severity="error">{budgetError}</Alert>}
              <TextField
                label="Total Budget"
                type="number"
                value={budgetForm.total_budget}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, total_budget: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
                required
                fullWidth
              />
              <TextField
                label="Currency"
                value={budgetForm.currency}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, currency: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Notes"
                value={budgetForm.notes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBudgetForm((p) => ({ ...p, notes: e.target.value }))}
                multiline
                rows={2}
                fullWidth
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBudgetDialog(false)}>Cancel</Button>
          <Button type="submit" form="budget-form" variant="contained" disabled={budgetSaving}
            startIcon={budgetSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {budgetSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialog} onClose={() => setExpenseDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editExpenseId ? 'Edit Expense' : 'New Expense'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="expense-form" onSubmit={saveExpense} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {expenseError && <Alert severity="error">{expenseError}</Alert>}
              <TextField label="Title" value={expenseForm.title} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, title: e.target.value }))} required fullWidth />
              <TextField
                label="Amount"
                type="number"
                value={expenseForm.amount}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
                required
                fullWidth
              />
              <TextField
                label="Category"
                select
                value={expenseForm.category_id}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, category_id: e.target.value }))}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={String(cat.id)}>{cat.name}</MenuItem>
                ))}
              </TextField>
              <TextField label="Paid By" value={expenseForm.paid_by} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, paid_by: e.target.value }))} fullWidth />
              <TextField
                label="Status"
                select
                value={expenseForm.status}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, status: e.target.value }))}
                fullWidth
              >
                {['Pending', 'Approved', 'Rejected'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
              <TextField label="Notes" value={expenseForm.notes} onChange={(e: ChangeEvent<HTMLInputElement>) => setExpenseForm((p) => ({ ...p, notes: e.target.value }))} multiline rows={2} fullWidth />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseDialog(false)}>Cancel</Button>
          <Button type="submit" form="expense-form" variant="contained" disabled={expenseSaving}
            startIcon={expenseSaving ? <CircularProgress size={16} color="inherit" /> : null}>
            {expenseSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
