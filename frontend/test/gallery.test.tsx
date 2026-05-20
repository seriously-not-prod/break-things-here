import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GalleryPage } from '../src/components/gallery/gallery-page';
import * as galleryService from '../src/services/gallery-service';
import type { GalleryAlbum, GalleryItem, GallerySlideshow } from '../src/services/gallery-service';

vi.mock('../src/services/gallery-service');

const mockedListGallery = vi.mocked(galleryService.listGallery);
const mockedDeleteGalleryItem = vi.mocked(galleryService.deleteGalleryItem);
const mockedUpdateGalleryCaption = vi.mocked(galleryService.updateGalleryCaption);
const mockedListAlbums = vi.mocked(galleryService.listAlbums);
const mockedCreateAlbum = vi.mocked(galleryService.createAlbum);
const mockedDeleteAlbum = vi.mocked(galleryService.deleteAlbum);
const mockedListModerationQueue = vi.mocked(galleryService.listModerationQueue);
const mockedModerateItem = vi.mocked(galleryService.moderateItem);
const mockedListSlideshows = vi.mocked(galleryService.listSlideshows);
const mockedCreateSlideshow = vi.mocked(galleryService.createSlideshow);
const mockedUpdateSlideshow = vi.mocked(galleryService.updateSlideshow);
const mockedDeleteSlideshow = vi.mocked(galleryService.deleteSlideshow);
const mockedGetSlideshowItems = vi.mocked(galleryService.getSlideshowItems);

const MOCK_ITEMS: GalleryItem[] = [
  {
    id: 1,
    fileName: 'document-1.jpg',
    originalName: 'sunset-stage.jpg',
    mimeType: 'image/jpeg',
    fileSize: 120000,
    caption: null,
    createdAt: '2026-05-01T10:00:00Z',
    url: '/api/uploads/event-documents/document-1.jpg',
    albumId: null,
    moderationStatus: 'approved',
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
    albumId: null,
    moderationStatus: 'approved',
  },
];

const MOCK_ALBUMS: GalleryAlbum[] = [
  {
    id: 10,
    eventId: 42,
    name: 'Stage Photos',
    description: 'Photos from the main stage',
    createdBy: 1,
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
  },
];

const MOCK_SLIDESHOWS: GallerySlideshow[] = [
  {
    id: 20,
    eventId: 42,
    name: 'Highlights 2026',
    createdBy: 1,
    createdAt: '2026-05-01T10:00:00Z',
    updatedAt: '2026-05-01T10:00:00Z',
  },
];

const MOCK_MODERATION_QUEUE: GalleryItem[] = [
  {
    id: 5,
    fileName: 'sub.jpg',
    originalName: 'submitted.jpg',
    mimeType: 'image/jpeg',
    fileSize: 50000,
    caption: null,
    createdAt: '2026-05-01T10:00:00Z',
    url: '/api/uploads/event-documents/sub.jpg',
    albumId: null,
    moderationStatus: 'pending',
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
    mockedListAlbums.mockReset();
    mockedListAlbums.mockResolvedValue([]);
    mockedCreateAlbum.mockReset();
    mockedDeleteAlbum.mockReset();
    mockedListModerationQueue.mockReset();
    mockedModerateItem.mockReset();
    mockedListSlideshows.mockReset();
    mockedCreateSlideshow.mockReset();
    mockedUpdateSlideshow.mockReset();
    mockedDeleteSlideshow.mockReset();
    mockedGetSlideshowItems.mockReset();
  });

  it('renders loading skeletons while fetching', () => {
    mockedListGallery.mockReturnValue(new Promise(() => undefined));
    renderGallery();
    // Skeletons are rendered — check heading still shows
    expect(screen.getAllByText('Gallery').length).toBeGreaterThan(0);
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

  it('loads album filters on the main gallery tab', async () => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedListAlbums.mockResolvedValue(MOCK_ALBUMS);
    renderGallery();

    await waitFor(() => expect(mockedListAlbums).toHaveBeenCalledWith('42'));
    expect(await screen.findByText('Stage Photos')).toBeInTheDocument();
  });
});

// ─── Albums tab (#459) ────────────────────────────────────────────────────────

