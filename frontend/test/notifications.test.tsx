/**
 * Notifications Tests
 * Tests for NotificationsPanel and NotificationBell components.
 * BRD 3.11
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPanel } from '../src/components/notifications/notifications-panel';
import { NotificationBell } from '../src/components/notifications/notification-bell';
import * as notificationsService from '../src/services/notifications-service';
import type { Notification } from '../src/services/notifications-service';

vi.mock('../src/services/notifications-service', () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  getDueTaskAlerts: vi.fn(),
}));

const mockedService = vi.mocked(notificationsService);

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 1,
    user_id: 10,
    type: 'rsvp',
    title: 'New RSVP',
    body: 'Alice confirmed attendance.',
    link: '/events/5/guests',
    is_read: false,
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: 2,
    user_id: 10,
    type: 'budget_alert',
    title: 'Budget Warning',
    body: 'Category "Catering" is at 92% of its allocation.',
    link: '/events/5/budget',
    is_read: true,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 3,
    user_id: 10,
    type: 'task_due',
    title: 'Task Due Soon',
    body: 'Task "Book stage" for event "Summer Festival" is due soon.',
    link: null,
    is_read: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

function renderPanel(
  notifications: Notification[] = MOCK_NOTIFICATIONS,
  loading = false,
  error: string | null = null,
): ReturnType<typeof render> {
  const onClose = vi.fn();
  const onMarkRead = vi.fn().mockResolvedValue(undefined);
  const onMarkAllRead = vi.fn().mockResolvedValue(undefined);

  return render(
    <MemoryRouter>
      <NotificationsPanel
        anchorEl={document.body}
        open
        notifications={notifications}
        loading={loading}
        error={error}
        onClose={onClose}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
      />
    </MemoryRouter>,
  );
}

describe('NotificationsPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the panel heading', () => {
    renderPanel();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows unread count', () => {
    renderPanel();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  it('renders all notification titles', () => {
    renderPanel();
    expect(screen.getByText('New RSVP')).toBeInTheDocument();
    expect(screen.getByText('Budget Warning')).toBeInTheDocument();
    expect(screen.getByText('Task Due Soon')).toBeInTheDocument();
  });

  it('renders notification bodies', () => {
    renderPanel();
    expect(screen.getByText('Alice confirmed attendance.')).toBeInTheDocument();
    expect(
      screen.getByText(/Category "Catering" is at 92%/i),
    ).toBeInTheDocument();
  });

  it('shows loading skeletons when loading is true', () => {
    renderPanel([], true);
    // When loading=true the notification list is hidden; heading still present
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.queryByText('New RSVP')).toBeNull();
  });

  it('shows error alert when error is set', () => {
    renderPanel([], false, 'Failed to load notifications.');
    expect(screen.getByText('Failed to load notifications.')).toBeInTheDocument();
  });

  it('shows empty state when notification list is empty', () => {
    renderPanel([]);
    expect(screen.getByText(/You're all caught up/i)).toBeInTheDocument();
  });

  it('calls onMarkRead when a notification is clicked', async () => {
    const user = userEvent.setup();
    const onMarkRead = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <NotificationsPanel
          anchorEl={document.body}
          open
          notifications={MOCK_NOTIFICATIONS}
          loading={false}
          error={null}
          onClose={vi.fn()}
          onMarkRead={onMarkRead}
          onMarkAllRead={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByText('New RSVP'));
    await waitFor(() => {
      expect(onMarkRead).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
      );
    });
  });

  it('calls onMarkAllRead when "Mark all read" button is clicked', async () => {
    const user = userEvent.setup();
    const onMarkAllRead = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <NotificationsPanel
          anchorEl={document.body}
          open
          notifications={MOCK_NOTIFICATIONS}
          loading={false}
          error={null}
          onClose={vi.fn()}
          onMarkRead={vi.fn().mockResolvedValue(undefined)}
          onMarkAllRead={onMarkAllRead}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => {
      expect(onMarkAllRead).toHaveBeenCalled();
    });
  });

  it('"Mark all read" button is disabled when all are read', () => {
    const allRead = MOCK_NOTIFICATIONS.map((n) => ({ ...n, is_read: true }));
    renderPanel(allRead);
    expect(
      screen.getByRole('button', { name: /mark all read/i }),
    ).toBeDisabled();
  });

  it('has aria-live region for unread count (accessible updates)', () => {
    renderPanel();
    const liveRegion = screen.getByText('2 unread');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });
});

describe('NotificationBell', () => {
  beforeEach(() => {
    mockedService.listNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
    mockedService.markAllRead.mockResolvedValue(undefined);
    mockedService.markRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  function renderBell(): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );
  }

  it('renders the bell icon button', async () => {
    renderBell();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /notifications/i }),
      ).toBeInTheDocument();
    });
  });

  it('shows unread badge count after notifications load', async () => {
    renderBell();
    await waitFor(() => {
      // Badge content: 2 unread notifications in MOCK_NOTIFICATIONS
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('opens the notifications panel on bell click', async () => {
    const user = userEvent.setup();
    renderBell();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });
  });

  it('polls listNotifications every 60 seconds', async () => {
    vi.useFakeTimers();
    mockedService.listNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);

    renderBell();

    // Flush microtasks so the initial async load completes
    await vi.runAllTicks();

    expect(mockedService.listNotifications).toHaveBeenCalledTimes(1);

    // Advance 60 s to trigger the interval
    await vi.advanceTimersByTimeAsync(60000);

    expect(mockedService.listNotifications).toHaveBeenCalledTimes(2);
  });
});
