import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddPhotoAlternateRounded,
  DeleteRounded,
  EditRounded,
  PhotoLibraryRounded,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api-client';
import {
  deleteGalleryItem,
  listGallery,
  updateGalleryCaption,
  type GalleryItem,
} from '../../services/gallery-service';
import { MediaPreviewDialog } from './media-preview-dialog';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function GalleryPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<GalleryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Caption edit state
  const [captionTarget, setCaptionTarget] = useState<GalleryItem | null>(null);
  const [captionDraft, setCaptionDraft] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    listGallery(eventId)
      .then((data) => setItems(data))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load gallery'),
      )
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file || !eventId) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('document', file);

      const res = await apiFetch(`/api/events/${eventId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? 'Upload failed');
      }

      const refreshed = await listGallery(eventId);
      setItems(refreshed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }

  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget || !eventId) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteGalleryItem(eventId, deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function openCaptionEdit(item: GalleryItem): void {
    setCaptionTarget(item);
    setCaptionDraft(item.caption);
  }

  async function handleCaptionSave(): Promise<void> {
    if (!captionTarget || !eventId) return;
    setSavingCaption(true);
    setError(null);
    try {
      const updated = await updateGalleryCaption(eventId, captionTarget.id, captionDraft);
      setItems((prev) =>
        prev.map((i) => (i.id === updated.id ? { ...i, caption: updated.caption } : i)),
      );
      setCaptionTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save caption');
    } finally {
      setSavingCaption(false);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PhotoLibraryRounded color="primary" />
          <Typography variant="h5" fontWeight={700}>
            Gallery
          </Typography>
          {!loading && (
            <Typography variant="body2" color="text.secondary">
              ({items.length} {items.length === 1 ? 'image' : 'images'})
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          startIcon={<AddPhotoAlternateRounded />}
          component="label"
          disabled={uploading}
          aria-label="Upload image"
        >
          {uploading ? 'Uploading…' : 'Upload Image'}
          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => void handleUpload(e)}
          />
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && (
        <ImageList variant="masonry" cols={3} gap={8}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ImageListItem key={i}>
              <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {!loading && items.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 8,
            gap: 2,
            color: 'text.secondary',
          }}
          role="status"
          aria-label="Empty gallery"
        >
          <PhotoLibraryRounded sx={{ fontSize: 56, opacity: 0.3 }} />
          <Typography variant="h6">No images yet</Typography>
          <Typography variant="body2">Upload images to see them here.</Typography>
        </Box>
      )}

      {!loading && items.length > 0 && (
        <ImageList variant="masonry" cols={3} gap={8} aria-label="Event gallery">
          {items.map((item, index) => (
            <ImageListItem
              key={item.id}
              sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden', position: 'relative' }}
            >
              <img
                src={`${API_BASE}${item.url}`}
                alt={item.originalName}
                loading="lazy"
                style={{ display: 'block', width: '100%', borderRadius: 4 }}
                onClick={() => setPreviewIndex(index)}
                role="button"
                tabIndex={0}
                aria-label={`Open preview for ${item.originalName}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPreviewIndex(index);
                  }
                }}
              />
              <ImageListItemBar
                title={item.caption || item.originalName}
                subtitle={item.caption ? item.originalName : undefined}
                actionIcon={
                  <Box sx={{ display: 'flex', gap: 0.5, pr: 0.5 }}>
                    <Tooltip title="Edit caption">
                      <IconButton
                        size="small"
                        aria-label={`Edit caption for ${item.originalName}`}
                        sx={{ color: 'rgba(255,255,255,0.8)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openCaptionEdit(item);
                        }}
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete image">
                      <IconButton
                        size="small"
                        aria-label={`Delete ${item.originalName}`}
                        sx={{ color: 'rgba(255,255,255,0.8)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(item);
                        }}
                      >
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
                sx={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {previewIndex !== null && (
        <MediaPreviewDialog
          items={items}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        aria-labelledby="delete-dialog-title"
      >
        <DialogTitle id="delete-dialog-title">Delete image?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete{' '}
            <strong>{deleteTarget?.originalName}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleDeleteConfirm()}
            color="error"
            variant="contained"
            disabled={deleting}
            aria-label="Confirm delete"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Caption edit dialog */}
      <Dialog
        open={captionTarget !== null}
        onClose={() => setCaptionTarget(null)}
        aria-labelledby="caption-dialog-title"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id="caption-dialog-title">Edit caption</DialogTitle>
        <DialogContent>
          <TextField
            label="Caption"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            inputProps={{ maxLength: 500, 'aria-label': 'Caption text' }}
            sx={{ mt: 1 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaptionTarget(null)} disabled={savingCaption}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCaptionSave()}
            variant="contained"
            disabled={savingCaption}
            aria-label="Save caption"
          >
            {savingCaption ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

