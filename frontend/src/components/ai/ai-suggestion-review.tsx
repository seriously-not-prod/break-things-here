/**
 * AI Suggestion Review Panel — Human-in-the-Loop Apply Flow (#965).
 *
 * Renders an AI suggestion in a review card that exposes three actions:
 *   - Accept   — applies the suggestion as-is via POST /api/ai/apply
 *   - Edit & Apply — lets the user modify the suggestion text then applies
 *   - Reject   — dismisses the suggestion (no server call)
 *
 * Applied suggestions are persisted with actor ID and server-side timestamp
 * for audit traceability.  Rollback is available for each applied record via
 * DELETE /api/ai/apply/:id.
 *
 * Usage:
 * ```tsx
 * <AiSuggestionReview
 *   workflowType="event"
 *   entityId={selectedEvent.id}
 *   suggestionContent={workflowResult.raw}
 *   onReject={() => setWorkflowResult(null)}
 * />
 * ```
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircleOutlineRounded,
  DeleteOutlineRounded,
  EditOutlined,
  UndoRounded,
} from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiAppliedRecord {
  id: number;
  userId: number;
  workflowType: string;
  entityId: number | null;
  suggestionContent: string;
  note: string | null;
  appliedAt: string;
}

export interface AiSuggestionReviewProps {
  /** Originating workflow context (e.g. 'event', 'task', 'rsvp', 'general'). */
  workflowType: string;
  /** Entity the suggestion refers to. Null for general / chat context. */
  entityId: number | null;
  /** The full suggestion text to review. */
  suggestionContent: string;
  /** Optional user-visible label for the suggestion type. */
  label?: string;
  /** Called when the user dismisses/rejects the suggestion. */
  onReject: () => void;
  /** Called after a successful apply with the returned audit record. */
  onApplied?: (record: AiAppliedRecord) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AiSuggestionReview({
  workflowType,
  entityId,
  suggestionContent,
  label,
  onReject,
  onApplied,
}: AiSuggestionReviewProps): JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState(suggestionContent);
  const [applying, setApplying] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [appliedRecord, setAppliedRecord] = useState<AiAppliedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollbackDone, setRollbackDone] = useState(false);

  // ── Apply ────────────────────────────────────────────────────────────────

  async function handleApply(content: string): Promise<void> {
    setApplying(true);
    setError(null);
    try {
      const record = await api.post<AiAppliedRecord>('/api/ai/apply', {
        workflowType,
        entityId,
        suggestionContent: content,
        note: editMode ? 'applied with user edits' : undefined,
      });
      setAppliedRecord(record);
      setEditMode(false);
      onApplied?.(record);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('You do not have permission to apply AI suggestions.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to apply suggestion.');
      }
    } finally {
      setApplying(false);
    }
  }

  // ── Rollback ─────────────────────────────────────────────────────────────

  async function handleRollback(): Promise<void> {
    if (!appliedRecord) return;
    setRollingBack(true);
    setError(null);
    try {
      await api.delete(`/api/ai/apply/${appliedRecord.id}`);
      setAppliedRecord(null);
      setRollbackDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to roll back suggestion.');
    } finally {
      setRollingBack(false);
    }
  }

  // ── Post-rollback state ───────────────────────────────────────────────────

  if (rollbackDone) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        Suggestion rolled back. No changes were applied.
      </Alert>
    );
  }

  // ── Applied confirmation ──────────────────────────────────────────────────

  if (appliedRecord) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: 'success.light',
          borderRadius: 2,
          p: 1.5,
          bgcolor: 'success.50',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={0.5}>
          <Stack direction="row" alignItems="center" gap={0.5}>
            <CheckCircleOutlineRounded color="success" fontSize="small" />
            <Typography variant="caption" color="success.main" fontWeight={700}>
              Suggestion applied
            </Typography>
          </Stack>
          <Chip
            label={new Date(appliedRecord.appliedAt).toLocaleTimeString()}
            size="small"
            variant="outlined"
            color="success"
          />
        </Stack>
        {appliedRecord.note && (
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            {appliedRecord.note}
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled" display="block" mb={1}>
          Audit ID: #{appliedRecord.id} · Applied by user #{appliedRecord.userId}
        </Typography>
        <Tooltip title="Undo: remove this applied suggestion record">
          <span>
            <Button
              size="small"
              startIcon={rollingBack ? <CircularProgress size={14} /> : <UndoRounded />}
              onClick={handleRollback}
              disabled={rollingBack}
              color="warning"
              variant="outlined"
            >
              {rollingBack ? 'Rolling back…' : 'Roll back'}
            </Button>
          </span>
        </Tooltip>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </Box>
    );
  }

  // ── Review panel ─────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'primary.light',
        borderRadius: 2,
        p: 1.5,
        bgcolor: 'primary.50',
      }}
      aria-label="AI suggestion review panel"
    >
      <Typography variant="caption" color="primary" fontWeight={700} display="block" mb={0.5}>
        {label ?? 'AI Suggestion — Review before applying'}
      </Typography>

      {/* Suggestion content (read-only or editable) */}
      <Collapse in={!editMode}>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>
          {suggestionContent}
        </Typography>
      </Collapse>

      <Collapse in={editMode}>
        <TextField
          multiline
          minRows={3}
          maxRows={10}
          fullWidth
          size="small"
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          label="Edit suggestion before applying"
          sx={{ mb: 1 }}
          inputProps={{ 'aria-label': 'Edit AI suggestion content' }}
        />
      </Collapse>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {/* Action row */}
      <Stack direction="row" gap={1} flexWrap="wrap">
        {/* Accept */}
        <Tooltip title="Apply this suggestion as-is">
          <span>
            <Button
              size="small"
              variant="contained"
              color="primary"
              startIcon={applying ? <CircularProgress size={14} /> : <CheckCircleOutlineRounded />}
              onClick={() => handleApply(editMode ? editedContent : suggestionContent)}
              disabled={applying || (editMode && !editedContent.trim())}
              aria-label="Accept and apply AI suggestion"
            >
              {applying ? 'Applying…' : 'Accept'}
            </Button>
          </span>
        </Tooltip>

        {/* Edit & Apply toggle */}
        {!editMode ? (
          <Tooltip title="Edit suggestion before applying">
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditOutlined />}
              onClick={() => setEditMode(true)}
              disabled={applying}
              aria-label="Edit AI suggestion before applying"
            >
              Edit & Apply
            </Button>
          </Tooltip>
        ) : (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setEditMode(false);
              setEditedContent(suggestionContent);
            }}
            disabled={applying}
          >
            Cancel edit
          </Button>
        )}

        {/* Reject */}
        <Tooltip title="Dismiss this suggestion without applying">
          <IconButton
            size="small"
            color="default"
            onClick={onReject}
            disabled={applying}
            aria-label="Reject AI suggestion"
          >
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}
