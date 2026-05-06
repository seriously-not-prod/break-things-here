import { api } from '../lib/api-client';

export interface GalleryItem {
  id: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  caption: string;
  createdAt: string;
  url: string;
}

export async function listGallery(eventId: string): Promise<GalleryItem[]> {
  const result = await api.get<{ gallery: GalleryItem[] }>(`/api/events/${eventId}/gallery`);
  return result?.gallery ?? [];
}

export async function deleteGalleryItem(eventId: string, id: number): Promise<void> {
  await api.delete(`/api/events/${eventId}/gallery/${id}`);
}

export async function updateGalleryCaption(
  eventId: string,
  id: number,
  caption: string,
): Promise<{ id: number; caption: string }> {
  return api.patch<{ id: number; caption: string }>(
    `/api/events/${eventId}/gallery/${id}/caption`,
    { caption },
  );
}
