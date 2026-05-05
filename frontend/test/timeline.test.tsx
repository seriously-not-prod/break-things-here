import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TimelinePage from '../src/components/timeline/timeline-page';
import * as timelineService from '../src/services/timeline-service';
import * as vendorsService from '../src/services/vendors-service';

vi.mock('../src/services/timeline-service');
vi.mock('../src/services/vendors-service');

const mockedTimeline = vi.mocked(timelineService);
const mockedVendors = vi.mocked(vendorsService);

const mockActivity: timelineService.TimelineActivity = {
  id: 1,
  event_id: 1,
  title: 'Doors Open',
  description: 'Guests begin arriving',
  start_time: '2026-06-01T18:00:00Z',
  end_time: '2026-06-01T18:30:00Z',
  location: 'Main Entrance',
  vendor_id: null,
  sort_order: 0,
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/events/1/timeline']}>
      <Routes>
        <Route path="/events/:id/timeline" element={<TimelinePage />} />
        <Route path="/events/:id" element={<div>Event Detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TimelinePage', () => {
  beforeEach(() => {
    mockedTimeline.listActivities.mockResolvedValue([mockActivity]);
    mockedVendors.listVendors.mockResolvedValue([]);
    mockedTimeline.createActivity.mockResolvedValue({
      ...mockActivity,
      id: 2,
      title: 'Opening Speech',
      start_time: '2026-06-01T19:00:00Z',
      end_time: '2026-06-01T19:30:00Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders timeline activities', async () => {
    renderPage();
    expect(await screen.findByText('Doors Open')).toBeInTheDocument();
    expect(screen.getByText(/Main Entrance/)).toBeInTheDocument();
  });

  it('shows the Add Activity button', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    expect(screen.getByRole('button', { name: /add activity/i })).toBeInTheDocument();
  });

  it('opens the add activity dialog on button click', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('submits a new activity', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/title/i), 'Opening Speech');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(mockedTimeline.createActivity).toHaveBeenCalledTimes(1));
  }, 15000);

  it('shows empty state when no activities', async () => {
    mockedTimeline.listActivities.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/no activities scheduled/i)).toBeInTheDocument();
  });
});
