import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Avatar, Box, Chip, Paper, Tooltip, Typography } from '@mui/material';
import type { Task, TaskSubtask } from '../../services/tasks-service';

interface TaskCardProps {
  task: Task;
  subtasks: TaskSubtask[];
  onClick: (task: Task) => void;
}

const PRIORITY_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  Low: 'success',
  Medium: 'warning',
  High: 'error',
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

export function TaskCard({ task, subtasks, onClick }: TaskCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const doneCount = subtasks.filter((s) => s.completed).length;
  const overdue = isOverdue(task.due_date);
  const initials = task.assignee_name
    ? task.assignee_name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : null;

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      elevation={isDragging ? 6 : 1}
      onClick={() => onClick(task)}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: 'pointer',
        '&:hover': { boxShadow: 3 },
        borderLeft: '3px solid',
        borderLeftColor:
          task.priority === 'High'
            ? 'error.main'
            : task.priority === 'Medium'
              ? 'warning.main'
              : 'success.main',
      }}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick(task);
      }}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        component="span"
        aria-grabbed={isDragging}
        aria-label="Drag task"
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: 'inline-flex',
          color: 'text.disabled',
          cursor: 'grab',
          float: 'right',
          mt: -0.5,
          mr: -0.5,
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorIcon fontSize="small" />
      </Box>

      {/* Title */}
      <Typography variant="body2" fontWeight={600} sx={{ pr: 2, mb: 0.5 }}>
        {task.title}
      </Typography>

      {/* Priority + due date row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Chip
          label={task.priority}
          size="small"
          color={PRIORITY_COLORS[task.priority] ?? 'default'}
          sx={{ height: 18, fontSize: '0.65rem' }}
        />
        {task.due_date && (
          <Typography
            variant="caption"
            color={overdue ? 'error.main' : 'text.secondary'}
            fontWeight={overdue ? 700 : 400}
          >
            {overdue ? '⚠ ' : ''}
            {new Date(task.due_date).toLocaleDateString()}
          </Typography>
        )}
      </Box>

      {/* Assignee + subtask progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {initials ? (
          <Tooltip title={task.assignee_name ?? ''}>
            <Avatar sx={{ width: 22, height: 22, fontSize: '0.65rem', bgcolor: 'primary.main' }}>
              {initials}
            </Avatar>
          </Tooltip>
        ) : (
          <Box />
        )}
        {subtasks.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {doneCount}/{subtasks.length}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
