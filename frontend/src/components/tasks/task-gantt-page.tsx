/**
 * Task Gantt / Timeline View — #795
 *
 * Renders tasks as horizontal bars positioned between their start (created_at,
 * fallback) and due_date. Supports:
 *  - Drag-resize on bar edges to update due_date via existing tasks API.
 *  - Dependency arrows between bars using existing task dependencies.
 *  - Keyboard navigation (arrow keys move focus across bars; Left/Right shift
 *    the focused bar's due_date by ±1 day).
 *  - Empty-state when no tasks exist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import { type Task, listTasks, updateTask } from '../../services/tasks-service';
import {
  listTaskDependencies,
  type TaskDependenciesResponse,
} from '../../services/task-dependencies-service';

const STATUS_COLORS: Record<string, string> = {
  Pending: '#90caf9',
  'In Progress': '#ffe082',
  Blocked: '#ef9a9a',
  Verification: '#ce93d8',
  Complete: '#a5d6a7',
  Cancelled: '#bdbdbd',
};

const BAR_HEIGHT = 28;
const ROW_GAP = 12;
const LABEL_WIDTH = 220;
const CHART_PADDING = 16;
const HEADER_HEIGHT = 40;
const MS_PER_DAY = 86_400_000;

interface ScheduledTask extends Task {
  startMs: number;
  endMs: number;
}

function dayStartMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default function TaskGanttPage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<Record<number, TaskDependenciesResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTasks(eventId);
      setTasks(data);
      // Best-effort load of dependencies for each task. Failures are non-fatal.
      const depsMap: Record<number, TaskDependenciesResponse> = {};
      await Promise.all(
        data.map(async (t) => {
          try {
            depsMap[t.id] = await listTaskDependencies(eventId, t.id);
          } catch {
            depsMap[t.id] = { blocking: [], blocked_by: [] };
          }
        }),
      );
      setDeps(depsMap);
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!Number.isFinite(eventId)) return;
    void load();
  }, [eventId, load]);

  const scheduled = useMemo<ScheduledTask[]>(() => {
    return tasks
      .map((t) => {
        const due = dayStartMs(t.due_date);
        if (due === null) return null;
        // Treat created_at as the planning anchor; fall back to "1 day before due".
        const created = dayStartMs(t.created_at);
        const start = created !== null && created < due ? created : due - MS_PER_DAY;
        return { ...t, startMs: start, endMs: due + MS_PER_DAY };
      })
      .filter((t): t is ScheduledTask => t !== null)
      .sort((a, b) => a.startMs - b.startMs);
  }, [tasks]);

  const { minMs, totalDays } = useMemo(() => {
    if (scheduled.length === 0) {
      const now = Date.now();
      return { minMs: now, totalDays: 14 };
    }
    const min = Math.min(...scheduled.map((t) => t.startMs)) - MS_PER_DAY;
    const max = Math.max(...scheduled.map((t) => t.endMs)) + MS_PER_DAY;
    const days = Math.max(7, Math.round((max - min) / MS_PER_DAY));
    return { minMs: min, totalDays: days };
  }, [scheduled]);

  const chartWidth = Math.max(640, totalDays * 28);
  const dayWidth = chartWidth / totalDays;

  const dayOffset = useCallback((ms: number) => (ms - minMs) / MS_PER_DAY, [minMs]);

  const dateLabels = useMemo(() => {
    const labels: { label: string; x: number }[] = [];
    const step = Math.max(1, Math.ceil(totalDays / 12));
    for (let i = 0; i <= totalDays; i += step) {
      const d = new Date(minMs + i * MS_PER_DAY);
      labels.push({
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        x: i * dayWidth,
      });
    }
    return labels;
  }, [minMs, totalDays, dayWidth]);

  /**
   * Persist a new due-date for a task and update local state optimistically.
   * The caller is responsible for clamping deltas to whole days.
   */
  const persistDueDateShift = useCallback(
    async (task: ScheduledTask, deltaDays: number): Promise<void> => {
      if (deltaDays === 0) return;
      const newDueMs = task.endMs - MS_PER_DAY + deltaDays * MS_PER_DAY;
      const newDueIso = isoDay(newDueMs);
      const previous = task.due_date;
      // Optimistic update
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: newDueIso } : t)));
      setSavingId(task.id);
      try {
        await updateTask(eventId, task.id, { due_date: newDueIso });
      } catch {
        // Rollback on failure
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, due_date: previous } : t)));
        setError('Failed to update task due date.');
      } finally {
        setSavingId(null);
      }
    },
    [eventId],
  );

  // ── Drag-resize handling on right edge ────────────────────────────────
  const dragState = useRef<{
    task: ScheduledTask;
    startClientX: number;
  } | null>(null);

  const onResizeStart = (e: React.PointerEvent<SVGRectElement>, task: ScheduledTask): void => {
    (e.target as SVGRectElement).setPointerCapture(e.pointerId);
    dragState.current = { task, startClientX: e.clientX };
  };

  const onResizeMove = (e: React.PointerEvent<SVGRectElement>): void => {
    if (!dragState.current) return;
    // Visual feedback only — actual persistence on pointer-up. Cheap snap-to-day.
    const deltaPx = e.clientX - dragState.current.startClientX;
    const deltaDays = Math.round(deltaPx / dayWidth);
    if (deltaDays !== 0) {
      const handle = e.currentTarget;
      handle.setAttribute('data-pending-delta', String(deltaDays));
    }
  };

  const onResizeEnd = async (e: React.PointerEvent<SVGRectElement>): Promise<void> => {
    const handle = e.currentTarget;
    const pending = handle.getAttribute('data-pending-delta');
    handle.removeAttribute('data-pending-delta');
    const state = dragState.current;
    dragState.current = null;
    if (!state || !pending) return;
    const delta = Number(pending);
    if (!Number.isFinite(delta) || delta === 0) return;
    await persistDueDateShift(state.task, delta);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (scheduled.length === 0) return;
    const focusedIndex = focusedId === null ? -1 : scheduled.findIndex((t) => t.id === focusedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex =
        focusedIndex === -1 ? 0 : Math.min(scheduled.length - 1, Math.max(0, focusedIndex + delta));
      setFocusedId(scheduled[nextIndex].id);
    } else if (focusedIndex >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      void persistDueDateShift(scheduled[focusedIndex], delta);
    }
  };

  if (loading) {
    return (
      <PageLayout
        title="Task Gantt"
        breadcrumbs={[
          { label: 'Events', to: '/events' },
          { label: 'Tasks', to: `/events/${eventId}/tasks` },
          { label: 'Gantt' },
        ]}
      >
        <Skeleton variant="rounded" height={400} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Task Gantt"
      subtitle="Drag a bar's right edge to change due date. Use arrow keys to navigate and shift due dates."
      breadcrumbs={[
        { label: 'Events', to: '/events' },
        { label: 'Tasks', to: `/events/${eventId}/tasks` },
        { label: 'Gantt' },
      ]}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {scheduled.length === 0 ? (
        <Paper
          variant="outlined"
          sx={{ p: 6, textAlign: 'center', borderStyle: 'dashed' }}
          data-testid="gantt-empty-state"
        >
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No tasks with due dates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add a due date to a task on the Kanban or detail page to see it in the Gantt timeline.
          </Typography>
        </Paper>
      ) : (
        <Paper
          variant="outlined"
          sx={{ overflowX: 'auto', outline: 'none' }}
          tabIndex={0}
          role="grid"
          aria-label="Task Gantt timeline. Use arrow keys to navigate and shift due dates."
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (focusedId === null && scheduled.length > 0) setFocusedId(scheduled[0].id);
          }}
          data-testid="gantt-grid"
        >
          <Box sx={{ display: 'flex', minWidth: LABEL_WIDTH + chartWidth + CHART_PADDING * 2 }}>
            {/* Task label column */}
            <Box
              sx={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                pt: `${HEADER_HEIGHT}px`,
                borderRight: '1px solid',
                borderColor: 'divider',
              }}
            >
              {scheduled.map((task) => (
                <Box
                  key={task.id}
                  data-testid={`gantt-label-${task.id}`}
                  sx={{
                    height: BAR_HEIGHT + ROW_GAP,
                    display: 'flex',
                    alignItems: 'center',
                    px: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    overflow: 'hidden',
                    bgcolor: focusedId === task.id ? 'action.selected' : 'transparent',
                  }}
                >
                  <Tooltip title={task.title}>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        maxWidth: LABEL_WIDTH - 24,
                        fontWeight: focusedId === task.id ? 700 : 400,
                      }}
                    >
                      {task.title}
                    </Typography>
                  </Tooltip>
                </Box>
              ))}
            </Box>

            {/* Chart SVG */}
            <svg
              ref={svgRef}
              width={chartWidth + CHART_PADDING * 2}
              height={HEADER_HEIGHT + scheduled.length * (BAR_HEIGHT + ROW_GAP) + CHART_PADDING}
              role="presentation"
              aria-label="Task bars and dependency arrows"
              style={{ flexShrink: 0 }}
            >
              <defs>
                <marker
                  id="gantt-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#616161" />
                </marker>
              </defs>

              {/* Date labels + grid lines */}
              {dateLabels.map((dl) => (
                <g key={dl.label + dl.x} transform={`translate(${dl.x + CHART_PADDING}, 0)`}>
                  <line
                    x1={0}
                    y1={HEADER_HEIGHT - 8}
                    x2={0}
                    y2={HEADER_HEIGHT + scheduled.length * (BAR_HEIGHT + ROW_GAP)}
                    stroke="#eeeeee"
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={HEADER_HEIGHT - 14}
                    fontSize={10}
                    fill="#757575"
                    textAnchor="middle"
                  >
                    {dl.label}
                  </text>
                </g>
              ))}

              {/* Today marker */}
              {(() => {
                const todayDays = dayOffset(Date.now());
                if (todayDays < 0 || todayDays > totalDays) return null;
                const x = todayDays * dayWidth + CHART_PADDING;
                return (
                  <g>
                    <line
                      x1={x}
                      y1={HEADER_HEIGHT - 8}
                      x2={x}
                      y2={HEADER_HEIGHT + scheduled.length * (BAR_HEIGHT + ROW_GAP)}
                      stroke="#ef5350"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <text
                      x={x + 4}
                      y={HEADER_HEIGHT - 14}
                      fontSize={10}
                      fill="#ef5350"
                      fontWeight={700}
                    >
                      Today
                    </text>
                  </g>
                );
              })()}

              {/* Dependency arrows: blocked_by → this task */}
              {scheduled.map((task, idx) => {
                const taskDeps = deps[task.id]?.blocked_by ?? [];
                return taskDeps.map((dep) => {
                  const sourceIdx = scheduled.findIndex((t) => t.id === dep.id);
                  if (sourceIdx < 0) return null;
                  const source = scheduled[sourceIdx];
                  const x1 = dayOffset(source.endMs) * dayWidth + CHART_PADDING;
                  const y1 = HEADER_HEIGHT + sourceIdx * (BAR_HEIGHT + ROW_GAP) + BAR_HEIGHT / 2;
                  const x2 = dayOffset(task.startMs) * dayWidth + CHART_PADDING;
                  const y2 = HEADER_HEIGHT + idx * (BAR_HEIGHT + ROW_GAP) + BAR_HEIGHT / 2;
                  const midX = (x1 + x2) / 2;
                  const path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
                  return (
                    <path
                      key={`dep-${task.id}-${dep.id}`}
                      d={path}
                      stroke="#616161"
                      strokeWidth={1.2}
                      fill="none"
                      markerEnd="url(#gantt-arrow)"
                      data-testid={`gantt-dep-${dep.id}-to-${task.id}`}
                    />
                  );
                });
              })}

              {/* Task bars */}
              {scheduled.map((task, idx) => {
                const x = dayOffset(task.startMs) * dayWidth + CHART_PADDING;
                const w = Math.max(
                  dayWidth * 0.75,
                  ((task.endMs - task.startMs) / MS_PER_DAY) * dayWidth,
                );
                const y = HEADER_HEIGHT + idx * (BAR_HEIGHT + ROW_GAP);
                const fill = STATUS_COLORS[task.status] ?? '#b0bec5';
                const isFocused = focusedId === task.id;
                return (
                  <g key={task.id} data-testid={`gantt-bar-${task.id}`}>
                    <title>{`${task.title} — due ${task.due_date} (${task.status})`}</title>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill={fill}
                      stroke={isFocused ? '#1976d2' : '#9e9e9e'}
                      strokeWidth={isFocused ? 2 : 1}
                      onClick={() => setFocusedId(task.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    {w > 60 && (
                      <text
                        x={x + 6}
                        y={y + BAR_HEIGHT / 2 + 4}
                        fontSize={11}
                        fill="#1a1a1a"
                        pointerEvents="none"
                      >
                        {task.title.length > Math.floor(w / 7)
                          ? task.title.slice(0, Math.max(3, Math.floor(w / 7) - 1)) + '…'
                          : task.title}
                      </text>
                    )}
                    {/* Resize handle on right edge */}
                    <rect
                      x={x + w - 6}
                      y={y}
                      width={6}
                      height={BAR_HEIGHT}
                      fill="transparent"
                      style={{ cursor: 'ew-resize' }}
                      onPointerDown={(e) => onResizeStart(e, task)}
                      onPointerMove={onResizeMove}
                      onPointerUp={(e) => void onResizeEnd(e)}
                      onPointerCancel={(e) => void onResizeEnd(e)}
                      role="slider"
                      aria-label={`Resize due date for ${task.title}`}
                      aria-valuetext={task.due_date ?? ''}
                      data-testid={`gantt-handle-${task.id}`}
                    />
                    {savingId === task.id && (
                      <text x={x + w + 4} y={y + BAR_HEIGHT / 2 + 4} fontSize={10} fill="#1976d2">
                        saving…
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </Box>

          {/* Legend */}
          <Stack
            direction="row"
            gap={2}
            sx={{ p: 1.5, flexWrap: 'wrap', borderTop: '1px solid', borderColor: 'divider' }}
          >
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <Box key={status} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: 1,
                    bgcolor: color,
                    border: '1px solid #9e9e9e',
                  }}
                  aria-hidden="true"
                />
                <Typography variant="caption">{status}</Typography>
              </Box>
            ))}
            {savingId !== null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CircularProgress size={12} />
                <Typography variant="caption">Saving…</Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      )}
    </PageLayout>
  );
}
