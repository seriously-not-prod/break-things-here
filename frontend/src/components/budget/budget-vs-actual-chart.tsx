/**
 * Budget Planned vs Actual chart — #801
 *
 * Stacked-bar visualization of planned vs actual spend per category.
 * Currency is honoured by formatting through `formatCurrency` so the
 * caller can pass an event/base currency.
 */

import { Box, Skeleton, Typography } from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { BudgetCategory } from '../../services/budget-service';
import { formatCurrency } from '../../services/currency-service';

interface Props {
  categories: BudgetCategory[];
  currency?: string;
  loading?: boolean;
  height?: number;
}

interface CategoryRow {
  name: string;
  planned: number;
  spent: number;
  variance: number;
  variancePct: number;
  color: string | null;
}

function buildRows(categories: BudgetCategory[]): CategoryRow[] {
  return categories.map((c) => {
    const planned =
      Number.isFinite(c.plannedTotal) && c.plannedTotal > 0 ? c.plannedTotal : c.allocated_amount;
    const spent = c.spent;
    const variance = spent - planned;
    const variancePct = planned > 0 ? variance / planned : 0;
    return { name: c.name, planned, spent, variance, variancePct, color: c.color };
  });
}

interface VarianceTooltipProps extends TooltipProps<number, string> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: CategoryRow }>;
  label?: string | number;
  currency?: string;
}

function VarianceTooltip({
  active,
  payload,
  label,
  currency = 'USD',
}: VarianceTooltipProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const row = (payload[0]?.payload ?? {}) as CategoryRow;
  if (!row.name) return null;
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
        Planned: {formatCurrency(row.planned, currency)}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        Spent: {formatCurrency(row.spent, currency)}
      </Typography>
      <Typography
        variant="caption"
        display="block"
        sx={{ color: row.variance > 0 ? 'error.main' : 'success.main', fontWeight: 600 }}
      >
        Variance: {row.variance >= 0 ? '+' : ''}
        {formatCurrency(row.variance, currency)} ({(row.variancePct * 100).toFixed(1)}%)
      </Typography>
    </Box>
  );
}

export default function BudgetVsActualChart({
  categories,
  currency = 'USD',
  loading = false,
  height = 320,
}: Props): JSX.Element {
  if (loading) {
    return <Skeleton variant="rounded" height={height} data-testid="budget-vs-actual-skeleton" />;
  }
  const rows = buildRows(categories);
  if (rows.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height }}>
        <Typography color="text.secondary" variant="body2">
          Add categories to see the planned vs actual breakdown.
        </Typography>
      </Box>
    );
  }
  return (
    <Box data-testid="budget-vs-actual-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 16 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" angle={-15} textAnchor="end" height={60} interval={0} />
          <YAxis tickFormatter={(v: number) => formatCurrency(v, currency)} />
          <Tooltip content={<VarianceTooltip currency={currency} />} />
          <Legend />
          <Bar dataKey="planned" name="Planned" fill="#90caf9" />
          <Bar dataKey="spent" name="Actual">
            {rows.map((row, index) => (
              <Cell
                key={`cell-${index}`}
                fill={row.variance > 0 ? '#ef5350' : (row.color ?? '#43a047')}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
