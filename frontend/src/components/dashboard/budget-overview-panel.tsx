/**
 * Budget Overview Panel — issue #375
 * Shows aggregate budget KPIs and per-event breakdown.
 * Wired to the budget API: /api/events/:id/budget/categories
 */

import { useEffect, useState } from 'react';
import { Box, Button, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { listCategories, type BudgetCategory } from '../../services/budget-service';

interface DashboardEvent {
  id: number;
  title: string;
  status: string;
}

interface EventBudget {
  event: DashboardEvent;
  totalAllocated: number;
  totalSpent: number;
}

const fmt = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);

const MAX_EVENTS = 5;

export function BudgetOverviewPanel(): JSX.Element {
  const navigate = useNavigate();
  const [budgets, setBudgets] = useState<EventBudget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const events = await api.get<DashboardEvent[] | { events?: DashboardEvent[] }>(
          '/api/events',
        );
        const list: DashboardEvent[] = Array.isArray(events)
          ? events
          : ((events as { events?: DashboardEvent[] }).events ?? []);

        const upcoming = list
          .filter((e) => e.status === 'Active' || e.status === 'Draft' || e.status === 'Upcoming')
          .slice(0, MAX_EVENTS);

        const results = await Promise.all(
          upcoming.map(async (event): Promise<EventBudget> => {
            try {
              const cats: BudgetCategory[] = await listCategories(event.id);
              return {
                event,
                totalAllocated: cats.reduce((s, c) => s + c.allocated_amount, 0),
                totalSpent: cats.reduce((s, c) => s + c.spent, 0),
              };
            } catch {
              return { event, totalAllocated: 0, totalSpent: 0 };
            }
          }),
        );

        if (!cancelled) setBudgets(results);
      } catch {
        // Silently ignore — panel shows empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Stack spacing={1.5}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={44} />
        ))}
      </Stack>
    );
  }

  if (budgets.length === 0) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <AccountBalanceWalletRounded
          sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }}
          aria-hidden="true"
        />
        <Typography color="text.secondary" variant="body2">
          No active events with budget data yet.
        </Typography>
      </Box>
    );
  }

  const grandAllocated = budgets.reduce((s, b) => s + b.totalAllocated, 0);
  const grandSpent = budgets.reduce((s, b) => s + b.totalSpent, 0);
  const overallPct =
    grandAllocated > 0 ? Math.min(100, Math.round((grandSpent / grandAllocated) * 100)) : 0;

  return (
    <Stack spacing={2}>
      {/* Aggregate header */}
      <Stack direction="row" justifyContent="space-between">
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total Allocated
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {fmt(grandAllocated)}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="caption" color="text.secondary">
            Total Spent
          </Typography>
          <Typography
            variant="h6"
            fontWeight={700}
            color={grandSpent > grandAllocated ? 'error.main' : 'text.primary'}
          >
            {fmt(grandSpent)}
          </Typography>
        </Box>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={overallPct}
        sx={{ height: 8, borderRadius: 4 }}
        color={overallPct >= 90 ? 'error' : overallPct >= 70 ? 'warning' : 'primary'}
        aria-label={`Overall budget usage: ${overallPct}%`}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        {overallPct}% used · {fmt(grandAllocated - grandSpent)} remaining
      </Typography>

      {/* Per-event rows */}
      <Stack spacing={1}>
        {budgets.map(({ event, totalAllocated, totalSpent }) => {
          const pct =
            totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;
          return (
            <Box key={event.id}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 140 }}>
                  {event.title}
                </Typography>
                <Button
                  size="small"
                  endIcon={<OpenInNewRounded sx={{ fontSize: 13 }} />}
                  onClick={() => navigate(`/events/${event.id}/budget`)}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  {pct}%
                </Button>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={pct}
                sx={{ height: 5, borderRadius: 3 }}
                color={pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary'}
                aria-label={`${event.title} budget: ${pct}%`}
              />
              <Typography variant="caption" color="text.secondary">
                {fmt(totalSpent)} of {fmt(totalAllocated)}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
