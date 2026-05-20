/**
 * Tests for NotificationCenter component
 * Task #789
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationCenter } from '../src/components/nav/notification-center';
import * as notificationsService from '../src/services/notifications-service';
import type { Notification } from '../src/services/notifications-service';

vi.mock('../src/services/notifications-service', () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  dismissNotification: vi.fn(),
}));

const service = vi.mocked(notificationsService);

function mkNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    user_id: 10,
    type: 'task_due',
    title: 'Task is due',
    body: 'Some body text',
    link: '/events/1',
    is_read: false,
    created_at: new Date(Date.now() - 300_000).toISOString(),
    ...overrides,
  };
}

const ITEMS: Notification[] = [
  mkNotification({ id: 1, title: 'First', is_read: false }),
  mkNotification({ id: 2, title: 'Second', is_read: true }),
  mkNotification({ id: 3, title: 'Third', is_read: false }),
];

function renderCenter(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NotificationCenter />
    </MemoryRouter>,
  );
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    service.listNotifications.mockResolvedValue({ notifications: ITEMS, total: ITEMS.length });
    service.markRead.mockResolvedValue(undefined);
    service.markAllRead.mockResolvedValue(undefined);
    service.dismissNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders bell icon with unread badge', async () => {
    renderCenter();
    const btn = await screen.findByRole('button', { name: /notifications/i });
    expect(btn).toBeDefined();
  });

  it('opens dropdown when bell is clicked', async () => {
    renderCenter();
    const btn = await screen.findByRole('button', { name: /notifications/i });
    fireEvent.click(btn);
    expect(await screen.findByText('Notifications')).toBeDefined();
  });

  it('displays notification titles in dropdown', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('First')).toBeDefined();
    expect(screen.getByText('Second')).toBeDefined();
    expect(screen.getByText('Third')).toBeDefined();
  });

  it('shows unread count', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('2 unread')).toBeDefined();
  });

  it('shows empty state when no notifications', async () => {
    service.listNotifications.mockResolvedValue({ notifications: [], total: 0 });
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/all caught up/i)).toBeDefined();
  });

  it('shows loading skeletons initially', () => {
    service.listNotifications.mockReturnValue(new Promise(() => {}));
    renderCenter();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.queryByText('First')).toBeNull();
  });

  it('shows error state', async () => {
    service.listNotifications.mockRejectedValue(new Error('Server error'));
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Server error')).toBeDefined();
  });

  it('calls markRead when clicking a notification', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    fireEvent.click(await screen.findByText('First'));
    await waitFor(() => expect(service.markRead).toHaveBeenCalledWith(1));
  });

  it('calls markAllRead', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    fireEvent.click(await screen.findByText('Mark all read'));
    await waitFor(() => expect(service.markAllRead).toHaveBeenCalled());
  });

  it('disables mark-all-read when no unread', async () => {
    const allRead = ITEMS.map((n) => ({ ...n, is_read: true }));
    service.listNotifications.mockResolvedValue({ notifications: allRead, total: allRead.length });
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    const markAllBtn = await screen.findByText('Mark all read');
    expect(markAllBtn.closest('button')?.disabled).toBe(true);
  });

  it('calls dismissNotification when dismiss button clicked', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    const dismissBtn = await screen.findByRole('button', { name: /dismiss first/i });
    fireEvent.click(dismissBtn);
    await waitFor(() => expect(service.dismissNotification).toHaveBeenCalledWith(1));
  });

  it('shows Load more when there are more items', async () => {
    service.listNotifications.mockResolvedValue({ notifications: ITEMS.slice(0, 2), total: 5 });
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText('Load more')).toBeDefined();
  });

  it('hides Load more when all loaded', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await screen.findByText('First');
    expect(screen.queryByText('Load more')).toBeNull();
  });

  it('polls for notifications on interval', async () => {
    renderCenter();
    await waitFor(() => expect(service.listNotifications).toHaveBeenCalled());
    const callsBefore = service.listNotifications.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() =>
      expect(service.listNotifications.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('shows aria-live region with unread count', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    const live = await screen.findByText('2 unread');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });
});