describe('GalleryPage Albums tab (#459)', () => {
  beforeEach(() => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedListAlbums.mockReset();
    mockedListAlbums.mockResolvedValue([]);
    mockedCreateAlbum.mockReset();
    mockedDeleteAlbum.mockReset();
  });

  it('shows Albums tab', () => {
    mockedListGallery.mockReturnValue(new Promise(() => undefined));
    renderGallery();
    expect(screen.getByRole('tab', { name: /Albums tab/i })).toBeInTheDocument();
  });

  it('renders album list when Albums tab is active', async () => {
    mockedListAlbums.mockResolvedValue(MOCK_ALBUMS);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Albums tab/i }));
    await waitFor(() => expect(screen.getByLabelText('Albums list')).toBeInTheDocument());
    expect(screen.getByText('Stage Photos')).toBeInTheDocument();
  });

  it('shows empty state when no albums exist', async () => {
    mockedListAlbums.mockResolvedValue([]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Albums tab/i }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'No albums' })).toBeInTheDocument(),
    );
    expect(screen.getByText('No albums yet')).toBeInTheDocument();
  });

  it('creates a new album', async () => {
    mockedListAlbums.mockResolvedValue([]);
    mockedCreateAlbum.mockResolvedValue(MOCK_ALBUMS[0]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Albums tab/i }));
    await waitFor(() => screen.getByLabelText('Album name'));

    fireEvent.change(screen.getByLabelText('Album name'), {
      target: { value: 'Stage Photos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create album' }));

    await waitFor(() =>
      expect(mockedCreateAlbum).toHaveBeenCalledWith('42', 'Stage Photos', undefined),
    );
  });

  it('shows error on album load failure', async () => {
    mockedListAlbums.mockRejectedValue(new Error('Load failed'));
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Albums tab/i }));
    await waitFor(() => expect(screen.getByText('Load failed')).toBeInTheDocument());
  });

  it('deletes an album after confirmation', async () => {
    mockedListAlbums.mockResolvedValue(MOCK_ALBUMS);
    mockedDeleteAlbum.mockResolvedValue(undefined);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Albums tab/i }));
    await waitFor(() => screen.getByLabelText('Delete album Stage Photos'));

    fireEvent.click(screen.getByLabelText('Delete album Stage Photos'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete album' }));

    await waitFor(() => expect(mockedDeleteAlbum).toHaveBeenCalledWith('42', 10));
  });
});

// ─── Moderation tab (#459) ────────────────────────────────────────────────────

describe('GalleryPage Moderation tab (#459)', () => {
  beforeEach(() => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedListAlbums.mockResolvedValue([]);
    mockedListModerationQueue.mockReset();
    mockedModerateItem.mockReset();
  });

  it('shows Moderation tab', () => {
    mockedListGallery.mockReturnValue(new Promise(() => undefined));
    renderGallery();
    expect(screen.getByRole('tab', { name: /Moderation tab/i })).toBeInTheDocument();
  });

  it('renders moderation queue when Moderation tab is active', async () => {
    mockedListModerationQueue.mockResolvedValue(MOCK_MODERATION_QUEUE);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Moderation tab/i }));
    await waitFor(() => expect(screen.getByLabelText('Moderation queue')).toBeInTheDocument());
    expect(screen.getByText('submitted.jpg')).toBeInTheDocument();
  });

  it('shows empty moderation queue state', async () => {
    mockedListModerationQueue.mockResolvedValue([]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Moderation tab/i }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Empty moderation queue' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Moderation queue is empty')).toBeInTheDocument();
  });

  it('approves a submission from the moderation queue', async () => {
    mockedListModerationQueue.mockResolvedValue(MOCK_MODERATION_QUEUE);
    mockedModerateItem.mockResolvedValue({ id: 5, moderationStatus: 'approved' });
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Moderation tab/i }));
    await waitFor(() => screen.getByLabelText('Approve submitted.jpg'));

    fireEvent.click(screen.getByLabelText('Approve submitted.jpg'));

    await waitFor(() => expect(mockedModerateItem).toHaveBeenCalledWith('42', 5, 'approved'));
  });

  it('rejects a submission from the moderation queue', async () => {
    mockedListModerationQueue.mockResolvedValue(MOCK_MODERATION_QUEUE);
    mockedModerateItem.mockResolvedValue({ id: 5, moderationStatus: 'rejected' });
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Moderation tab/i }));
    await waitFor(() => screen.getByLabelText('Reject submitted.jpg'));

    fireEvent.click(screen.getByLabelText('Reject submitted.jpg'));

    await waitFor(() => expect(mockedModerateItem).toHaveBeenCalledWith('42', 5, 'rejected'));
  });

  it('shows error on moderation load failure', async () => {
    mockedListModerationQueue.mockRejectedValue(new Error('Queue load failed'));
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Moderation tab/i }));
    await waitFor(() => expect(screen.getByText('Queue load failed')).toBeInTheDocument());
  });
});

// ─── Slideshows tab (#459) ────────────────────────────────────────────────────

