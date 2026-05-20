import { Box, Typography } from '@mui/material';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type {
  Formatter,
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent';
import type { BudgetCategory } from '../../services/budget-service';

interface BudgetChartProps {
  categories: BudgetCategory[];
}

const DEFAULT_COLORS = [
  '#F97316',
  '#7C3AED',
  '#06B6D4',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#3B82F6',
  '#EC4899',
  '#14B8A6',
  '#8B5CF6',
];

const fmt = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

function normalizeTooltipValue(value: ValueType | undefined): number {
  if (Array.isArray(value)) {
    return Number(value[0] ?? 0);
  }

  return Number(value ?? 0);
}

const formatSpentTooltip: Formatter<ValueType, NameType> = (value) => {
  return [fmt(normalizeTooltipValue(value)), 'Spent'];
};

export function BudgetChart({ categories }: BudgetChartProps): JSX.Element {
  const data = categories
    .filter((c) => c.spent > 0)
    .map((c, i) => ({
      name: c.name,
      value: c.spent,
      fill: c.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }));

  if (data.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
        <Typography color="text.secondary" variant="body2">
          No spending recorded yet
        </Typography>
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          aria-label="Spending by category"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip formatter={formatSpentTooltip} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
