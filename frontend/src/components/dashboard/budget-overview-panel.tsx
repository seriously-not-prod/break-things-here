/**
 * Budget Overview Panel — issue #375
 * Placeholder implementation: shows category chips and a "coming soon" message.
 * Wire up to a real budget API (/api/events/:id/budget-categories, /api/events/:id/expenses)
 * once those routes are available.
 */

import { Box, Chip, Stack, Typography } from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';

const PLACEHOLDER_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: 'Venue', color: '#6366f1' },
  { name: 'Catering', color: '#8b5cf6' },
  { name: 'Marketing', color: '#22c55e' },
  { name: 'Equipment', color: '#06b6d4' },
  { name: 'Entertainment', color: '#f59e0b' },
  { name: 'Staffing', color: '#ec4899' },
];

export function BudgetOverviewPanel(): JSX.Element {
  return (
    <Stack spacing={2}>
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <AttachMoneyIcon
          sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
          aria-hidden="true"
        />
        <Typography color="text.secondary" variant="body2">
          Budget tracking module is coming soon.
        </Typography>
        <Typography color="text.secondary" variant="caption">
          Track allocated vs. spent per category once the Budget API is available.
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: 'block' }}>
          Planned budget categories:
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {PLACEHOLDER_CATEGORIES.map((cat) => (
            <Chip
              key={cat.name}
              label={cat.name}
              size="small"
              variant="outlined"
              aria-label={`Budget category: ${cat.name} (placeholder)`}
              sx={{
                borderColor: cat.color,
                color: cat.color,
                bgcolor: `${cat.color}14`,
              }}
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
