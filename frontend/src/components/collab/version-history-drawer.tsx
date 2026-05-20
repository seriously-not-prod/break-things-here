/**
 * Version-history rollback drawer — task #807.
 *
 * Reusable MUI Drawer that lists historic versions for the supplied
 * entity (event / budget proxy / task) with a paginated list (limit 50,
 * "Load more" beyond that) and a Restore action gated by a confirm
 * dialog. The rollback call already records an audit entry server-side
 * (entity-versions-controller), so this component is read-mostly.
 *
 * Focus management: when opened, focus moves to the close button. On
 * close, focus returns to the trigger that opened the drawer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import {
  type EntityVersion,
  type VersionedEntityType,
  listEntityVersions,
  rollbackEntityVersion,
} from '../../services/entity-versions-service';

interface Props {
  open: boolean;
  eventId: number | string;
  entityType: VersionedEntityType;
  entityId: number | string;
  title?: string;
  onClose: () => void;
  /** Called after a successful rollback so the parent can refresh state. */
  onRolledBack?: () => void;
}

const PAGE_SIZE = 50;

export default function VersionHistoryDrawer({
  open,
  eventId,
  entityType,
  entityId,
  title,
  onClose,
  onRolledBack,
}: Props): JSX.Element {
  const [versions, setVersions] = useState<EntityVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<EntityVersion | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listEntityVersions(Number(eventId), Number(entityId), entityType);
      setVersions(list);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history.');
    } finally {
      setLoading(false);
    }
  }, [open, eventId, entityId, entityType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const visible = useMemo(() => versions.slice(0, visibleCount), [versions, visibleCount]);

  const handleConfirmRestore = async (): Promise<void> => {
    if (!pendingRestore) return;
    setRollingBack(true);
    setError(null);
    try {
      await rollbackEntityVersion(Number(eventId), Number(entityId), entityType, pendingRestore.id);
      setPendingRestore(null);
      onRolledBack?.();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 420 } },
        'aria-label': 'Version history drawer',
      }}
      data-testid="version-history-drawer"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', p: 2 }}>
        <HistoryRounded color="primary" />
        <Typography variant="h6" sx={{ flex: 1, ml: 1 }}>
          Version history{title ? ` — ${title}` : ''}
        </Typography>
        <IconButton ref={closeButtonRef} onClick={onClose} aria-label="Close version history">
          <CloseRounded />
        </IconButton>
      </Box>
      <Divider />

      <Box sx={{ p: 2, flex: 1, overflowY: 'auto' }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        ) : versions.length === 0 ? (
          <Typography color="text.secondary">
            No version history yet for this {entityType.replace('_', ' ')}.
          </Typography>
        ) : (
          <>
            <List dense disablePadding>
              {visible.map((v, idx) => (
                <ListItem
                  key={v.id}
                  data-testid={`version-row-${v.id}`}
                  sx={{
                    alignItems: 'flex-start',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    py: 1.25,
                  }}
                  secondaryAction={
                    idx === 0 ? (
                      <Chip label="Current" color="success" size="small" />
                    ) : (
                      <Button
                        size="small"
                        startIcon={<RestoreRounded />}
                        onClick={() => setPendingRestore(v)}
                        data-testid={`version-restore-${v.id}`}
                      >
                        Restore
                      </Button>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle2" fontWeight={600}>
                          v{v.version}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {v.changed_by_name ?? 'Unknown'} ·{' '}
                          {new Date(v.created_at).toLocaleString()}
                        </Typography>
                      </Stack>
                    }
                    secondary={v.change_note ? <em>{v.change_note}</em> : undefined}
                  />
                </ListItem>
              ))}
            </List>
            {visibleCount < versions.length && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  data-testid="version-load-more"
                >
                  Load more ({versions.length - visibleCount} remaining)
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Confirm restore dialog — AC requires explicit confirmation. */}
      <Dialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        aria-labelledby="rollback-confirm-title"
      >
        <DialogTitle id="rollback-confirm-title">Restore this version?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Restoring v{pendingRestore?.version} will overwrite the current state and record a new
            version. This action is reversible by restoring again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRestore(null)} disabled={rollingBack}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirmRestore()}
            variant="contained"
            color="warning"
            disabled={rollingBack}
            data-testid="version-restore-confirm"
            startIcon={
              rollingBack ? <CircularProgress size={14} color="inherit" /> : <RestoreRounded />
            }
          >
            {rollingBack ? 'Restoring…' : 'Restore'}
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
}
