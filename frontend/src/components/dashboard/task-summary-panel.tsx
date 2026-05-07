/**
 * Task Summary Panel — issue #374
 * Shows task status breakdown with a Recharts PieChart.
 */

import { Box, Skeleton, Stack, Typography } from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Formatter, NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { DashboardTask } from '../../services/dashboard-service';

export interface TaskSummaryPanelProps {
  tasks: DashboardTask[];
  loading: boolean;
}

interface StatusConfig {
  color: string;
  label: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  Pending: { color: '#f59e0b', label: 'Pending' },
  'In Progress': { color: '#6366f1', label: 'In Progress' },
  Blocked: { color: '#ef4444', label: 'Blocked' },
  Complete: { color: '#22c55e', label: 'Complete' },
};

const STATUS_ORDER = ['Pending', 'In Progress', 'Blocked', 'Complete'] as const;

function normalizeTooltipValue(value: ValueType | undefined): number {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }

  return Number(value ?? 0);
}

const formatTaskTooltip: Formatter<ValueType, NameType> = (value, name) => {
  return [normalizeTooltipValue(value), String(name ?? '')];
};

export function TaskSummaryPanel({ tasks, loading }: TaskSummaryPanelProps): JSX.Element {
  if (loading) {
    return (
      <Stack spacing={1}>
        <Skeleton variant="circular" width={160} height={160} sx={{ mx: 'auto' }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={24} sx={{ borderRadius: 1 }} />
        ))}
      </Stack>
    );
  }

  if (tasks.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }} role="status" aria-label="No tasks">
        <TaskAltIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} aria-hidden="true" />
        <Typography color="text.secondary">No tasks yet.</Typography>
      </Box>
    );
  }

  const chartData = STATUS_ORDER.map((status) => ({
    name: STATUS_CONFIG[status]?.label ?? status,
    value: tasks.filter((t) => t.status === status).length,
    color: STATUS_CONFIG[status]?.color ?? '#94a3b8',
  })).filter((d) => d.value > 0);

  return (
    <Stack spacing={2}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart aria-label="Task status distribution pie chart">
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={formatTaskTooltip} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>

      <Stack spacing={0.75} role="list" aria-label="Task status breakdown">
        {chartData.map((d) => (
          <Box
            key={d.name}
            role="listitem"
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: d.color, flexShrink: 0 }}
                aria-hidden="true"
              />
              <Typography variant="body2">{d.name}</Typography>
            </Box>
            <Typography variant="body2" fontWeight={700}>
              {d.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