describe('GalleryPage Slideshows tab (#459)', () => {
  beforeEach(() => {
    mockedListGallery.mockResolvedValue(MOCK_ITEMS);
    mockedListAlbums.mockResolvedValue([]);
    mockedListSlideshows.mockReset();
    mockedCreateSlideshow.mockReset();
    mockedUpdateSlideshow.mockReset();
    mockedDeleteSlideshow.mockReset();
    mockedGetSlideshowItems.mockReset();
  });

  it('shows Slideshows tab', () => {
    mockedListGallery.mockReturnValue(new Promise(() => undefined));
    renderGallery();
    expect(screen.getByRole('tab', { name: /Slideshows tab/i })).toBeInTheDocument();
  });

  it('renders slideshow list when Slideshows tab is active', async () => {
    mockedListSlideshows.mockResolvedValue(MOCK_SLIDESHOWS);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => expect(screen.getByLabelText('Slideshows list')).toBeInTheDocument());
    expect(screen.getByText('Highlights 2026')).toBeInTheDocument();
  });

  it('shows empty state when no slideshows', async () => {
    mockedListSlideshows.mockResolvedValue([]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'No slideshows' })).toBeInTheDocument(),
    );
    expect(screen.getByText('No slideshows yet')).toBeInTheDocument();
  });

  it('creates a new slideshow', async () => {
    mockedListSlideshows.mockResolvedValue([]);
    mockedCreateSlideshow.mockResolvedValue(MOCK_SLIDESHOWS[0]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => screen.getByLabelText('Slideshow name'));

    fireEvent.change(screen.getByLabelText('Slideshow name'), {
      target: { value: 'Highlights 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create slideshow' }));

    await waitFor(() =>
      expect(mockedCreateSlideshow).toHaveBeenCalledWith('42', 'Highlights 2026', []),
    );
  });

  it('runs a slideshow', async () => {
    mockedListSlideshows.mockResolvedValue(MOCK_SLIDESHOWS);
    mockedGetSlideshowItems.mockResolvedValue([
      {
        id: 1,
        slideshowId: 20,
        documentId: 1,
        sortOrder: 0,
        fileName: 'document-1.jpg',
        originalName: 'sunset-stage.jpg',
        mimeType: 'image/jpeg',
        caption: null,
        url: '/api/uploads/event-documents/document-1.jpg',
      },
    ]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => screen.getByLabelText('Run slideshow Highlights 2026'));

    fireEvent.click(screen.getByLabelText('Run slideshow Highlights 2026'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('sunset-stage.jpg')).toBeInTheDocument();
  });

  it('deletes a slideshow after confirmation', async () => {
    mockedListSlideshows.mockResolvedValue(MOCK_SLIDESHOWS);
    mockedDeleteSlideshow.mockResolvedValue(undefined);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => screen.getByLabelText('Delete slideshow Highlights 2026'));

    fireEvent.click(screen.getByLabelText('Delete slideshow Highlights 2026'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete slideshow' }));

    await waitFor(() => expect(mockedDeleteSlideshow).toHaveBeenCalledWith('42', 20));
  });

  it('preserves existing slideshow items when editing', async () => {
    mockedListSlideshows.mockResolvedValue(MOCK_SLIDESHOWS);
    mockedGetSlideshowItems.mockResolvedValue([
      {
        id: 1,
        slideshowId: 20,
        documentId: 1,
        sortOrder: 0,
        fileName: 'document-1.jpg',
        originalName: 'sunset-stage.jpg',
        mimeType: 'image/jpeg',
        caption: null,
        url: '/api/uploads/event-documents/document-1.jpg',
      },
    ]);
    mockedUpdateSlideshow.mockResolvedValue(MOCK_SLIDESHOWS[0]);
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => screen.getByLabelText('Edit slideshow Highlights 2026'));

    fireEvent.click(screen.getByLabelText('Edit slideshow Highlights 2026'));
    await waitFor(() => expect(mockedGetSlideshowItems).toHaveBeenCalledWith('42', 20));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Highlights 2026')).toBeInTheDocument();
    expect(within(dialog).getByText('1 image(s) selected')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedUpdateSlideshow).toHaveBeenCalledWith('42', 20, {
        name: 'Highlights 2026',
        itemIds: [1],
      }),
    );
  });

  it('shows error on slideshow load failure', async () => {
    mockedListSlideshows.mockRejectedValue(new Error('Slideshow load failed'));
    renderGallery();
    fireEvent.click(screen.getByRole('tab', { name: /Slideshows tab/i }));
    await waitFor(() => expect(screen.getByText('Slideshow load failed')).toBeInTheDocument());
  });
});
