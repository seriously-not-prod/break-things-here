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
  planned_start_time: '2026-06-01T18:00:00Z',
  planned_end_time: '2026-06-01T18:30:00Z',
  actual_start_time: '2026-06-01T18:05:00Z',
  actual_end_time: '2026-06-01T18:35:00Z',
  status: 'completed',
  location: 'Main Entrance',
  vendor_id: null,
  sort_order: 0,
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockComparison: timelineService.TimelineComparisonResponse = {
  comparison: [
    {
      id: 1,
      title: 'Doors Open',
      status: 'completed',
      location: 'Main Entrance',
      vendor_id: null,
      sort_order: 0,
      planned_start_time: '2026-06-01T18:00:00Z',
      planned_end_time: '2026-06-01T18:30:00Z',
      actual_start_time: '2026-06-01T18:05:00Z',
      actual_end_time: '2026-06-01T18:35:00Z',
      start_variance_minutes: 5,
      end_variance_minutes: 5,
      planned_duration_minutes: 30,
      actual_duration_minutes: 30,
    },
  ],
  summary: { total: 1, planned: 0, in_progress: 0, completed: 1, skipped: 0 },
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
    mockedTimeline.getTimelineComparison.mockResolvedValue(mockComparison);
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

  it('shows activity status chip', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    expect(screen.getByText('completed')).toBeInTheDocument();
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
  }, 15000);

  it('dialog includes planned and actual time fields', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/planned start/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/actual start/i)).toBeInTheDocument();
  }, 15000);

  it('dialog includes a status selector', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('button', { name: /add activity/i }));
    await screen.findByRole('dialog');
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  }, 15000);

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

  it('shows the Planned vs Actual tab', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    expect(screen.getByRole('tab', { name: /planned vs actual/i })).toBeInTheDocument();
  });

  it('switches to comparison tab and shows data', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('tab', { name: /planned vs actual/i }));
    expect(await screen.findByRole('table', { name: /planned vs actual timeline comparison/i })).toBeInTheDocument();
    expect(mockedTimeline.getTimelineComparison).toHaveBeenCalledWith(1);
  }, 15000);

  it('comparison table shows variance', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('tab', { name: /planned vs actual/i }));
    await screen.findByRole('table');
    // +5 minutes variance
    expect(screen.getByText('+5m')).toBeInTheDocument();
  }, 15000);

  it('comparison tab shows summary chips', async () => {
    renderPage();
    await screen.findByText('Doors Open');
    await userEvent.click(screen.getByRole('tab', { name: /planned vs actual/i }));
    await screen.findByRole('table');
    expect(screen.getByText(/total: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/completed: 1/i)).toBeInTheDocument();
  }, 15000);
});

