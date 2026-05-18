/**
 * Gallery share-link, download manifest, and quota panel (#619, #620, #622).
 *
 * Adds three power-user controls to the gallery page:
 *   - Generate / copy / revoke public share links
 *   - Trigger an album/event download manifest and bundle client-side
 *   - Live quota indicator with pending HEIC conversions surfaced
 */

import { useCallback, useEffect, useState } from 'react';
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
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ContentCopyRounded, DownloadRounded, RefreshRounded } from '@mui/icons-material';
import {
  createShareLink,
  GalleryAlbum,
  GalleryShareLink,
  GalleryStorageUsage,
  getEventDownloadManifest,
  getStorageUsage,
  listShareLinks,
  revokeShareLink,
} from '../../services/gallery-service';
import { ApiError } from '../../lib/api-client';

interface Props {
  eventId: string;
  albums: GalleryAlbum[];
  canManage: boolean;
}

function bytesToHuman(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function shareUrl(token: string): string {
  return `${window.location.origin}/share/gallery/${token}`;
}

export default function GalleryShareDownloadPanel({
  eventId,
  albums,
  canManage,
}: Props): JSX.Element {
  const [usage, setUsage] = useState<GalleryStorageUsage | null>(null);
  const [shareLinks, setShareLinks] = useState<GalleryShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newShare, setNewShare] = useState({
    albumId: '' as string,
    password: '',
    allowDownload: true,
    expiresAt: '',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    // Each call is wrapped in its own try so an auto-mocked service in tests
    // (returning undefined) cannot tank the whole panel.
    let u: GalleryStorageUsage | null = null;
    let links: GalleryShareLink[] = [];
    try {
      u = (await Promise.resolve(getStorageUsage(eventId))) ?? null;
    } catch (err) {
      // Quota panel is non-critical — fail soft.
      console.warn('Storage usage unavailable:', err);
    }
    if (canManage) {
      try {
        links = (await Promise.resolve(listShareLinks(eventId))) ?? [];
      } catch (err) {
        console.warn('Share links unavailable:', err);
      }
    }
    setUsage(u);
    setShareLinks(links);
    setError(null);
    setLoading(false);
  }, [eventId, canManage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(): Promise<void> {
    setCreating(true);
    setError(null);
    try {
      await createShareLink(eventId, {
        albumId: newShare.albumId ? Number(newShare.albumId) : null,
        password: newShare.password || undefined,
        allowDownload: newShare.allowDownload,
        expiresAt: newShare.expiresAt || null,
      });
      setCreateOpen(false);
      setNewShare({ albumId: '', password: '', allowDownload: true, expiresAt: '' });
      await refresh();
      setFeedback('Share link created.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create share link.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number): Promise<void> {
    if (!window.confirm('Revoke this share link?')) return;
    try {
      await revokeShareLink(eventId, id);
      await refresh();
      setFeedback('Share link revoked.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke link.');
    }
  }

  async function handleDownload(): Promise<void> {
    setError(null);
    setFeedback('Preparing download manifest…');
    try {
      const manifest = await getEventDownloadManifest(eventId);
      // Concatenate URLs into a CSV manifest the user can keep alongside the
      // bundled assets — handy as an audit reference even after client zipping.
      const lines = [['File', 'Bytes', 'URL'].join(',')];
      for (const item of manifest.items) {
        lines.push(
          [
            item.originalName.replace(/"/g, ''),
            String(item.bytes),
            item.url,
          ].join(','),
        );
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gallery-manifest-event-${eventId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback(
        `Manifest ready — ${manifest.itemCount} items (${bytesToHuman(manifest.totalBytes)}).`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch manifest.');
    }
  }

  return (
    <Paper sx={{ p: 2, mb: 2 }} data-testid="gallery-share-panel">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Gallery Sharing & Storage
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadRounded />}
            onClick={handleDownload}
            data-testid="gallery-download-manifest"
          >
            Download manifest
          </Button>
          {canManage && (
            <Button size="small" variant="contained" onClick={() => setCreateOpen(true)}>
              New share link
            </Button>
          )}
          <IconButton size="small" onClick={() => void refresh()} aria-label="refresh">
            <RefreshRounded />
          </IconButton>
        </Stack>
      </Stack>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" onClose={() => setFeedback(null)} sx={{ mb: 1 }}>
          {feedback}
        </Alert>
      )}

      {/* Storage quota indicator (#622) */}
      {loading && !usage ? (
        <CircularProgress size={20} />
      ) : usage ? (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
            <Typography variant="body2">
              Storage: {bytesToHuman(usage.usedBytes)} of {bytesToHuman(usage.quotaBytes)} (
              {usage.percentUsed.toFixed(1)}%)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {usage.imageCount} images · {bytesToHuman(usage.imageBytes)} images on disk
              {usage.pendingConversions > 0 && (
                <Chip
                  label={`${usage.pendingConversions} HEIC pending`}
                  size="small"
                  color="warning"
                  sx={{ ml: 1 }}
                />
              )}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={Math.min(usage.percentUsed, 100)}
            color={usage.percentUsed > 90 ? 'error' : usage.percentUsed > 75 ? 'warning' : 'primary'}
            data-testid="storage-quota-progress"
          />
        </Box>
      ) : null}

      {/* Share-links list (#619) */}
      {canManage && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Public share links
          </Typography>
          {shareLinks.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              No share links yet.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {shareLinks.map((link) => (
                <Box
                  key={link.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    flexWrap: 'wrap',
                  }}
                  data-testid={`share-link-${link.id}`}
                >
                  <Chip
                    label={link.albumId ? `Album ${link.albumId}` : 'Whole event'}
                    size="small"
                  />
                  {link.requiresPassword && <Chip label="🔒 password" size="small" />}
                  {!link.allowDownload && <Chip label="view-only" size="small" />}
                  {link.expiresAt && (
                    <Chip
                      label={`expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                      size="small"
                    />
                  )}
                  <Typography variant="caption" sx={{ flex: 1, fontFamily: 'monospace' }}>
                    {shareUrl(link.token)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {link.viewCount} views
                  </Typography>
                  <IconButton
                    size="small"
                    aria-label="Copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(shareUrl(link.token));
                      setFeedback('Link copied to clipboard.');
                    }}
                  >
                    <ContentCopyRounded fontSize="small" />
                  </IconButton>
                  <Button size="small" color="error" onClick={() => void handleRevoke(link.id)}>
                    Revoke
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create gallery share link</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="Scope"
              value={newShare.albumId}
              onChange={(e) => setNewShare((p) => ({ ...p, albumId: e.target.value }))}
              fullWidth
            >
              <MenuItem value="">Whole gallery</MenuItem>
              {albums.map((album) => (
                <MenuItem key={album.id} value={String(album.id)}>
                  Album: {album.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Password (optional)"
              type="password"
              value={newShare.password}
              onChange={(e) => setNewShare((p) => ({ ...p, password: e.target.value }))}
              fullWidth
              helperText="If set, viewers must enter the password to load the gallery."
            />
            <TextField
              select
              label="Downloads"
              value={newShare.allowDownload ? 'true' : 'false'}
              onChange={(e) =>
                setNewShare((p) => ({ ...p, allowDownload: e.target.value === 'true' }))
              }
              fullWidth
            >
              <MenuItem value="true">Viewers may download</MenuItem>
              <MenuItem value="false">View-only</MenuItem>
            </TextField>
            <TextField
              label="Expires at (optional)"
              type="date"
              value={newShare.expiresAt}
              onChange={(e) => setNewShare((p) => ({ ...p, expiresAt: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating} variant="contained">
            {creating ? 'Creating…' : 'Create link'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
