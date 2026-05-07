/**
 * Gantt View (#441)
 * Renders a simple horizontal Gantt chart of tasks by due date.
 * Uses a lightweight SVG-based layout — no external chart library required.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import { Task, listTasks } from '../../services/tasks-service';

interface Props {
  eventId: number | string;
}

const STATUS_COLORS: Record<string, string> = {
  Pending: '#90caf9',
  'In Progress': '#ffe082',
  Blocked: '#ef9a9a',
  Complete: '#a5d6a7',
};

const BAR_HEIGHT = 28;
const ROW_GAP = 8;
const LABEL_WIDTH = 200;
const CHART_PADDING = 16;

export default function GanttView({ eventId }: Props): JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTasks(eventId)
      .then((data) => setTasks(data))
      .catch(() => setError('Failed to load tasks.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  // Filter tasks that have a due_date; sort chronologically
  const scheduledTasks = useMemo(
    () =>
      tasks
        .filter((t) => Boolean(t.due_date))
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1)),
    [tasks],
  );

  const { minDate, totalDays } = useMemo(() => {
    if (scheduledTasks.length === 0) return { minDate: new Date(), maxDate: new Date(), totalDays: 1 };
    const dates = scheduledTasks.map((t) => new Date(t.due_date!).getTime());
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    // Give some padding
    min.setDate(min.getDate() - 1);
    max.setDate(max.getDate() + 2);
    const total = Math.max(1, Math.round((max.getTime() - min.getTime()) / 86_400_000));
    return { minDate: min, totalDays: total };
  }, [scheduledTasks]);

  const CHART_WIDTH = Math.max(600, totalDays * 24);

  const dayOffset = (dateStr: string): number => {
    const d = new Date(dateStr).getTime();
    return Math.round((d - minDate.getTime()) / 86_400_000);
  };

  // Generate evenly-spaced date labels
  const dateLabels = useMemo(() => {
    const labels: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.floor(totalDays / 10));
    for (let i = 0; i <= totalDays; i += step) {
      const d = new Date(minDate);
      d.setDate(d.getDate() + i);
      labels.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        x: (i / totalDays) * CHART_WIDTH,
      });
    }
    return labels;
  }, [minDate, totalDays, CHART_WIDTH]);

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (scheduledTasks.length === 0) {
    return <Alert severity="info">No tasks with due dates found. Add due dates to tasks to see the Gantt view.</Alert>;
  }

  const svgHeight = scheduledTasks.length * (BAR_HEIGHT + ROW_GAP) + 40 + CHART_PADDING;

  return (
    <Box>
      <Typography variant="h6" mb={2}>Gantt View</Typography>
      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Box sx={{ display: 'flex', minWidth: LABEL_WIDTH + CHART_WIDTH + CHART_PADDING * 2 }}>
          {/* Task label column */}
          <Box sx={{ width: LABEL_WIDTH, flexShrink: 0, pt: '40px' }}>
            {scheduledTasks.map((task, _idx) => (
              <Box
                key={task.id}
                sx={{
                  height: BAR_HEIGHT + ROW_GAP,
                  display: 'flex',
                  alignItems: 'center',
                  px: 1,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  overflow: 'hidden',
                }}
              >
                <Tooltip title={task.title}>
                  <Typography variant="caption" noWrap sx={{ maxWidth: LABEL_WIDTH - 16 }}>
                    {task.title}
                  </Typography>
                </Tooltip>
              </Box>
            ))}
          </Box>

          {/* Chart SVG */}
          <svg
            width={CHART_WIDTH + CHART_PADDING * 2}
            height={svgHeight}
            style={{ flexShrink: 0 }}
            aria-label="Gantt chart"
          >
            {/* Date labels */}
            {dateLabels.map((dl) => (
              <g key={dl.label} transform={`translate(${dl.x + CHART_PADDING}, 0)`}>
                <line x1={0} y1={20} x2={0} y2={svgHeight} stroke="#e0e0e0" strokeWidth={1} />
                <text x={0} y={14} fontSize={10} fill="#757575" textAnchor="middle">
                  {dl.label}
                </text>
              </g>
            ))}

            {/* Task bars */}
            {scheduledTasks.map((task, idx) => {
              const offset = dayOffset(task.due_date!);
              const barX = (offset / totalDays) * CHART_WIDTH + CHART_PADDING;
              // Render a 1-day wide bar at the due date
              const barW = Math.max(16, (1 / totalDays) * CHART_WIDTH);
              const barY = 40 + idx * (BAR_HEIGHT + ROW_GAP) + ROW_GAP / 2;
              const fill = STATUS_COLORS[task.status] ?? '#b0bec5';

              return (
                <g key={task.id}>
                  <title>{`${task.title} — due ${task.due_date} (${task.status})`}</title>
                  <rect
                    x={barX}
                    y={barY}
                    width={barW}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill={fill}
                    stroke="#9e9e9e"
                    strokeWidth={1}
                  />
                  {barW > 40 && (
                    <text x={barX + 6} y={barY + BAR_HEIGHT / 2 + 4} fontSize={10} fill="#333">
                      {task.title.slice(0, 20)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </Box>

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 2, p: 1, flexWrap: 'wrap' }}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <Box key={status} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: color, border: '1px solid #9e9e9e' }} />
              <Typography variant="caption">{status}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}
