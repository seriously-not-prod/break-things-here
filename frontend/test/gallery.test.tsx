import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../src/components/gallery/gallery-page';
import * as galleryService from '../src/services/gallery-service';
import type { GalleryItem } from '../src/services/gallery-service';

vi.mock('../src/services/gallery-service');

const mockedListGallery = vi.mocked(galleryService.listGallery);
const mockedDeleteGalleryItem = vi.mocked(galleryService.deleteGalleryItem);
const mockedUpdateGalleryCaption = vi.mocked(galleryService.updateGalleryCaption);

const MOCK_ITEMS: GalleryItem[] = [
  {
    id: 1,
    fileName: 'document-1.jpg',
    originalName: 'sunset-stage.jpg',
    mimeType: 'image/jpeg',
    fileSize: 120000,
    caption: '',
    createdAt: '2026-05-01T10:00:00Z',
    url: '/api/uploads/event-documents/document-1.jpg',
    caption: null,
  },
  {
    id: 2,
    fileName: 'document-2.png',
    originalName: 'crowd-shot.png',
    mimeType: 'image/png',
    fileSize: 95000,
    caption: 'Main stage crowd',
    createdAt: '2026-05-02T14:30:00Z',
    url: '/api/uploads/event-documents/document-2.png',
    caption: 'A packed crowd',
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

describe('GalleryPage (#430)', () => {
  beforeEach(() => {
    mockedListGallery.mockReset();
    mockedDeleteGalleryItem.mockReset();
    mockedUpdateGalleryCaption.mockReset();
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
    // Second item has caption set — alt uses caption value, not originalName
    expect(screen.getByAltText('A packed crowd')).toBeInTheDocument();
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

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('sunset-stage.jpg')).toBeInTheDocument();
  });

  it('closes preview dialog with Close button', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Open preview for sunset-stage.jpg/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('shows delete confirmation dialog when delete button is clicked', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Delete sunset-stage\.jpg/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    expect(within(dialog).getByText('sunset-stage.jpg')).toBeInTheDocument();
  });

  it('cancels delete when Cancel is clicked', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Delete sunset-stage\.jpg/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedDeleteGalleryItem).not.toHaveBeenCalled();
  });

  it('deletes gallery item and removes it from the list', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedDeleteGalleryItem.mockResolvedValue(undefined);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Delete sunset-stage\.jpg/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm delete' }));

    await waitFor(() =>
      expect(screen.queryByAltText('sunset-stage.jpg')).not.toBeInTheDocument(),
    );
    expect(mockedDeleteGalleryItem).toHaveBeenCalledWith('42', 1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows error when delete fails', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedDeleteGalleryItem.mockRejectedValue(new Error('Delete failed'));
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Delete sunset-stage\.jpg/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

    await waitFor(() => expect(screen.getByText('Delete failed')).toBeInTheDocument());
  });

  // ── Caption edit ───────────────────────────────────────────────────────────

  it('shows caption edit dialog when edit button is clicked', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Edit caption for sunset-stage\.jpg/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Caption text')).toBeInTheDocument();
  });

  it('pre-fills caption field with existing caption', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('crowd-shot.png'));

    fireEvent.click(screen.getByRole('button', { name: /Edit caption for crowd-shot\.png/i }));

    const input = screen.getByLabelText('Caption text') as HTMLTextAreaElement;
    expect(input.value).toBe('Main stage crowd');
  });

  it('saves caption and updates gallery list', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedUpdateGalleryCaption.mockResolvedValue({ id: 1, caption: 'Sunset performance' });
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Edit caption for sunset-stage\.jpg/i }));
    const input = screen.getByLabelText('Caption text');
    fireEvent.change(input, { target: { value: 'Sunset performance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save caption' }));

    await waitFor(() => expect(mockedUpdateGalleryCaption).toHaveBeenCalledWith('42', 1, 'Sunset performance'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows error when caption save fails', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedUpdateGalleryCaption.mockRejectedValue(new Error('Save failed'));
    renderGallery();
    await waitFor(() => screen.getByAltText('sunset-stage.jpg'));

    fireEvent.click(screen.getByRole('button', { name: /Edit caption for sunset-stage\.jpg/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save caption' }));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeInTheDocument());
  });

  it('shows caption in preview dialog when item has a caption', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    await waitFor(() => screen.getByAltText('crowd-shot.png'));

    fireEvent.click(screen.getByRole('button', { name: /Open preview for crowd-shot\.png/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Main stage crowd')).toBeInTheDocument();
  });
});
