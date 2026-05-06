import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../src/components/gallery/gallery-page';
import * as galleryService from '../src/services/gallery-service';
import type { GalleryItem } from '../src/services/gallery-service';

vi.mock('../src/services/gallery-service');

const mockedListGallery = vi.mocked(galleryService.listGallery);

const MOCK_ITEMS: GalleryItem[] = [
  {
    id: 1,
    fileName: 'document-1.jpg',
    originalName: 'sunset-stage.jpg',
    mimeType: 'image/jpeg',
    fileSize: 120000,
    createdAt: '2026-05-01T10:00:00Z',
    url: '/api/uploads/event-documents/document-1.jpg',
  },
  {
    id: 2,
    fileName: 'document-2.png',
    originalName: 'crowd-shot.png',
    mimeType: 'image/png',
    fileSize: 95000,
    createdAt: '2026-05-02T14:30:00Z',
    url: '/api/uploads/event-documents/document-2.png',
  },
];

function renderGallery(eventId = '42') {
  return render(
    <MemoryRouter initialEntries={[`/events/${eventId}/gallery`]}>
      <Routes>
        <Route path="/events/:id/gallery" element={<GalleryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GalleryPage (#388)', () => {
  beforeEach(() => {
    mockedListGallery.mockReset();
  });

  it('renders loading skeletons while fetching', () => {
    mockedListGallery.mockReturnValue(new Promise(() => undefined));
    renderGallery();
    // Skeletons are rendered — check heading still shows
    expect(screen.getByText('Gallery')).toBeInTheDocument();
  });

  it('renders a grid of image thumbnails', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => expect(screen.getByLabelText('Event gallery')).toBeInTheDocument());
    expect(screen.getByAltText('sunset-stage.jpg')).toBeInTheDocument();
    expect(screen.getByAltText('crowd-shot.png')).toBeInTheDocument();
  });

  it('shows image count', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => expect(screen.getByText('(2 images)')).toBeInTheDocument());
  });

  it('renders empty state when no images', async () => {
    mockedListGallery.mockResolvedValue([]);
    renderGallery();
    await waitFor(() => expect(screen.getByText('No images yet')).toBeInTheDocument());
    expect(screen.getByRole('status', { name: 'Empty gallery' })).toBeInTheDocument();
  });

  it('opens preview dialog when thumbnail is clicked', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Open preview for sunset-stage.jpg/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('sunset-stage.jpg')).toBeInTheDocument();
  });

  it('closes preview dialog with Close button', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Open preview for sunset-stage.jpg/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates to next image in preview', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Open preview for sunset-stage.jpg/i }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    mockedListGallery.mockRejectedValue(new Error('Network error'));
    renderGallery();
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
  });
});
