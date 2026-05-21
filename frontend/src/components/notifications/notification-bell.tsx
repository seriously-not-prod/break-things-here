/**
 * Notification Bell
 * Polls notifications every 60 seconds and opens the notifications panel.
 */

import { useEffect, useMemo, useState } from 'react';
import { Badge, IconButton } from '@mui/material';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import {
  listNotifications,
  markAllRead,
  markRead,
  type Notification,
} from '../../services/notifications-service';
import { NotificationsPanel } from './notifications-panel';

const POLL_INTERVAL_MS = 60000;

export function NotificationBell(): JSX.Element {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications(): Promise<void> {
    try {
      setError(null);
      const result = await listNotifications();
      setNotifications(result.notifications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      if (!active) return;
      await loadNotifications();
    }

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  async function handleMarkRead(notification: Notification): Promise<void> {
    if (!notification.is_read) {
      await markRead(notification.id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      );
    }
  }

  async function handleMarkAllRead(): Promise<void> {
    await markAllRead();
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  return (
    <>
      <IconButton
        color="inherit"
        aria-label={`Notifications, ${unreadCount} unread`}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsRounded />
        </Badge>
      </IconButton>
      <NotificationsPanel
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        notifications={notifications}
        loading={loading}
        error={error}
        onClose={() => setAnchorEl(null)}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
      />
    </>
  );
}
