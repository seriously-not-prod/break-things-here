/**
 * ConflictResolutionPanel — Story #954
 *
 * Renders AI-generated advisory suggestions for each detected timeline conflict.
 * All suggestions are review-only; NO changes are auto-applied.
 *
 * The advisory disclaimer is permanently visible to ensure users understand
 * that all suggestions require independent evaluation before any scheduling
 * change is made.
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
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import InfoOutlinedRounded from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import {
  fetchConflictResolutionSuggestions,
  type ConflictResolutionResponse,
  type ConflictResolutionSuggestion,
} from '../../services/timeline-conflict-resolution-service';

interface ConflictResolutionPanelProps {
  eventId: number;
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case 'overlap':
      return 'Time Overlap';
    case 'adjacent_no_buffer':
      return 'Insufficient Buffer';
    case 'resource_double_book':
      return 'Resource Double-Booking';
    case 'sort_dependency':
      return 'Sort Order Conflict';
    default:
      return reason;
  }
}

function reasonColor(
  reason: string,
): 'error' | 'warning' | 'default' {
  if (reason === 'overlap' || reason === 'resource_double_book') return 'error';
  if (reason === 'adjacent_no_buffer' || reason === 'sort_dependency') return 'warning';
  return 'default';
}

interface SuggestionCardProps {
  suggestion: ConflictResolutionSuggestion;
}

function SuggestionCard({ suggestion }: SuggestionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2 }}
      aria-label={`Conflict resolution suggestion for ${suggestion.activityATitle} and ${suggestion.activityBTitle}`}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            label={reasonLabel(suggestion.reason)}
            color={reasonColor(suggestion.reason)}
            size="small"
            icon={<WarningAmberRounded />}
          />
          <Typography variant="body2" fontWeight={600}>
            {suggestion.activityATitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ↔
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {suggestion.activityBTitle}
          </Typography>
        </Stack>

        <Typography variant="body2">{suggestion.suggestion}</Typography>

        {suggestion.alternativeSlots.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              Alternative slots:
            </Typography>
            {suggestion.alternativeSlots.map((slot) => (
              <Chip key={slot} label={slot} size="small" variant="outlined" />
            ))}
          </Stack>
        )}

        <Button
          size="small"
          endIcon={expanded ? <ExpandLessRounded /> : <ExpandMoreRounded />}
          onClick={() => setExpanded((v) => !v)}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', p: 0 }}
          aria-expanded={expanded}
          aria-controls={`impact-${suggestion.conflictId}`}
        >
          {expanded ? 'Hide impact notes' : 'Show impact notes'}
        </Button>

        <Collapse in={expanded} id={`impact-${suggestion.conflictId}`}>
          <Stack spacing={1} pt={0.5}>
            {suggestion.dependencyImpact && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Dependency impact
                </Typography>
                <Typography variant="body2">{suggestion.dependencyImpact}</Typography>
              </Box>
            )}
            {suggestion.resourceImpact && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Resource impact
                </Typography>
                <Typography variant="body2">{suggestion.resourceImpact}</Typography>
              </Box>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}

export function ConflictResolutionPanel({ eventId }: ConflictResolutionPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConflictResolutionResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchConflictResolutionSuggestions({
        eventId,
        prompt: prompt.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box component="section" aria-label="AI Conflict Resolution Suggestions">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AutoAwesomeRounded color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>
            AI Conflict Resolution Suggestions
          </Typography>
          <Tooltip
            title="AI-generated advisory suggestions grounded in real timeline data. No changes are applied automatically."
            placement="right"
          >
            <InfoOutlinedRounded fontSize="small" color="action" aria-label="Information" />
          </Tooltip>
        </Stack>

        <Alert severity="info" icon={<InfoOutlinedRounded fontSize="small" />}>
          Suggestions are <strong>advisory only</strong>. Review each proposal carefully before
          making any scheduling changes. No changes are applied automatically.
        </Alert>

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={1.5}>
            <TextField
              label="Optional guidance (e.g. 'prioritise Stage 1 activities')"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              size="small"
              fullWidth
              multiline
              maxRows={3}
              inputProps={{ maxLength: 500, 'aria-label': 'Optional guidance for AI suggestions' }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : <AutoAwesomeRounded />}
              sx={{ alignSelf: 'flex-start' }}
            >
              {loading ? 'Analysing conflicts…' : 'Get Resolution Suggestions'}
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {result && (
          <Stack spacing={2}>
            {result.conflictCount === 0 ? (
              <Alert severity="success">
                No timeline conflicts detected. Your schedule looks clean!
              </Alert>
            ) : (
              <>
                {result.summary && (
                  <Typography variant="body2" color="text.secondary">
                    {result.summary}
                  </Typography>
                )}

                <Typography variant="caption" color="text.secondary">
                  {result.conflictCount} conflict{result.conflictCount !== 1 ? 's' : ''} detected
                  across {result.contextSummary.activityCount} activit
                  {result.contextSummary.activityCount !== 1 ? 'ies' : 'y'}
                </Typography>

                <Stack spacing={1.5}>
                  {result.suggestions.map((s) => (
                    <SuggestionCard key={s.conflictId} suggestion={s} />
                  ))}
                  {result.suggestions.length === 0 && (
                    <Alert severity="warning">
                      Conflicts were detected but no suggestions could be generated. Check the
                      timeline data and try again.
                    </Alert>
                  )}
                </Stack>

                <Divider />
              </>
            )}

            <Alert
              severity="warning"
              icon={<InfoOutlinedRounded fontSize="small" />}
              aria-live="polite"
            >
              <Typography variant="caption">{result.advisoryLabel}</Typography>
            </Alert>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
