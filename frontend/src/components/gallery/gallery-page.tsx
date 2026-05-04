import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ImageList,
  ImageListItem,
  Skeleton,
  Typography,
} from '@mui/material';
import { AddPhotoAlternateRounded, PhotoLibraryRounded } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { getAuthHeaders } from '../../lib/api-client';
import { listGallery, type GalleryItem } from '../../services/gallery-service';
import { MediaPreviewDialog } from './media-preview-dialog';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function GalleryPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
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

      const res = await fetch(`${API_BASE}/api/events/${eventId}/documents`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
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
        <Alert severity="error" sx={{ mb: 2 }}>
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
              sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden' }}
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
    </Box>
  );
}
