import { api } from '../lib/api-client';

export interface GalleryItem {
  id: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  url: string;
}

export async function listGallery(eventId: string): Promise<GalleryItem[]> {
  const result = await api.get<{ gallery: GalleryItem[] }>(`/api/events/${eventId}/gallery`);
  return result?.gallery ?? [];
}
