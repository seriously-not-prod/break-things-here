/**
 * Budget Burn-down chart — #801
 *
 * Plots cumulative spend over time against the total allocation. The user
 * sees how the event budget is being consumed across the planning window.
 */

import { useMemo } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { Expense } from '../../services/budget-service';
import { formatCurrency } from '../../services/currency-service';

interface Props {
  expenses: Expense[];
  totalAllocated: number;
  currency?: string;
  loading?: boolean;
  height?: number;
}

interface BurnPoint {
  date: string;
  cumulative_spent: number;
  remaining: number;
  allocation: number;
}

function buildBurnDown(expenses: Expense[], allocation: number): BurnPoint[] {
  const dated = expenses
    .filter((e) => Boolean(e.created_at))
    .map((e) => ({ ts: new Date(e.created_at).getTime(), amount: Number(e.amount) }))
    .filter((e) => Number.isFinite(e.ts) && Number.isFinite(e.amount))
    .sort((a, b) => a.ts - b.ts);
  if (dated.length === 0) return [];
  const map = new Map<string, number>();
  for (const row of dated) {
    const key = new Date(row.ts).toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + row.amount);
  }
  const keys = Array.from(map.keys()).sort();
  let running = 0;
  return keys.map((date) => {
    running += map.get(date) ?? 0;
    return {
      date,
      cumulative_spent: running,
      remaining: Math.max(0, allocation - running),
      allocation,
    };
  });
}

interface BurnTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: BurnPoint }>;
  label?: string | number;
  currency?: string;
}

function BurnTooltip({
  active,
  payload,
  label,
  currency = 'USD',
}: BurnTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const point = (payload[0]?.payload ?? {}) as BurnPoint;
  if (!point.date) return null;
  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        p: 1.25,
        borderRadius: 1,
        boxShadow: 1,
      }}
    >
      <Typography variant="subtitle2" fontWeight={700}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Cumulative spent: {formatCurrency(point.cumulative_spent, currency)}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Allocated: {formatCurrency(point.allocation, currency)}
      </Typography>
      <Typography
        variant="caption"
        color={point.cumulative_spent > point.allocation ? 'error.main' : 'success.main'}
        display="block"
        fontWeight={600}
      >
        Remaining: {formatCurrency(point.remaining, currency)}
      </Typography>
    </Box>
  );
}

export default function BudgetBurndownChart({
  expenses,
  totalAllocated,
  currency = 'USD',
  loading = false,
  height = 320,
}: Props): JSX.Element {
  const points = useMemo(() => buildBurnDown(expenses, totalAllocated), [expenses, totalAllocated]);

  if (loading) {
    return <Skeleton variant="rounded" height={height} data-testid="budget-burndown-skeleton" />;
  }
  if (points.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary" variant="body2">
          Add expenses to see the budget burn-down.
        </Typography>
      </Box>
    );
  }

  return (
    <Box data-testid="budget-burndown-chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis tickFormatter={(v: number) => formatCurrency(v, currency)} />
          <Tooltip content={<BurnTooltip currency={currency} />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="cumulative_spent"
            name="Cumulative spent"
            stroke="#3b82f6"
            fill="#93c5fd"
            fillOpacity={0.5}
            strokeWidth={2}
            isAnimationActive={false}
          />
          {totalAllocated > 0 && (
            <ReferenceLine
              y={totalAllocated}
              label={{
                value: `Allocated ${formatCurrency(totalAllocated, currency)}`,
                position: 'insideTopRight',
                fontSize: 11,
              }}
              stroke="#ef4444"
              strokeDasharray="4 3"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
