import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { SelectChangeEvent } from '@mui/material';
import {
  type Task,
  type TaskComment,
  type TaskPriority,
  type TaskStatus,
  type TaskSubtask,
  addComment,
  addSubtask,
  deleteSubtask,
  deleteTask,
  listComments,
  toggleSubtask,
  updateTask,
} from '../../services/tasks-service';

const STATUSES: TaskStatus[] = ['Pending', 'In Progress', 'Blocked', 'Complete'];
const PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High'];

const PRIORITY_COLORS: Record<TaskPriority, 'success' | 'warning' | 'error'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'error',
};

interface TaskDetailDrawerProps {
  open: boolean;
  task: Task | null;
  eventId: number | string;
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
  onTaskDeleted: (taskId: number) => void;
  /** #807 — Lets the parent open the version-history rollback drawer. */
  onOpenHistory?: (task: Task) => void;
}

export function TaskDetailDrawer({
  open,
  task,
  eventId,
  onClose,
  onTaskUpdated,
  onTaskDeleted,
  onOpenHistory,
}: TaskDetailDrawerProps): JSX.Element {
  const [editing, setEditing] = useState<Partial<Task>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  // Reset state when the drawer opens with a new task
  useEffect(() => {
    if (!task) return;
    setEditing({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? '',
      estimated_hours: task.estimated_hours,
      assignee_name: task.assignee_name ?? '',
    });
    setDirty(false);
    setSubtasks([]);
    setComments([]);
    setNewSubtask('');
    setNewComment('');

    // Load comments
    setCommentsLoading(true);
    listComments(eventId, task.id)
      .then(setComments)
      .catch(() => undefined)
      .finally(() => setCommentsLoading(false));
  }, [task, eventId]);

  function patch<K extends keyof Task>(key: K, value: Task[K]): void {
    setEditing((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave(): Promise<void> {
    if (!task) return;
    setSaving(true);
    try {
      const updated = await updateTask(eventId, task.id, editing);
      onTaskUpdated(updated);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!task) return;
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await deleteTask(eventId, task.id);
    onTaskDeleted(task.id);
    onClose();
  }

  async function handleAddSubtask(): Promise<void> {
    if (!task || !newSubtask.trim()) return;
    const created = await addSubtask(eventId, task.id, newSubtask.trim());
    setSubtasks((prev) => [...prev, created]);
    setNewSubtask('');
  }

  async function handleToggleSubtask(id: number): Promise<void> {
    if (!task) return;
    const updated = await toggleSubtask(eventId, task.id, id);
    setSubtasks((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDeleteSubtask(id: number): Promise<void> {
    if (!task) return;
    await deleteSubtask(eventId, task.id, id);
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddComment(): Promise<void> {
    if (!task || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const created = await addComment(eventId, task.id, newComment.trim());
      setComments((prev) => [...prev, created]);
      setNewComment('');
    } finally {
      setSubmittingComment(false);
    }
  }

  const initials = task?.assignee_name
    ? task.assignee_name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 3, overflowY: 'auto' } }}
    >
      {!task ? (
        <>
          <Skeleton variant="text" width="60%" height={40} />
          <Skeleton variant="rectangular" height={120} sx={{ mt: 2 }} />
        </>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Chip
              label={task.status}
              size="small"
              color={
                task.status === 'Complete'
                  ? 'success'
                  : task.status === 'Blocked'
                    ? 'error'
                    : 'default'
              }
            />
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {onOpenHistory && (
                <Tooltip title="Version history">
                  <IconButton
                    size="small"
                    onClick={() => task && onOpenHistory(task)}
                    aria-label="Open version history"
                    data-testid="task-version-history-open"
                  >
                    <HistoryRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Delete task">
                <IconButton size="small" color="error" onClick={() => void handleDelete()}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Title */}
          <TextField
            label="Title"
            fullWidth
            size="small"
            value={editing.title ?? ''}
            onChange={(e) => patch('title', e.target.value)}
          />

          {/* Description */}
          <TextField
            label="Description"
            fullWidth
            size="small"
            multiline
            minRows={2}
            value={editing.description ?? ''}
            onChange={(e) => patch('description', e.target.value as unknown as Task['description'])}
          />

          {/* Status + Priority row */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                label="Status"
                value={editing.status ?? task.status}
                onChange={(e: SelectChangeEvent) => patch('status', e.target.value as TaskStatus)}
              >
                {STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                label="Priority"
                value={editing.priority ?? task.priority}
                onChange={(e: SelectChangeEvent) =>
                  patch('priority', e.target.value as TaskPriority)
                }
              >
                {PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    <Chip
                      label={p}
                      size="small"
                      color={PRIORITY_COLORS[p as TaskPriority]}
                      sx={{ mr: 1 }}
                    />
                    {p}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Due date + estimated hours */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Due Date"
              type="date"
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={editing.due_date ?? ''}
              onChange={(e) => patch('due_date', e.target.value as unknown as Task['due_date'])}
            />
            <TextField
              label="Est. Hours"
              type="number"
              size="small"
              fullWidth
              inputProps={{ min: 0, step: 0.5 }}
              value={editing.estimated_hours ?? ''}
              onChange={(e) =>
                patch(
                  'estimated_hours',
                  e.target.value
                    ? (Number(e.target.value) as unknown as Task['estimated_hours'])
                    : null,
                )
              }
            />
          </Box>

          {/* Assignee */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {initials && (
              <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', bgcolor: 'primary.main' }}>
                {initials}
              </Avatar>
            )}
            <TextField
              label="Assignee"
              size="small"
              fullWidth
              value={editing.assignee_name ?? ''}
              onChange={(e) =>
                patch('assignee_name', e.target.value as unknown as Task['assignee_name'])
              }
            />
          </Box>

          {/* Save / Cancel */}
          {dirty && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setEditing({
                    title: task.title,
                    description: task.description,
                    status: task.status,
                    priority: task.priority,
                    due_date: task.due_date ?? '',
                    estimated_hours: task.estimated_hours,
                    assignee_name: task.assignee_name ?? '',
                  });
                  setDirty(false);
                }}
              >
                Cancel
              </Button>
            </Box>
          )}

          <Divider />

          {/* Subtasks */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Subtasks ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
            </Typography>
            {subtasks.map((s) => (
              <Box key={s.id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox
                  checked={s.completed}
                  size="small"
                  onChange={() => void handleToggleSubtask(s.id)}
                />
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    textDecoration: s.completed ? 'line-through' : 'none',
                    color: s.completed ? 'text.disabled' : 'text.primary',
                  }}
                >
                  {s.title}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => void handleDeleteSubtask(s.id)}
                  aria-label="Delete subtask"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                size="small"
                placeholder="Add subtask…"
                fullWidth
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddSubtask();
                }}
              />
              <IconButton
                size="small"
                color="primary"
                onClick={() => void handleAddSubtask()}
                disabled={!newSubtask.trim()}
                aria-label="Add subtask"
              >
                <AddIcon />
              </IconButton>
            </Box>
          </Box>

          <Divider />

          {/* Comments */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Comments
            </Typography>
            {commentsLoading ? (
              <Skeleton variant="rectangular" height={60} />
            ) : (
              comments.map((c) => (
                <Box key={c.id} sx={{ mb: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Avatar
                      sx={{ width: 22, height: 22, fontSize: '0.6rem', bgcolor: 'secondary.main' }}
                    >
                      {c.author_name?.[0]?.toUpperCase() ?? '?'}
                    </Avatar>
                    <Typography variant="caption" fontWeight={600}>
                      {c.author_name ?? 'Unknown'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(c.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ pl: 4 }}>
                    {c.body}
                  </Typography>
                </Box>
              ))
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                size="small"
                placeholder="Add comment…"
                fullWidth
                multiline
                maxRows={3}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
              />
              <Button
                variant="outlined"
                size="small"
                disabled={!newComment.trim() || submittingComment}
                onClick={() => void handleAddComment()}
                sx={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
              >
                Post
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
