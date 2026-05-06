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
}

/** Fetches all images uploaded to the given event. */
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
 * @returns The updated gallery item.
 */
export async function updateGalleryCaption(
  eventId: string,
  itemId: number,
  caption: string,
): Promise<GalleryItem> {
  const result = await api.patch<{ item: GalleryItem }>(
    `/api/events/${eventId}/gallery/${itemId}`,
    { caption },
  );
  return result.item;
}
