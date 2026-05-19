import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Table,
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
  CheckCircleRounded,
  CollectionsRounded,
  CreateNewFolderRounded,
  DeleteRounded,
  EditRounded,
  FolderRounded,
  HourglassEmptyRounded,
  PhotoLibraryRounded,
  PlayCircleRounded,
  QueueRounded,
  SlideshowRounded,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import { apiFetch } from '../../lib/api-client';
import {
  assignItemToAlbum,
  createAlbum,
  createSlideshow,
  deleteAlbum,
  deleteGalleryItem,
  deleteSlideshow,
  getSlideshowItems,
  listAlbums,
  listGallery,
  listModerationQueue,
  listSlideshows,
  moderateItem,
  updateAlbum,
  updateGalleryCaption,
  updateSlideshow,
  type GalleryAlbum,
  type GalleryItem,
  type GallerySlideshow,
  type SlideshowItem,
} from '../../services/gallery-service';
import { MediaPreviewDialog } from './media-preview-dialog';
import GalleryShareDownloadPanel from './gallery-share-panel';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ─── Slideshow player dialog ───────────────────────────────────────────────

interface SlideshowPlayerProps {
  items: SlideshowItem[];
  onClose: () => void;
}

function SlideshowPlayer({ items, onClose }: SlideshowPlayerProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="slideshow-player-title">
      <DialogTitle id="slideshow-player-title">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SlideshowRounded />
            <Typography variant="h6">{item?.originalName ?? ''}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {index + 1} / {items.length}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ position: 'relative', p: 1 }}>
        {item ? (
          <Box sx={{ textAlign: 'center' }}>
            <img
              src={`${API_BASE}${item.url}`}
              alt={item.originalName}
              style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 4, objectFit: 'contain' }}
            />
            {item.caption && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {item.caption}
              </Typography>
            )}
          </Box>
        ) : (
          <Typography>No images in slideshow.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button disabled={!hasPrev} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </Button>
        <Button disabled={!hasNext} onClick={() => setIndex((i) => i + 1)}>
          Next
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main GalleryPage ─────────────────────────────────────────────────────────

export function GalleryPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();

  // ── Gallery items state ──
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState<string>('');
  const [captionEditId, setCaptionEditId] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string>('');
  const [selectedAlbumFilter, setSelectedAlbumFilter] = useState<number | 'all'>('all');
  const uploadRef = useRef<HTMLInputElement>(null);

  // ── Albums state ──
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [newAlbumDesc, setNewAlbumDesc] = useState('');
  const [editAlbum, setEditAlbum] = useState<GalleryAlbum | null>(null);
  const [editAlbumName, setEditAlbumName] = useState('');
  const [editAlbumDesc, setEditAlbumDesc] = useState('');
  const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState<number | null>(null);
  const [confirmDeleteAlbumName, setConfirmDeleteAlbumName] = useState('');

  // ── Assign-to-album state ──
  const [assignAlbumItemId, setAssignAlbumItemId] = useState<number | null>(null);
  const [assignAlbumTarget, setAssignAlbumTarget] = useState<number | ''>('');

  // ── Moderation state ──
  const [moderationQueue, setModerationQueue] = useState<GalleryItem[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationError, setModerationError] = useState<string | null>(null);

  // ── Slideshow state ──
  const [slideshows, setSlideshows] = useState<GallerySlideshow[]>([]);
  const [slideshowsLoading, setSlideshowsLoading] = useState(false);
  const [slideshowError, setSlideshowError] = useState<string | null>(null);
  const [newSlideshowName, setNewSlideshowName] = useState('');
  const [newSlideshowIds, setNewSlideshowIds] = useState<number[]>([]);
  const [editSlideshow, setEditSlideshow] = useState<GallerySlideshow | null>(null);
  const [editSlideshowLoading, setEditSlideshowLoading] = useState(false);
  const [editSlideshowName, setEditSlideshowName] = useState('');
  const [editSlideshowIds, setEditSlideshowIds] = useState<number[]>([]);
  const [confirmDeleteSlideshowId, setConfirmDeleteSlideshowId] = useState<number | null>(null);
  const [confirmDeleteSlideshowName, setConfirmDeleteSlideshowName] = useState('');
  const [playerItems, setPlayerItems] = useState<SlideshowItem[] | null>(null);

  // ── Tab ──
  const [tab, setTab] = useState(0);

  // ── Load gallery items ──
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

  // ── Load albums for gallery filters, assignment, and Albums tab ──
  useEffect(() => {
    if (!eventId) return;
    setAlbumsLoading(true);
    setAlbumError(null);
    listAlbums(eventId)
      .then(setAlbums)
      .catch((err: unknown) =>
        setAlbumError(err instanceof Error ? err.message : 'Failed to load albums'),
      )
      .finally(() => setAlbumsLoading(false));
  }, [eventId]);

  // ── Load moderation queue when Moderation tab is active ──
  useEffect(() => {
    if (tab !== 2 || !eventId) return;
    setModerationLoading(true);
    setModerationError(null);
    listModerationQueue(eventId)
      .then(setModerationQueue)
      .catch((err: unknown) =>
        setModerationError(err instanceof Error ? err.message : 'Failed to load moderation queue'),
      )
      .finally(() => setModerationLoading(false));
  }, [tab, eventId]);

  // ── Load slideshows when Slideshows tab is active ──
  useEffect(() => {
    if (tab !== 3 || !eventId) return;
    setSlideshowsLoading(true);
    setSlideshowError(null);
    listSlideshows(eventId)
      .then(setSlideshows)
      .catch((err: unknown) =>
        setSlideshowError(err instanceof Error ? err.message : 'Failed to load slideshows'),
      )
      .finally(() => setSlideshowsLoading(false));
  }, [tab, eventId]);

  // ─── Gallery handlers ────────────────────────────────────────────────────

  async function handleUpload(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = e.target.files;
    if (!files || files.length === 0 || !eventId) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      // Append all selected files under the same 'document' field name so the
      // backend multer.array('document', 20) handler receives them together.
      for (const file of Array.from(files)) {
        formData.append('document', file);
      }

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

      // Handle partial-success (207 Multi-Status) from multi-file batch
      const body = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ fileName: string; error: string }>;
      };
      if (body.errors && body.errors.length > 0) {
        const names = body.errors.map((e) => e.fileName).join(', ');
        setError(`Some files failed to upload: ${names}`);
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
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== itemId);
        setPreviewIndex((idx) => {
          if (idx === null) return null;
          if (prev[idx]?.id === itemId) return null;
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
      const { caption: saved } = await updateGalleryCaption(eventId, itemId, caption);
      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, caption: saved } : item)),
      );
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Caption update failed');
    }
  }

  // ─── Album handlers ──────────────────────────────────────────────────────

  async function handleCreateAlbum(): Promise<void> {
    if (!eventId || !newAlbumName.trim()) return;
    setAlbumError(null);
    try {
      const created = await createAlbum(
        eventId,
        newAlbumName.trim(),
        newAlbumDesc.trim() || undefined,
      );
      setAlbums((prev) => [...prev, created]);
      setNewAlbumName('');
      setNewAlbumDesc('');
    } catch (err: unknown) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to create album');
    }
  }

  async function handleUpdateAlbum(): Promise<void> {
    if (!eventId || !editAlbum) return;
    setAlbumError(null);
    try {
      const updated = await updateAlbum(eventId, editAlbum.id, {
        name: editAlbumName.trim(),
        description: editAlbumDesc.trim() || undefined,
      });
      setAlbums((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditAlbum(null);
    } catch (err: unknown) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to update album');
    }
  }

  async function handleDeleteAlbum(albumId: number): Promise<void> {
    if (!eventId) return;
    setConfirmDeleteAlbumId(null);
    setAlbumError(null);
    try {
      await deleteAlbum(eventId, albumId);
      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      setSelectedAlbumFilter((prev) => (prev === albumId ? 'all' : prev));
      // Unassign items that belonged to this album
      setItems((prev) =>
        prev.map((item) => (item.albumId === albumId ? { ...item, albumId: null } : item)),
      );
    } catch (err: unknown) {
      setAlbumError(err instanceof Error ? err.message : 'Failed to delete album');
    }
  }

  async function handleAssignAlbum(): Promise<void> {
    if (!eventId || assignAlbumItemId === null) return;
    setError(null);
    try {
      const albumId = assignAlbumTarget === '' ? null : Number(assignAlbumTarget);
      const { albumId: saved } = await assignItemToAlbum(eventId, assignAlbumItemId, albumId);
      setItems((prev) =>
        prev.map((item) => (item.id === assignAlbumItemId ? { ...item, albumId: saved } : item)),
      );
      setAssignAlbumItemId(null);
      setAssignAlbumTarget('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign album');
    }
  }

  async function handleOpenEditSlideshow(slideshow: GallerySlideshow): Promise<void> {
    if (!eventId) return;

    setSlideshowError(null);
    setEditSlideshow(slideshow);
    setEditSlideshowName(slideshow.name);
    setEditSlideshowIds([]);
    setEditSlideshowLoading(true);

    try {
      const currentItems = await getSlideshowItems(eventId, slideshow.id);
      setEditSlideshowIds(currentItems.map((item) => item.documentId));
    } catch (err: unknown) {
      setSlideshowError(err instanceof Error ? err.message : 'Failed to load slideshow items');
      setEditSlideshow(null);
    } finally {
      setEditSlideshowLoading(false);
    }
  }

  // ─── Moderation handlers ─────────────────────────────────────────────────

  async function handleModerate(itemId: number, status: 'approved' | 'rejected'): Promise<void> {
    if (!eventId) return;
    setModerationError(null);
    try {
      await moderateItem(eventId, itemId, status);
      setModerationQueue((prev) => prev.filter((item) => item.id !== itemId));
      if (status === 'approved') {
        const refreshed = await listGallery(eventId);
        setItems(refreshed);
      }
    } catch (err: unknown) {
      setModerationError(err instanceof Error ? err.message : 'Moderation action failed');
    }
  }

  // ─── Slideshow handlers ──────────────────────────────────────────────────

  async function handleCreateSlideshow(): Promise<void> {
    if (!eventId || !newSlideshowName.trim()) return;
    setSlideshowError(null);
    try {
      const created = await createSlideshow(eventId, newSlideshowName.trim(), newSlideshowIds);
      setSlideshows((prev) => [created, ...prev]);
      setNewSlideshowName('');
      setNewSlideshowIds([]);
    } catch (err: unknown) {
      setSlideshowError(err instanceof Error ? err.message : 'Failed to create slideshow');
    }
  }

  async function handleUpdateSlideshow(): Promise<void> {
    if (!eventId || !editSlideshow) return;
    setSlideshowError(null);
    try {
      const updated = await updateSlideshow(eventId, editSlideshow.id, {
        name: editSlideshowName.trim() || undefined,
        itemIds: editSlideshowIds,
      });
      setSlideshows((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditSlideshow(null);
    } catch (err: unknown) {
      setSlideshowError(err instanceof Error ? err.message : 'Failed to update slideshow');
    }
  }

  async function handleDeleteSlideshow(slideshowId: number): Promise<void> {
    if (!eventId) return;
    setConfirmDeleteSlideshowId(null);
    setSlideshowError(null);
    try {
      await deleteSlideshow(eventId, slideshowId);
      setSlideshows((prev) => prev.filter((s) => s.id !== slideshowId));
    } catch (err: unknown) {
      setSlideshowError(err instanceof Error ? err.message : 'Failed to delete slideshow');
    }
  }

  async function handleRunSlideshow(slideshowId: number): Promise<void> {
    if (!eventId) return;
    setSlideshowError(null);
    try {
      const items = await getSlideshowItems(eventId, slideshowId);
      setPlayerItems(items);
    } catch (err: unknown) {
      setSlideshowError(err instanceof Error ? err.message : 'Failed to load slideshow items');
    }
  }

  // ─── Filtered gallery items ──────────────────────────────────────────────

  const displayedItems =
    selectedAlbumFilter === 'all'
      ? items
      : items.filter((item) => item.albumId === selectedAlbumFilter);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <PageLayout
      title="Gallery"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Gallery' }]}
      actions={
        tab === 0 ? (
          <Button
            variant="contained"
            startIcon={<AddPhotoAlternateRounded />}
            component="label"
            disabled={uploading}
            aria-label="Upload image"
          >
            {uploading ? 'Uploading…' : 'Upload Images'}
            <input
              ref={uploadRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              multiple
              hidden
              onChange={(e) => void handleUpload(e)}
            />
          </Button>
        ) : undefined
      }
    >
      {/* BRD v2 (#619, #620, #622) — share links, manifest, quota indicator */}
      {eventId && <GalleryShareDownloadPanel eventId={eventId} albums={albums} canManage />}

      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
        aria-label="Gallery sections"
      >
        <Tab
          icon={<CollectionsRounded />}
          label="Gallery"
          iconPosition="start"
          aria-label="Gallery tab"
        />
        <Tab icon={<FolderRounded />} label="Albums" iconPosition="start" aria-label="Albums tab" />
        <Tab
          icon={<QueueRounded />}
          label="Moderation"
          iconPosition="start"
          aria-label="Moderation tab"
        />
        <Tab
          icon={<SlideshowRounded />}
          label="Slideshows"
          iconPosition="start"
          aria-label="Slideshows tab"
        />
      </Tabs>

      {/* ── Gallery Tab ── */}
      {tab === 0 && (
        <>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Album filter */}
          {albums.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip
                label="All"
                onClick={() => setSelectedAlbumFilter('all')}
                color={selectedAlbumFilter === 'all' ? 'primary' : 'default'}
                aria-pressed={selectedAlbumFilter === 'all'}
              />
              {albums.map((album) => (
                <Chip
                  key={album.id}
                  label={album.name}
                  onClick={() => setSelectedAlbumFilter(album.id)}
                  color={selectedAlbumFilter === album.id ? 'primary' : 'default'}
                  aria-pressed={selectedAlbumFilter === album.id}
                />
              ))}
            </Box>
          )}

          {!loading && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              ({displayedItems.length} {displayedItems.length === 1 ? 'image' : 'images'})
            </Typography>
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

          {!loading && displayedItems.length === 0 && (
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

          {!loading && displayedItems.length > 0 && (
            <ImageList variant="masonry" cols={3} gap={8} aria-label="Event gallery">
              {displayedItems.map((item, index) => (
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
                  <ImageListItemBar
                    className="gallery-item-bar"
                    position="top"
                    actionPosition="right"
                    sx={{
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      background:
                        'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)',
                    }}
                    actionIcon={
                      <Box sx={{ display: 'flex' }}>
                        <Tooltip title="Assign to album">
                          <IconButton
                            size="small"
                            aria-label={`Assign album for ${item.originalName}`}
                            sx={{ color: 'white' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignAlbumItemId(item.id);
                              setAssignAlbumTarget(item.albumId ?? '');
                            }}
                          >
                            <FolderRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
        </>
      )}

      {/* ── Albums Tab ── */}
      {tab === 1 && (
        <Box>
          {albumError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAlbumError(null)}>
              {albumError}
            </Alert>
          )}

          {/* Create album form */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <TextField
              label="Album name"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              size="small"
              sx={{ flex: '1 1 200px' }}
              inputProps={{ 'aria-label': 'Album name' }}
            />
            <TextField
              label="Description (optional)"
              value={newAlbumDesc}
              onChange={(e) => setNewAlbumDesc(e.target.value)}
              size="small"
              sx={{ flex: '2 1 300px' }}
            />
            <Button
              variant="contained"
              startIcon={<CreateNewFolderRounded />}
              onClick={() => void handleCreateAlbum()}
              disabled={!newAlbumName.trim()}
              aria-label="Create album"
            >
              Create Album
            </Button>
          </Box>

          {albumsLoading && (
            <Box>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={56} sx={{ mb: 1 }} />
              ))}
            </Box>
          )}

          {!albumsLoading && albums.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 6,
                gap: 2,
                color: 'text.secondary',
              }}
              role="status"
              aria-label="No albums"
            >
              <FolderRounded sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="h6">No albums yet</Typography>
              <Typography variant="body2">Create an album to organise your gallery.</Typography>
            </Box>
          )}

          {!albumsLoading && albums.length > 0 && (
            <Table size="small" aria-label="Albums list">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {albums.map((album) => (
                  <TableRow key={album.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FolderRounded color="primary" fontSize="small" />
                        <Typography variant="body2" fontWeight={600}>
                          {album.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {album.description ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit album">
                        <IconButton
                          size="small"
                          aria-label={`Edit album ${album.name}`}
                          onClick={() => {
                            setEditAlbum(album);
                            setEditAlbumName(album.name);
                            setEditAlbumDesc(album.description ?? '');
                          }}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete album">
                        <IconButton
                          size="small"
                          aria-label={`Delete album ${album.name}`}
                          color="error"
                          onClick={() => {
                            setConfirmDeleteAlbumId(album.id);
                            setConfirmDeleteAlbumName(album.name);
                          }}
                        >
                          <DeleteRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {/* ── Moderation Tab ── */}
      {tab === 2 && (
        <Box>
          {moderationError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setModerationError(null)}>
              {moderationError}
            </Alert>
          )}

          {moderationLoading && (
            <Box>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={72} sx={{ mb: 1 }} />
              ))}
            </Box>
          )}

          {!moderationLoading && moderationQueue.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 6,
                gap: 2,
                color: 'text.secondary',
              }}
              role="status"
              aria-label="Empty moderation queue"
            >
              <HourglassEmptyRounded sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="h6">Moderation queue is empty</Typography>
              <Typography variant="body2">All submissions have been reviewed.</Typography>
            </Box>
          )}

          {!moderationLoading && moderationQueue.length > 0 && (
            <Table size="small" aria-label="Moderation queue">
              <TableHead>
                <TableRow>
                  <TableCell>Image</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {moderationQueue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <img
                        src={`${API_BASE}${item.url}`}
                        alt={item.originalName}
                        style={{ width: 60, height: 40, objectFit: 'cover', borderRadius: 4 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.originalName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        icon={<HourglassEmptyRounded />}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          color="success"
                          aria-label={`Approve ${item.originalName}`}
                          onClick={() => void handleModerate(item.id, 'approved')}
                        >
                          <CheckCircleRounded />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Reject ${item.originalName}`}
                          onClick={() => void handleModerate(item.id, 'rejected')}
                        >
                          <DeleteRounded />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {/* ── Slideshows Tab ── */}
      {tab === 3 && (
        <Box>
          {slideshowError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSlideshowError(null)}>
              {slideshowError}
            </Alert>
          )}

          {/* Create slideshow form */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Create New Slideshow
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                label="Slideshow name"
                value={newSlideshowName}
                onChange={(e) => setNewSlideshowName(e.target.value)}
                size="small"
                sx={{ flex: '1 1 200px' }}
                inputProps={{ 'aria-label': 'Slideshow name' }}
              />
              <FormControl size="small" sx={{ flex: '2 1 300px' }}>
                <InputLabel id="new-slideshow-items-label">Select images</InputLabel>
                <Select
                  labelId="new-slideshow-items-label"
                  label="Select images"
                  multiple
                  value={newSlideshowIds}
                  onChange={(e) => setNewSlideshowIds(e.target.value as number[])}
                  renderValue={(selected) => `${(selected as number[]).length} image(s) selected`}
                >
                  {items.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.originalName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                startIcon={<SlideshowRounded />}
                onClick={() => void handleCreateSlideshow()}
                disabled={!newSlideshowName.trim()}
                aria-label="Create slideshow"
              >
                Create Slideshow
              </Button>
            </Box>
          </Box>

          {slideshowsLoading && (
            <Box>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} height={56} sx={{ mb: 1 }} />
              ))}
            </Box>
          )}

          {!slideshowsLoading && slideshows.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                py: 6,
                gap: 2,
                color: 'text.secondary',
              }}
              role="status"
              aria-label="No slideshows"
            >
              <SlideshowRounded sx={{ fontSize: 48, opacity: 0.3 }} />
              <Typography variant="h6">No slideshows yet</Typography>
              <Typography variant="body2">Create a slideshow to get started.</Typography>
            </Box>
          )}

          {!slideshowsLoading && slideshows.length > 0 && (
            <Table size="small" aria-label="Slideshows list">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {slideshows.map((slideshow) => (
                  <TableRow key={slideshow.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SlideshowRounded color="primary" fontSize="small" />
                        <Typography variant="body2" fontWeight={600}>
                          {slideshow.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(slideshow.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Run slideshow">
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={`Run slideshow ${slideshow.name}`}
                          onClick={() => void handleRunSlideshow(slideshow.id)}
                        >
                          <PlayCircleRounded />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit slideshow">
                        <IconButton
                          size="small"
                          aria-label={`Edit slideshow ${slideshow.name}`}
                          onClick={() => void handleOpenEditSlideshow(slideshow)}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete slideshow">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete slideshow ${slideshow.name}`}
                          onClick={() => {
                            setConfirmDeleteSlideshowId(slideshow.id);
                            setConfirmDeleteSlideshowName(slideshow.name);
                          }}
                        >
                          <DeleteRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {/* ── Media Preview Dialog ── */}
      {previewIndex !== null && (
        <MediaPreviewDialog
          items={displayedItems}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onDelete={(itemId) => setConfirmDeleteId(itemId)}
          onCaptionUpdate={(itemId, caption) => void handleCaptionUpdate(itemId, caption)}
        />
      )}

      {/* ── Slideshow Player ── */}
      {playerItems !== null && (
        <SlideshowPlayer items={playerItems} onClose={() => setPlayerItems(null)} />
      )}

      {/* ── Caption edit dialog ── */}
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

      {/* ── Assign to album dialog ── */}
      <Dialog
        open={assignAlbumItemId !== null}
        onClose={() => setAssignAlbumItemId(null)}
        aria-labelledby="assign-album-title"
      >
        <DialogTitle id="assign-album-title">Assign to album</DialogTitle>
        <DialogContent sx={{ minWidth: 320, pt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="assign-album-label">Album</InputLabel>
            <Select
              labelId="assign-album-label"
              label="Album"
              value={assignAlbumTarget}
              onChange={(e) => setAssignAlbumTarget(e.target.value as number | '')}
            >
              <MenuItem value="">
                <em>None (unassign)</em>
              </MenuItem>
              {albums.map((album) => (
                <MenuItem key={album.id} value={album.id}>
                  {album.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignAlbumItemId(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleAssignAlbum()}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit album dialog ── */}
      <Dialog
        open={editAlbum !== null}
        onClose={() => setEditAlbum(null)}
        aria-labelledby="edit-album-title"
      >
        <DialogTitle id="edit-album-title">Edit album</DialogTitle>
        <DialogContent sx={{ minWidth: 360, pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            label="Album name"
            value={editAlbumName}
            onChange={(e) => setEditAlbumName(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description (optional)"
            value={editAlbumDesc}
            onChange={(e) => setEditAlbumDesc(e.target.value)}
            multiline
            minRows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditAlbum(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleUpdateAlbum()}
            disabled={!editAlbumName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete album confirmation ── */}
      <Dialog
        open={confirmDeleteAlbumId !== null}
        onClose={() => setConfirmDeleteAlbumId(null)}
        aria-labelledby="delete-album-title"
      >
        <DialogTitle id="delete-album-title">Delete album?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{confirmDeleteAlbumName}</strong>? Images in
            this album will not be deleted but will become unassigned.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteAlbumId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() =>
              confirmDeleteAlbumId !== null && void handleDeleteAlbum(confirmDeleteAlbumId)
            }
          >
            Delete album
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit slideshow dialog ── */}
      <Dialog
        open={editSlideshow !== null}
        onClose={() => setEditSlideshow(null)}
        aria-labelledby="edit-slideshow-title"
      >
        <DialogTitle id="edit-slideshow-title">Edit slideshow</DialogTitle>
        <DialogContent sx={{ minWidth: 360, pt: 2 }}>
          {editSlideshowLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} aria-label="Loading slideshow items" />
            </Box>
          ) : (
            <>
              <TextField
                autoFocus
                fullWidth
                label="Slideshow name"
                value={editSlideshowName}
                onChange={(e) => setEditSlideshowName(e.target.value)}
                sx={{ mb: 2 }}
              />
              <FormControl fullWidth size="small">
                <InputLabel id="edit-slideshow-items-label">Select images</InputLabel>
                <Select
                  labelId="edit-slideshow-items-label"
                  label="Select images"
                  multiple
                  value={editSlideshowIds}
                  onChange={(e) => setEditSlideshowIds(e.target.value as number[])}
                  renderValue={(selected) => `${(selected as number[]).length} image(s) selected`}
                >
                  {items.map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.originalName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditSlideshow(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleUpdateSlideshow()}
            disabled={editSlideshowLoading || !editSlideshowName.trim()}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete slideshow confirmation ── */}
      <Dialog
        open={confirmDeleteSlideshowId !== null}
        onClose={() => setConfirmDeleteSlideshowId(null)}
        aria-labelledby="delete-slideshow-title"
      >
        <DialogTitle id="delete-slideshow-title">Delete slideshow?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{confirmDeleteSlideshowName}</strong>? This
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteSlideshowId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() =>
              confirmDeleteSlideshowId !== null &&
              void handleDeleteSlideshow(confirmDeleteSlideshowId)
            }
          >
            Delete slideshow
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete image confirmation ── */}
      <Dialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-description"
      >
        <DialogTitle id="delete-confirm-title">Delete image?</DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-confirm-description">
            Are you sure you want to delete <strong>{confirmDeleteName}</strong>? This action cannot
            be undone.
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
    </PageLayout>
  );
}
