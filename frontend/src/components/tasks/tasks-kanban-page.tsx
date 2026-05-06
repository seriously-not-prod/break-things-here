import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import AddIcon from '@mui/icons-material/Add';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { SelectChangeEvent } from '@mui/material';
import {
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskSubtask,
  createTask,
  listTasks,
  updateTask,
} from '../../services/tasks-service';
import { TaskCard } from './task-card';
import { TaskDetailDrawer } from './task-detail-drawer';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'Pending', label: 'Pending' },
  { status: 'In Progress', label: 'In Progress' },
  { status: 'Blocked', label: 'Blocked' },
  { status: 'Complete', label: 'Complete' },
];

const COLUMN_COLORS: Record<TaskStatus, string> = {
  Pending: '#e3f2fd',
  'In Progress': '#fff8e1',
  Blocked: '#fce4ec',
  Complete: '#e8f5e9',
};

const COLUMN_HEADER_COLORS: Record<TaskStatus, string> = {
  Pending: 'info.main',
  'In Progress': 'warning.main',
  Blocked: 'error.main',
  Complete: 'success.main',
};

interface AddTaskDialogProps {
  open: boolean;
  defaultStatus: TaskStatus;
  onClose: () => void;
  onSubmit: (payload: { title: string; priority: TaskPriority; due_date: string; status: TaskStatus }) => Promise<void>;
}

function AddTaskDialog({ open, defaultStatus, onClose, onSubmit }: AddTaskDialogProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('Medium');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setPriority('Medium');
      setDueDate('');
      setStatus(defaultStatus);
    }
  }, [open, defaultStatus]);

  async function handleSubmit(): Promise<void> {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), priority, due_date: dueDate, status });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Task</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField
          autoFocus
          label="Title"
          fullWidth
          size="small"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Priority</InputLabel>
            <Select
              label="Priority"
              value={priority}
              onChange={(e: SelectChangeEvent) => setPriority(e.target.value as TaskPriority)}
            >
              <MenuItem value="Low">Low</MenuItem>
              <MenuItem value="Medium">Medium</MenuItem>
              <MenuItem value="High">High</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={status}
              onChange={(e: SelectChangeEvent) => setStatus(e.target.value as TaskStatus)}
            >
              {COLUMNS.map((c) => (
                <MenuItem key={c.status} value={c.status}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <TextField
          label="Due Date"
          type="date"
          size="small"
          fullWidth
          InputLabelProps={{ shrink: true }}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || saving}
          onClick={() => void handleSubmit()}
        >
          {saving ? 'Adding…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function TasksKanbanPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtaskMap] = useState<Record<number, TaskSubtask[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogStatus, setDialogStatus] = useState<TaskStatus>('Pending');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    listTasks(eventId)
      .then(setTasks)
      .catch(() => setError('Failed to load tasks.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  const columnTasks = useMemo(
    () =>
      COLUMNS.reduce<Record<TaskStatus, Task[]>>(
        (acc, col) => {
          acc[col.status] = tasks.filter((t) => t.status === col.status);
          return acc;
        },
        {} as Record<TaskStatus, Task[]>,
      ),
    [tasks],
  );

  function openAddDialog(status: TaskStatus): void {
    setDialogStatus(status);
    setDialogOpen(true);
  }

  async function handleAddTask(payload: {
    title: string;
    priority: TaskPriority;
    due_date: string;
    status: TaskStatus;
  }): Promise<void> {
    if (!eventId) return;
    const task = await createTask(eventId, payload);
    setTasks((prev) => [...prev, task]);
    setDialogOpen(false);
  }

  function handleTaskClick(task: Task): void {
    setDrawerTask(task);
    setDrawerOpen(true);
  }

  function handleTaskUpdated(updated: Task): void {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setDrawerTask(updated);
  }

  function handleTaskDeleted(taskId: number): void {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    // over.id can be a column status string or a task id
    const targetStatus = COLUMNS.find((c) => c.status === String(over.id))?.status;
    if (targetStatus) {
      const task = tasks.find((t) => t.id === Number(active.id));
      if (!task || task.status === targetStatus) return;

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: targetStatus } : t)),
      );

      if (eventId) {
        updateTask(eventId, task.id, { status: targetStatus }).catch(() => {
          // Revert on failure
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)),
          );
        });
      }
    }
  }

  const activeTask = activeId != null ? tasks.find((t) => t.id === activeId) : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        Tasks Board
      </Typography>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(Number(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          {COLUMNS.map((col) => {
            const colTasks = columnTasks[col.status];
            return (
              <Paper
                key={col.status}
                id={`column-${col.status}`}
                elevation={0}
                role="region"
                aria-label={`${col.label} column (${colTasks.length} tasks)`}
                sx={{
                  bgcolor: COLUMN_COLORS[col.status],
                  borderRadius: 2,
                  p: 1.5,
                  minHeight: 200,
                }}
              >
                {/* Column header */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: COLUMN_HEADER_COLORS[col.status],
                      }}
                    />
                    <Typography variant="subtitle2" fontWeight={700}>
                      {col.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {colTasks.length}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => openAddDialog(col.status)}
                    aria-label={`Add task to ${col.label}`}
                    sx={{ minWidth: 0, px: 1 }}
                  >
                    Add
                  </Button>
                </Box>

                {/* Task list */}
                <SortableContext
                  id={col.status}
                  items={colTasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      subtasks={subtaskMap[task.id] ?? []}
                      onClick={handleTaskClick}
                    />
                  ))}
                </SortableContext>

                {colTasks.length === 0 && (
                  <Typography variant="caption" color="text.disabled" sx={{ pl: 0.5 }}>
                    No tasks
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Box>

        <DragOverlay>
          {activeTask && (
            <TaskCard
              task={activeTask}
              subtasks={subtaskMap[activeTask.id] ?? []}
              onClick={() => undefined}
            />
          )}
        </DragOverlay>
      </DndContext>

      <AddTaskDialog
        open={dialogOpen}
        defaultStatus={dialogStatus}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleAddTask}
      />

      <TaskDetailDrawer
        open={drawerOpen}
        task={drawerTask}
        eventId={eventId ?? ''}
        onClose={() => setDrawerOpen(false)}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
      />
    </Box>
  );
}
