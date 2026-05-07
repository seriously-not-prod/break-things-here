/**
 * Budget forecast card (#418, #462).
 *
 * Renders a per-category forecast bar showing actual vs. allocated vs. total
 * forecast. The breakdown (recurring, installments, trend) is exposed in a
 * tooltip so the planner can audit the projection.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import {
  formatCurrency,
  getBudgetForecast,
  type BudgetForecast,
  type CategoryForecast,
} from '../../services/currency-service';

interface Props {
  eventId: string | number;
}

const STATUS_COLOR: Record<CategoryForecast['status'], 'success' | 'warning' | 'error'> = {
  under: 'success',
  on_track: 'warning',
  over: 'error',
};

const STATUS_LABEL: Record<CategoryForecast['status'], string> = {
  under: 'Under',
  on_track: 'On track',
  over: 'Over',
};

function pctOfAllocated(value: number, allocated: number): number {
  if (allocated <= 0) return value > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (value / allocated) * 100));
}

export function BudgetForecastCard({ eventId }: Props): JSX.Element {
  const [forecast, setForecast] = useState<BudgetForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((): void => {
    setLoading(true);
    getBudgetForecast(eventId)
      .then((f) => {
        setForecast(f);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load forecast.'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !forecast) {
    return (
      <Card variant="outlined">
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
        </CardContent>
      </Card>
    );
  }

  if (!forecast) {
    return (
      <Card variant="outlined">
        <CardContent>
          {error && <Alert severity="error">{error}</Alert>}
        </CardContent>
      </Card>
    );
  }

  const { totals, baseCurrency, categories, warnings, asOf } = forecast;
  const totalsStatus: CategoryForecast['status'] =
    totals.allocatedAmount === 0
      ? totals.forecastTotal > 0
        ? 'over'
        : 'under'
      : totals.forecastTotal >= totals.allocatedAmount * 1.05
        ? 'over'
        : totals.forecastTotal >= totals.allocatedAmount * 0.85
          ? 'on_track'
          : 'under';

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Stack direction="row" gap={1} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700}>
              Budget forecast
            </Typography>
            <Chip
              size="small"
              color={STATUS_COLOR[totalsStatus]}
              label={STATUS_LABEL[totalsStatus]}
            />
            <Chip size="small" variant="outlined" label={baseCurrency} />
          </Stack>
          <Tooltip title={`As of ${new Date(asOf).toLocaleString()}`}>
            <IconButton size="small" onClick={load} aria-label="Refresh forecast">
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Allocated
            </Typography>
            <Typography variant="h6">
              {formatCurrency(totals.allocatedAmount, baseCurrency)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Actual spent
            </Typography>
            <Typography variant="h6">
              {formatCurrency(totals.actualSpent, baseCurrency)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Forecast total
            </Typography>
            <Typography variant="h6">
              {formatCurrency(totals.forecastTotal, baseCurrency)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Variance
            </Typography>
            <Typography
              variant="h6"
              color={totals.variance > 0 ? 'error.main' : 'success.main'}
            >
              {totals.variance >= 0 ? '+' : ''}
              {formatCurrency(totals.variance, baseCurrency)}
            </Typography>
          </Box>
        </Stack>

        {warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="caption" component="div">
              Some expenses could not be converted to {baseCurrency}:
            </Typography>
            {warnings.slice(0, 3).map((w, i) => (
              <Typography key={i} variant="caption" component="div">
                · {w}
              </Typography>
            ))}
            {warnings.length > 3 && (
              <Typography variant="caption" component="div">
                · …and {warnings.length - 3} more.
              </Typography>
            )}
          </Alert>
        )}

        {categories.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No categories set up yet.
          </Typography>
        ) : (
          <Stack gap={1.5}>
            {categories.map((cat) => (
              <Box key={cat.categoryId ?? `uncat-${cat.name}`}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                  <Stack direction="row" gap={1} alignItems="center">
                    <Typography variant="body2" fontWeight={600}>
                      {cat.name}
                    </Typography>
                    <Chip size="small" color={STATUS_COLOR[cat.status]} label={STATUS_LABEL[cat.status]} />
                  </Stack>
                  <Tooltip
                    title={
                      <Box sx={{ p: 0.5 }}>
                        <Typography variant="caption" component="div">
                          Actual: {formatCurrency(cat.actualSpent, baseCurrency)}
                        </Typography>
                        <Typography variant="caption" component="div">
                          + Recurring: {formatCurrency(cat.pendingRecurring, baseCurrency)}
                        </Typography>
                        <Typography variant="caption" component="div">
                          + Installments: {formatCurrency(cat.pendingInstallments, baseCurrency)}
                        </Typography>
                        <Typography variant="caption" component="div">
                          + Trend: {formatCurrency(cat.trendProjection, baseCurrency)}
                        </Typography>
                      </Box>
                    }
                  >
                    <Typography variant="body2">
                      {formatCurrency(cat.forecastTotal, baseCurrency)} /{' '}
                      {formatCurrency(cat.allocatedAmount, baseCurrency)}
                    </Typography>
                  </Tooltip>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  color={STATUS_COLOR[cat.status]}
                  value={pctOfAllocated(cat.forecastTotal, cat.allocatedAmount)}
                  sx={{ height: 8, borderRadius: 1 }}
                />
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
