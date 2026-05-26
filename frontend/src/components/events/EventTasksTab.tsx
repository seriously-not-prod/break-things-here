import { ChangeEvent, FormEvent, useState } from 'react';
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
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { AddRounded, DeleteRounded, EditRounded, ViewKanbanRounded } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';

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

interface UserOption {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

interface EventTasksTabProps {
  eventId: string;
  tasks: Task[];
  availableUsers: UserOption[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

const TASK_STATUSES = ['Pending', 'In Progress', 'Blocked', 'Complete', 'Completed'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

export function EventTasksTab({
  eventId,
  tasks,
  availableUsers,
  canEdit,
  onRefresh,
}: EventTasksTabProps): JSX.Element {
  const navigate = useNavigate();
  const [taskDialog, setTaskDialog] = useState(false);
  const [editTaskId, setEditTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    notes: '',
    assigned_user_id: '',
    due_date: '',
    status: 'Pending',
    priority: 'Medium',
  });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  function openAddTask(): void {
    setEditTaskId(null);
    setTaskForm({
      title: '',
      notes: '',
      assigned_user_id: '',
      due_date: '',
      status: 'Pending',
      priority: 'Medium',
    });
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
        await api.put(`/api/events/${eventId}/tasks/${editTaskId}`, {
          ...taskForm,
          assigned_user_id: assignedUserId,
        });
      } else {
        await api.post(`/api/events/${eventId}/tasks`, {
          ...taskForm,
          assigned_user_id: assignedUserId,
        });
      }
      setTaskDialog(false);
      await onRefresh();
    } catch (err) {
      setTaskError(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setTaskSaving(false);
    }
  }

  async function deleteTask(taskId: number): Promise<void> {
    if (!window.confirm('Delete this task?')) return;
    await api.delete(`/api/events/${eventId}/tasks/${taskId}`).catch(() => undefined);
    await onRefresh();
  }

  return (
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
          onClick={() => navigate(`/events/${eventId}/tasks`)}
        >
          Kanban Board
        </Button>
      </Stack>
      {tasks.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">No tasks yet.</Typography>
        </Paper>
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
                  <TableCell>
                    {t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip label={t.priority ?? 'Medium'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={t.status}
                      size="small"
                      color={
                        t.status === 'Complete' || t.status === 'Completed'
                          ? 'success'
                          : t.status === 'In Progress'
                            ? 'warning'
                            : t.status === 'Blocked'
                              ? 'error'
                              : 'default'
                      }
                    />
                  </TableCell>
                  {canEdit && (
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" startIcon={<EditRounded />} onClick={() => openEditTask(t)}>
                          Edit
                        </Button>
                        <Button size="small" color="error" startIcon={<DeleteRounded />} onClick={() => deleteTask(t.id)}>
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Task Dialog */}
      <Dialog open={taskDialog} onClose={() => setTaskDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTaskId ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          <Box component="form" id="task-form" onSubmit={saveTask} noValidate>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {taskError && <Alert severity="error">{taskError}</Alert>}
              <TextField
                label="Title"
                value={taskForm.title}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, title: e.target.value }))
                }
                required
                fullWidth
              />
              <TextField
                label="Assignee"
                select
                value={taskForm.assigned_user_id}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, assigned_user_id: e.target.value }))
                }
                fullWidth
              >
                <MenuItem value="">Unassigned</MenuItem>
                {availableUsers.map((option) => (
                  <MenuItem key={option.user_id} value={option.user_id}>
                    {option.display_name} ({option.email})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Due Date"
                type="date"
                value={taskForm.due_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, due_date: e.target.value }))
                }
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Priority"
                select
                value={taskForm.priority}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, priority: e.target.value }))
                }
                fullWidth
              >
                {TASK_PRIORITIES.map((priority) => (
                  <MenuItem key={priority} value={priority}>
                    <Chip
                      label={priority}
                      size="small"
                      color={
                        priority === 'Low' ? 'success' : priority === 'Medium' ? 'warning' : 'error'
                      }
                      sx={
                        priority === 'Urgent'
                          ? { mr: 1, bgcolor: 'error.dark', color: 'common.white', fontWeight: 700 }
                          : { mr: 1 }
                      }
                    />
                    {priority}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Notes"
                value={taskForm.notes}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, notes: e.target.value }))
                }
                multiline
                rows={2}
                fullWidth
              />
              <TextField
                label="Status"
                select
                value={taskForm.status}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setTaskForm((p) => ({ ...p, status: e.target.value }))
                }
                fullWidth
              >
                {TASK_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialog(false)}>Cancel</Button>
          <Button
            type="submit"
            form="task-form"
            variant="contained"
            disabled={taskSaving}
            startIcon={taskSaving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {taskSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
