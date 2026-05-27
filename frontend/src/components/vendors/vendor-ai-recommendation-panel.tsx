/**
 * Vendor AI Recommendation Panel — Story #953
 *
 * Displays AI-powered vendor recommendations grounded in live event/vendor data.
 * Recommendations are explicitly labelled as advisory-only with transparent
 * scoring criteria.  The advisory label is always visible.
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  fetchVendorRecommendation,
  VendorRecommendationItem,
  VendorRecommendationResponse,
} from '../../services/vendor-ai-recommendation-service';

interface Props {
  eventId: number | string;
}

const SCORE_COLOR = (score: number): 'success' | 'warning' | 'error' | 'default' => {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  if (score >= 25) return 'error';
  return 'default';
};

function VendorRecommendationCard({ item }: { item: VendorRecommendationItem }): JSX.Element {
  const scoreColor = SCORE_COLOR(item.score);

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            label={`#${item.rank}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700, minWidth: 36 }}
          />
          <Typography variant="subtitle2" fontWeight={700}>
            {item.vendorName}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Score:
          </Typography>
          <Chip label={`${item.score}/100`} size="small" color={scoreColor} />
        </Stack>
      </Stack>

      <Box mb={1}>
        <LinearProgress
          variant="determinate"
          value={item.score}
          color={scoreColor === 'default' ? 'inherit' : scoreColor}
          sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
          aria-label={`Advisory score: ${item.score} out of 100`}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" mb={1}>
        {item.rationale}
      </Typography>

      {item.strengths.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5} mb={0.5}>
          {item.strengths.map((s, i) => (
            <Chip key={i} label={s} size="small" color="success" variant="outlined" />
          ))}
        </Stack>
      )}

      {item.concerns.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {item.concerns.map((c, i) => (
            <Chip key={i} label={c} size="small" color="warning" variant="outlined" />
          ))}
        </Stack>
      )}
    </Paper>
  );
}

export default function VendorAiRecommendationPanel({ eventId }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VendorRecommendationResponse | null>(null);

  const parsedEventId = typeof eventId === 'string' ? parseInt(eventId, 10) : eventId;

  const handleRequest = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchVendorRecommendation({
        eventId: parsedEventId,
        prompt: prompt.trim() || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vendor recommendation request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" mb={1}>
        <AutoAwesomeRoundedIcon color="primary" fontSize="small" />
        <Typography variant="h6">AI Vendor Recommendations</Typography>
      </Stack>

      <Alert icon={<InfoOutlinedIcon fontSize="inherit" />} severity="info" sx={{ mb: 2 }}>
        <strong>Advisory only.</strong> Recommendations are generated from available vendor data
        only. Verify all information independently before making contracting decisions.
      </Alert>

      <Stack direction="row" spacing={1} mb={2}>
        <TextField
          size="small"
          fullWidth
          placeholder="Optional: focus area (e.g. 'prioritise by value for money')"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          inputProps={{ maxLength: 500, 'aria-label': 'Optional recommendation prompt' }}
          disabled={loading}
        />
        <Button
          variant="contained"
          onClick={() => void handleRequest()}
          disabled={loading}
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeRoundedIcon />
          }
          sx={{ whiteSpace: 'nowrap' }}
        >
          {loading ? 'Analysing…' : 'Get Recommendations'}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Box>
          {result.summary && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              {result.summary}
            </Typography>
          )}

          <Stack spacing={1.5} mb={2}>
            {result.recommendations.length > 0 ? (
              result.recommendations.map((item) => (
                <VendorRecommendationCard key={item.vendorId} item={item} />
              ))
            ) : (
              <Alert severity="warning">
                No ranked recommendations could be generated from the available vendor data.
              </Alert>
            )}
          </Stack>

          <Divider sx={{ mb: 1 }} />

          <Stack direction="row" spacing={0.5} alignItems="flex-start">
            <InfoOutlinedIcon
              fontSize="inherit"
              sx={{ color: 'text.disabled', mt: '2px', flexShrink: 0 }}
            />
            <Typography variant="caption" color="text.disabled">
              {result.advisoryLabel}
            </Typography>
          </Stack>

          <Typography variant="caption" color="text.disabled" display="block" mt={0.5}>
            Grounded on: {result.contextSummary.groundedFields.join(', ')} (
            {result.contextSummary.vendorCount} vendor
            {result.contextSummary.vendorCount !== 1 ? 's' : ''})
          </Typography>
        </Box>
      )}
    </Box>
  );
}
