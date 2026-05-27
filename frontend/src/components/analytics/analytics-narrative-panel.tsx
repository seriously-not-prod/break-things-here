/**
 * Analytics Narrative Panel — Story #955
 *
 * Displays an AI-generated narrative summary for an event's analytics,
 * grounded in live metrics including trend direction, notable changes,
 * and suggested actions.  Falls back gracefully when AI is not configured
 * or data is sparse.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded';
import {
  fetchAnalyticsNarrative,
  type AnalyticsNarrativeResponse,
  type NarrativeTrendDirection,
} from '../../services/analytics-narrative-service';

interface AnalyticsNarrativePanelProps {
  eventId: string | number;
  /** Comparison window in days (1–90). Defaults to 7. */
  windowDays?: number;
}

function TrendIcon({ direction }: { direction: NarrativeTrendDirection }): JSX.Element {
  if (direction === 'up') {
    return <TrendingUpRounded fontSize="small" color="success" />;
  }
  if (direction === 'down') {
    return <TrendingDownRounded fontSize="small" color="error" />;
  }
  return <TrendingFlatRounded fontSize="small" color="action" />;
}

function trendLabel(direction: NarrativeTrendDirection): string {
  if (direction === 'up') return 'Improving';
  if (direction === 'down') return 'Declining';
  return 'Stable';
}

function trendColor(direction: NarrativeTrendDirection): 'success' | 'error' | 'default' {
  if (direction === 'up') return 'success';
  if (direction === 'down') return 'error';
  return 'default';
}

export function AnalyticsNarrativePanel({
  eventId,
  windowDays = 7,
}: AnalyticsNarrativePanelProps): JSX.Element {
  const [result, setResult] = useState<AnalyticsNarrativeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [expanded, setExpanded] = useState(false);

  async function handleGenerate(): Promise<void> {
    const numericId = typeof eventId === 'string' ? parseInt(eventId, 10) : eventId;
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid event ID.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetchAnalyticsNarrative({
        eventId: numericId,
        windowDays,
        prompt: prompt.trim() !== '' ? prompt.trim() : undefined,
      });
      setResult(response);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate narrative.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <TextField
          label="Optional focus (e.g. 'highlight RSVP trends')"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          size="small"
          fullWidth
          inputProps={{ maxLength: 500 }}
          disabled={loading}
          aria-label="Optional organiser focus for the narrative"
        />
        <Button
          variant="contained"
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRounded />
          }
          onClick={() => void handleGenerate()}
          disabled={loading}
          aria-label="Generate AI analytics narrative"
          sx={{ whiteSpace: 'nowrap', minWidth: 160 }}
        >
          {loading ? 'Generating…' : 'Generate Summary'}
        </Button>
      </Stack>

      {error !== null && (
        <Alert severity={error.toLowerCase().includes('not configured') ? 'info' : 'error'}>
          {error}
        </Alert>
      )}

      {result !== null && (
        <Box>
          {/* Headline + trend chip */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <TrendIcon direction={result.trendDirection} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1 }}>
              {result.headline}
            </Typography>
            <Tooltip
              title={`Trend direction: ${trendLabel(result.trendDirection)}`}
              placement="top"
            >
              <Chip
                label={trendLabel(result.trendDirection)}
                color={trendColor(result.trendDirection)}
                size="small"
              />
            </Tooltip>
            {result.dataQuality === 'sparse' && (
              <Tooltip
                title="Limited data is available for this event. The narrative has reduced scope."
                placement="top"
              >
                <Chip label="Sparse data" color="warning" size="small" variant="outlined" />
              </Tooltip>
            )}
          </Stack>

          {/* Summary */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {result.summary}
          </Typography>

          {/* Notable changes */}
          {result.notableChanges.length > 0 && (
            <>
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Notable Changes
              </Typography>
              <List dense disablePadding sx={{ mb: 1 }}>
                {result.notableChanges.map((change, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                    <ListItemText primary={change} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {/* Suggested actions */}
          {result.suggestedActions.length > 0 && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Suggested Actions
              </Typography>
              <List dense disablePadding>
                {result.suggestedActions.map((action, i) => (
                  <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                    <ListItemText primary={action} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {/* Context footer */}
          <Collapse in={expanded}>
            <Divider sx={{ my: 1 }} />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.disabled">
                Window: {result.contextSummary.windowDays}d
              </Typography>
              <Typography variant="caption" color="text.disabled">
                ·
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Prior period: {result.contextSummary.priorPeriodGrounded ? 'available' : 'none'}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                ·
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                onClick={() => setExpanded(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setExpanded(false);
                }}
                aria-label="Collapse context details"
              >
                Hide details
              </Typography>
            </Stack>
          </Collapse>

          {!expanded && (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
              onClick={() => setExpanded(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setExpanded(true);
              }}
              aria-label="Show context details"
            >
              Show details
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  );
}
