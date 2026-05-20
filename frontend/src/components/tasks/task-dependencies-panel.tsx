/**
 * Task Dependencies Panel (#440)
 * Shows and manages blocking/blocked-by relationships for a task.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import BlockIcon from '@mui/icons-material/Block';
import LinkIcon from '@mui/icons-material/Link';
import {
  TaskDependencyRef,
  addTaskDependency,
  listTaskDependencies,
  removeTaskDependency,
} from '../../services/task-dependencies-service';
import { Task, listTasks } from '../../services/tasks-service';

interface Props {
  eventId: number | string;
  taskId: number;
}

const STATUS_COLORS: Record<string, 'default' | 'info' | 'error' | 'success' | 'warning'> = {
  Pending: 'default',
  'In Progress': 'info',
  Blocked: 'error',
  Complete: 'success',
};

export default function TaskDependenciesPanel({ eventId, taskId }: Props): JSX.Element {
  const [blocking, setBlocking] = useState<TaskDependencyRef[]>([]);
  const [blockedBy, setBlockedBy] = useState<TaskDependencyRef[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingBlock, setAddingBlock] = useState(false);
  const [addingBlockedBy, setAddingBlockedBy] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      const [deps, tasks] = await Promise.all([
        listTaskDependencies(eventId, taskId),
        listTasks(eventId),
      ]);
      setBlocking(deps.blocking);
      setBlockedBy(deps.blocked_by);
      // Exclude the current task from the selectable list
      setAllTasks(tasks.filter((t) => t.id !== taskId));
    } catch {
      setError('Failed to load dependencies.');
    } finally {
      setLoading(false);
    }
  }, [eventId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (depTaskId: number, direction: 'blocks' | 'blockedBy'): Promise<void> => {
    setError(null);
    try {
      if (direction === 'blocks') {
        // Current task blocks depTaskId: depTaskId depends_on taskId
        await addTaskDependency(eventId, depTaskId, taskId);
      } else {
        // Current task is blocked by depTaskId: taskId depends_on depTaskId
        await addTaskDependency(eventId, taskId, depTaskId);
      }
      setSelectedTask('');
      setAddingBlock(false);
      setAddingBlockedBy(false);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add dependency.';
      setError(msg);
    }
  };

  const handleRemove = async (
    depId: number,
    taskRef: number,
    direction: 'blocks' | 'blockedBy',
  ): Promise<void> => {
    try {
      if (direction === 'blocks') {
        await removeTaskDependency(eventId, taskRef, depId);
      } else {
        await removeTaskDependency(eventId, taskId, depId);
      }
      await load();
    } catch {
      setError('Failed to remove dependency.');
    }
  };

  if (loading) return <CircularProgress size={20} />;

  const existingIds = new Set([
    ...blocking.map((t) => t.id),
    ...blockedBy.map((t) => t.id),
    taskId,
  ]);
  const availableTasks = allTasks.filter((t) => !existingIds.has(t.id));

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {/* This task is blocked by … */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <BlockIcon fontSize="small" color="error" />
        <Typography variant="subtitle2">Blocked by</Typography>
        <Tooltip title="Add a blocking task">
          <IconButton
            size="small"
            onClick={() => {
              setAddingBlockedBy((v) => !v);
              setAddingBlock(false);
            }}
            aria-label="Add blocked-by dependency"
          >
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {addingBlockedBy && (
        <Stack direction="row" spacing={1} mb={1}>
          <Select
            size="small"
            value={selectedTask}
            displayEmpty
            onChange={(e) => setSelectedTask(e.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="" disabled>
              Select a task…
            </MenuItem>
            {availableTasks.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.title}
              </MenuItem>
            ))}
          </Select>
          {selectedTask && (
            <Chip
              label="Add"
              color="primary"
              size="small"
              onClick={() => void handleAdd(Number(selectedTask), 'blockedBy')}
              sx={{ cursor: 'pointer' }}
            />
          )}
        </Stack>
      )}

      {blockedBy.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 3, mb: 1 }}>
          None
        </Typography>
      ) : (
        <Stack direction="row" flexWrap="wrap" gap={1} mb={1} sx={{ ml: 3 }}>
          {blockedBy.map((t) => (
            <Chip
              key={t.dep_id}
              label={t.title}
              color={STATUS_COLORS[t.status] ?? 'default'}
              size="small"
              onDelete={() => void handleRemove(t.dep_id, taskId, 'blockedBy')}
              deleteIcon={<DeleteRounded />}
            />
          ))}
        </Stack>
      )}

      <Divider sx={{ my: 1 }} />

      {/* This task blocks … */}
      <Stack direction="row" alignItems="center" spacing={1} mb={1}>
        <LinkIcon fontSize="small" color="warning" />
        <Typography variant="subtitle2">Blocks</Typography>
        <Tooltip title="Add a task this blocks">
          <IconButton
            size="small"
            onClick={() => {
              setAddingBlock((v) => !v);
              setAddingBlockedBy(false);
            }}
            aria-label="Add blocks dependency"
          >
            <AddRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {addingBlock && (
        <Stack direction="row" spacing={1} mb={1}>
          <Select
            size="small"
            value={selectedTask}
            displayEmpty
            onChange={(e) => setSelectedTask(e.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="" disabled>
              Select a task…
            </MenuItem>
            {availableTasks.map((t) => (
              <MenuItem key={t.id} value={String(t.id)}>
                {t.title}
              </MenuItem>
            ))}
          </Select>
          {selectedTask && (
            <Chip
              label="Add"
              color="primary"
              size="small"
              onClick={() => void handleAdd(Number(selectedTask), 'blocks')}
              sx={{ cursor: 'pointer' }}
            />
          )}
        </Stack>
      )}

      {blocking.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 3 }}>
          None
        </Typography>
      ) : (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ ml: 3 }}>
          {blocking.map((t) => (
            <Chip
              key={t.dep_id}
              label={t.title}
              color={STATUS_COLORS[t.status] ?? 'default'}
              size="small"
              onDelete={() => void handleRemove(t.dep_id, t.id, 'blocks')}
              deleteIcon={<DeleteRounded />}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
