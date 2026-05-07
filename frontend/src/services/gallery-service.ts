import { api } from '../lib/api-client';

export interface GalleryItem {
  id: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  url: string;
  /** Optional caption text set by event members. */
  caption: string | null;
  /** Album this image belongs to, or null. */
  albumId: number | null;
  /** Moderation state: 'approved' | 'pending' | 'rejected' */
  moderationStatus: 'approved' | 'pending' | 'rejected';
}

export interface GalleryAlbum {
  id: number;
  eventId: number;
  name: string;
  description: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GallerySlideshow {
  id: number;
  eventId: number;
  name: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SlideshowItem {
  id: number;
  slideshowId: number;
  documentId: number;
  sortOrder: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  caption: string | null;
  url: string;
}

/** Fetches all approved images uploaded to the given event. */
export async function listGallery(eventId: string): Promise<GalleryItem[]> {
  const result = await api.get<{ gallery: GalleryItem[] }>(`/api/events/${eventId}/gallery`);
  return result?.gallery ?? [];
}

/**
 * Permanently deletes a gallery image and its backing file.
 * Uses the shared event-documents delete endpoint.
 */
export async function deleteGalleryItem(eventId: string, itemId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/documents/${itemId}`);
}

/**
 * Updates the caption of a gallery image.
 * Pass an empty string to clear the caption.
 * @returns The id and new caption value from the server.
 */
export async function updateGalleryCaption(
  eventId: string,
  itemId: number,
  caption: string,
): Promise<{ id: number; caption: string | null }> {
  return api.patch<{ id: number; caption: string | null }>(
    `/api/events/${eventId}/gallery/${itemId}`,
    { caption },
  );
}

// ─── Albums ──────────────────────────────────────────────────────────────────

export async function listAlbums(eventId: string): Promise<GalleryAlbum[]> {
  const result = await api.get<{ albums: GalleryAlbum[] }>(`/api/events/${eventId}/gallery/albums`);
  return result?.albums ?? [];
}

export async function createAlbum(
  eventId: string,
  name: string,
  description?: string,
): Promise<GalleryAlbum> {
  return api.post<GalleryAlbum>(`/api/events/${eventId}/gallery/albums`, { name, description });
}

export async function updateAlbum(
  eventId: string,
  albumId: number,
  data: { name?: string; description?: string },
): Promise<GalleryAlbum> {
  return api.patch<GalleryAlbum>(`/api/events/${eventId}/gallery/albums/${albumId}`, data);
}

export async function deleteAlbum(eventId: string, albumId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/gallery/albums/${albumId}`);
}

export async function assignItemToAlbum(
  eventId: string,
  itemId: number,
  albumId: number | null,
): Promise<{ id: number; albumId: number | null }> {
  return api.patch<{ id: number; albumId: number | null }>(
    `/api/events/${eventId}/gallery/${itemId}/album`,
    { albumId },
  );
}

// ─── Moderation ──────────────────────────────────────────────────────────────

export async function listModerationQueue(eventId: string): Promise<GalleryItem[]> {
  const result = await api.get<{ queue: GalleryItem[] }>(
    `/api/events/${eventId}/gallery/moderation`,
  );
  return result?.queue ?? [];
}

export async function moderateItem(
  eventId: string,
  itemId: number,
  status: 'approved' | 'rejected',
): Promise<{ id: number; moderationStatus: string }> {
  return api.patch<{ id: number; moderationStatus: string }>(
    `/api/events/${eventId}/gallery/${itemId}/moderate`,
    { status },
  );
}

export async function submitGuestPhoto(
  eventId: string,
  itemId: number,
): Promise<{ id: number; moderationStatus: string }> {
  return api.patch<{ id: number; moderationStatus: string }>(
    `/api/events/${eventId}/gallery/${itemId}/submit`,
    {},
  );
}

// ─── Slideshows ───────────────────────────────────────────────────────────────

export async function listSlideshows(eventId: string): Promise<GallerySlideshow[]> {
  const result = await api.get<{ slideshows: GallerySlideshow[] }>(
    `/api/events/${eventId}/gallery/slideshows`,
  );
  return result?.slideshows ?? [];
}

export async function createSlideshow(
  eventId: string,
  name: string,
  itemIds: number[],
): Promise<GallerySlideshow> {
  return api.post<GallerySlideshow>(`/api/events/${eventId}/gallery/slideshows`, { name, itemIds });
}

export async function getSlideshowItems(
  eventId: string,
  slideshowId: number,
): Promise<SlideshowItem[]> {
  const result = await api.get<{ items: SlideshowItem[] }>(
    `/api/events/${eventId}/gallery/slideshows/${slideshowId}/items`,
  );
  return result?.items ?? [];
}

export async function updateSlideshow(
  eventId: string,
  slideshowId: number,
  data: { name?: string; itemIds?: number[] },
): Promise<GallerySlideshow> {
  return api.patch<GallerySlideshow>(
    `/api/events/${eventId}/gallery/slideshows/${slideshowId}`,
    data,
  );
}

export async function deleteSlideshow(eventId: string, slideshowId: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/gallery/slideshows/${slideshowId}`);
}
