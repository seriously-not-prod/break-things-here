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
  TextField,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  Skeleton,
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
  /** ID of the item pending confirmation before deletion; null when no dialog is open. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  /** Original name of the item pending deletion (for display in the confirmation dialog). */
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>('');
  /** ID of the item whose caption is being edited; null when no editor is open. */
  const [captionEditId, setCaptionEditId] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string>('');
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

  async function handleDelete(itemId: number): Promise<void> {
    if (!eventId) return;
    setConfirmDeleteId(null);
    try {
      await deleteGalleryItem(eventId, itemId);
      // Use functional updater so both state writes reference the same current snapshot
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== itemId);
        // Close the preview dialog when the displayed item is deleted
        setPreviewIndex((idx) => {
          if (idx === null) return null;
          if (prev[idx]?.id === itemId) return null;
          // Shift the index down if items before it were removed
          const newIdx = next.findIndex((item) => item.id === prev[idx]?.id);
          return newIdx >= 0 ? newIdx : null;
        });
        return next;
      });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function handleCaptionUpdate(itemId: number, caption: string): Promise<void> {
    if (!eventId) return;
    try {
      const updated = await updateGalleryCaption(eventId, itemId, caption);
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Caption update failed');
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
              sx={{
                cursor: 'pointer',
                borderRadius: 1,
                overflow: 'hidden',
                position: 'relative',
                '&:hover .gallery-item-bar': { opacity: 1 },
              }}
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
            >
              <img
                src={`${API_BASE}${item.url}`}
                alt={item.originalName}
                loading="lazy"
                style={{ display: 'block', width: '100%', borderRadius: 4 }}
              />
              {/* Delete overlay — visible on hover */}
              <ImageListItemBar
                className="gallery-item-bar"
                position="top"
                actionPosition="right"
                sx={{
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)',
                }}
                actionIcon={
                  <Box sx={{ display: 'flex' }}>
                    <Tooltip title="Edit caption">
                      <IconButton
                        size="small"
                        aria-label={`Edit caption for ${item.originalName}`}
                        sx={{ color: 'white' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCaptionEditId(item.id);
                          setCaptionDraft(item.caption ?? '');
                        }}
                      >
                        <EditRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete image">
                      <IconButton
                        size="small"
                        aria-label={`Delete ${item.originalName}`}
                        sx={{ color: 'white' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(item.id);
                          setConfirmDeleteName(item.originalName);
                        }}
                      >
                        <DeleteRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                }
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
          onDelete={(itemId) => setConfirmDeleteId(itemId)}
          onCaptionUpdate={(itemId, caption) => void handleCaptionUpdate(itemId, caption)}
        />
      )}

      {/* Caption edit dialog */}
      <Dialog
        open={captionEditId !== null}
        onClose={() => setCaptionEditId(null)}
        aria-labelledby="caption-edit-title"
      >
        <DialogTitle id="caption-edit-title">Edit caption</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={2}
            label="Caption text"
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCaptionEditId(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (captionEditId !== null) {
                void handleCaptionUpdate(captionEditId, captionDraft);
              }
              setCaptionEditId(null);
            }}
          >
            Save caption
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
      >
        <DialogTitle id="delete-confirm-title">Delete image?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-confirm-description">
            Are you sure you want to delete{' '}
            <strong>{confirmDeleteName}</strong>? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => confirmDeleteId !== null && void handleDelete(confirmDeleteId)}
            autoFocus
          >
            Confirm delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
