/**
 * Tests: ActivityFeedPanel
 * Covers: renders feed entries, empty state, loading skeleton.
 * BRD 3.12
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityFeedPanel } from '../src/components/events/activity-feed-panel';
import * as eventsService from '../src/services/events-service';
import type { ActivityFeedEntry } from '../src/services/events-service';

vi.mock('../src/services/events-service');

const mockedListFeed = vi.mocked(eventsService.listFeed);

// ── Mock data ─────────────────────────────────────────────────────────────────

const FEED_ENTRIES: ActivityFeedEntry[] = [
  {
    id: 1,
    event_id: 42,
    user_id: 7,
    action_type: 'rsvp_confirmed',
    description: 'Alice Smith confirmed attendance',
    link: '/events/42',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    actor_name: 'Alice Smith',
  },
  {
    id: 2,
    event_id: 42,
    user_id: 8,
    action_type: 'task_created',
    description: 'Task created: Set up stage',
    link: '/events/42',
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    actor_name: 'Bob Jones',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivityFeedPanel', () => {
  beforeEach(() => {
    mockedListFeed.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading skeletons while fetching', () => {
    mockedListFeed.mockReturnValue(new Promise(() => undefined)); // never resolves

    render(<ActivityFeedPanel eventId={42} />);

    // Skeletons are rendered while loading
    const skeleton = document.querySelector('.MuiSkeleton-root');
    expect(skeleton).toBeInTheDocument();
  });

  it('renders feed entries after data loads', async () => {
    mockedListFeed.mockResolvedValue(FEED_ENTRIES);

    render(<ActivityFeedPanel eventId={42} />);

    await waitFor(() => {
      expect(screen.getByText('Alice Smith confirmed attendance')).toBeInTheDocument();
    });
    expect(screen.getByText('Task created: Set up stage')).toBeInTheDocument();
  });

  it('renders actor name for each entry', async () => {
    mockedListFeed.mockResolvedValue(FEED_ENTRIES);

    render(<ActivityFeedPanel eventId={42} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Alice Smith')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Bob Jones')).toBeInTheDocument();
  });

  it('renders empty state when feed is empty', async () => {
    mockedListFeed.mockResolvedValue([]);

    render(<ActivityFeedPanel eventId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
    });
  });

  it('renders an error message when the API fails', async () => {
    mockedListFeed.mockRejectedValue(new Error('Network failure'));

    render(<ActivityFeedPanel eventId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/network failure/i)).toBeInTheDocument();
    });
  });

  it('renders the Activity Feed heading', async () => {
    mockedListFeed.mockResolvedValue([]);

    render(<ActivityFeedPanel eventId={42} />);

    await waitFor(() => {
      expect(screen.getByText(/activity feed/i)).toBeInTheDocument();
    });
  });

  it('calls listFeed with the correct eventId', async () => {
    mockedListFeed.mockResolvedValue([]);

    render(<ActivityFeedPanel eventId={99} />);

    await waitFor(() => {
      expect(mockedListFeed).toHaveBeenCalledWith(99);
    });
  });
});
