/**
 * Overspend Banner — #802
 *
 * Renders an in-page Alert when any budget category crosses the configured
 * threshold (percent of allocated spent). The threshold is per-event and
 * editable inline. The banner auto-clears when no category remains above
 * threshold, and emits a `notification` (best-effort) so client subscribers
 * can react.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import type { BudgetCategory } from '../../services/budget-service';
import { setOverspendThreshold } from '../../services/budget-service';

interface Props {
  eventId: number | string;
  categories: BudgetCategory[];
  thresholdPercent: number;
  onThresholdChange?: (value: number) => void;
}

interface OverspendRow {
  category: BudgetCategory;
  percentUsed: number;
}

export default function OverspendBanner({
  eventId,
  categories,
  thresholdPercent,
  onThresholdChange,
}: Props): JSX.Element | null {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(thresholdPercent));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(thresholdPercent));
  }, [thresholdPercent]);

  const overspend = useMemo<OverspendRow[]>(() => {
    return categories
      .filter((c) => c.allocated_amount > 0)
      .map((c) => ({
        category: c,
        percentUsed: (c.spent / c.allocated_amount) * 100,
      }))
      .filter((row) => row.percentUsed >= thresholdPercent)
      .sort((a, b) => b.percentUsed - a.percentUsed);
  }, [categories, thresholdPercent]);

  useEffect(() => {
    if (overspend.length === 0) return;
    // Best-effort browser notification — guarded by feature detection so
    // headless tests / unsupported browsers don't throw.
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('budget:overspend', {
          detail: {
            eventId,
            thresholdPercent,
            categories: overspend.map((row) => ({
              id: row.category.id,
              name: row.category.name,
              percentUsed: Math.round(row.percentUsed),
            })),
          },
        }),
      );
    }
  }, [overspend, thresholdPercent, eventId]);

  const handleSave = async (): Promise<void> => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 200) return;
    setSaving(true);
    try {
      const saved = await setOverspendThreshold(eventId, parsed);
      onThresholdChange?.(saved);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (overspend.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Tooltip title="Configure overspend alert threshold">
          <Button
            size="small"
            variant="text"
            startIcon={<SettingsRounded />}
            onClick={() => setEditing((v) => !v)}
            data-testid="overspend-threshold-toggle"
          >
            Threshold {thresholdPercent}%
          </Button>
        </Tooltip>
        {editing && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 1 }}>
            <TextField
              size="small"
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              inputProps={{
                min: 1,
                max: 200,
                step: 1,
                'aria-label': 'Overspend threshold percent',
              }}
              sx={{ width: 100 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              Save
            </Button>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 2 }} data-testid="overspend-banner">
      <Alert
        severity="warning"
        role="alert"
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Adjust threshold">
              <IconButton
                size="small"
                onClick={() => setEditing((v) => !v)}
                aria-label="Edit overspend threshold"
              >
                <SettingsRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        }
      >
        <AlertTitle>Overspend alert</AlertTitle>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {overspend.length === 1
            ? `1 category has crossed ${thresholdPercent}% of its allocation.`
            : `${overspend.length} categories have crossed ${thresholdPercent}% of their allocation.`}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {overspend.map((row) => (
            <Chip
              key={row.category.id}
              size="small"
              color="warning"
              variant="filled"
              label={`${row.category.name} — ${Math.round(row.percentUsed)}%`}
              data-testid={`overspend-chip-${row.category.id}`}
            />
          ))}
        </Stack>

        {editing && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
            <TextField
              size="small"
              type="number"
              label="Threshold %"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              inputProps={{
                min: 1,
                max: 200,
                step: 1,
                'aria-label': 'Overspend threshold percent',
              }}
              sx={{ width: 140 }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              Save
            </Button>
            <Button size="small" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </Stack>
        )}
      </Alert>
    </Box>
  );
}
