import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import AccountBalanceWalletRounded from '@mui/icons-material/AccountBalanceWalletRounded';
import MoneyOffRounded from '@mui/icons-material/MoneyOffRounded';
import SavingsRounded from '@mui/icons-material/SavingsRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import type { BudgetSummary } from '../../services/budget-service';

interface BudgetSummaryCardsProps {
  summary: BudgetSummary;
}

const fmt = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

interface KpiCardProps {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}

function KpiCard({ label, value, color, icon }: KpiCardProps): JSX.Element {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Box>
        <Typography variant="h5" fontWeight={700} sx={{ color }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export function BudgetSummaryCards({ summary }: BudgetSummaryCardsProps): JSX.Element {
  const { totalAllocated, totalSpent, remaining, percentUsed } = summary;

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          label="Total Allocated"
          value={fmt(totalAllocated)}
          color="primary.main"
          icon={<AccountBalanceWalletRounded />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          label="Total Spent"
          value={fmt(totalSpent)}
          color="error.main"
          icon={<MoneyOffRounded />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          label="Remaining"
          value={fmt(remaining)}
          color={remaining >= 0 ? 'success.main' : 'error.main'}
          icon={<SavingsRounded />}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <KpiCard
          label="% Used"
          value={`${percentUsed}%`}
          color={
            percentUsed >= 90 ? 'error.main' : percentUsed >= 70 ? 'warning.main' : 'success.main'
          }
          icon={<TrendingUpRounded />}
        />
      </Grid>
    </Grid>
  );
}
