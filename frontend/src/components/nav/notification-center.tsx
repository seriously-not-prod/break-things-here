/**
 * Notification Centre
 * Bell icon with unread badge + dropdown list with mark-read, dismiss, and pagination.
 * Task #789
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { useNavigate } from 'react-router-dom';
import {
  listNotifications,
  markAllRead,
  markRead,
  dismissNotification,
  type Notification,
} from '../../services/notifications-service';
import { getIcon, formatTimeAgo } from '../notifications/notifications-panel';

const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;

export function NotificationCenter(): JSX.Element {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const open = Boolean(anchorEl);

  const fetchPage = useCallback(async (offset: number, append: boolean): Promise<void> => {
    try {
      if (!append) setError(null);
      const result = await listNotifications(PAGE_SIZE, offset);
      const items = result.notifications ?? [];
      setTotal(result.total ?? 0);
      setNotifications((prev) => (append ? [...prev, ...items] : items));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications.');
    }
  }, []);

  const loadInitial = useCallback(async (): Promise<void> => {
    setLoading(true);
    await fetchPage(0, false);
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    void loadInitial();
    pollRef.current = setInterval(() => void loadInitial(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadInitial]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const hasMore = notifications.length < total;

  async function handleLoadMore(): Promise<void> {
    setLoadingMore(true);
    await fetchPage(notifications.length, true);
    setLoadingMore(false);
  }

  async function handleMarkRead(notification: Notification): Promise<void> {
    if (notification.is_read) return;
    await markRead(notification.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)),
    );
  }

  async function handleMarkAllRead(): Promise<void> {
    await markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function handleDismiss(event: React.MouseEvent, notification: Notification): Promise<void> {
    event.stopPropagation();
    await dismissNotification(notification.id);
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    setTotal((prev) => Math.max(0, prev - 1));
  }

  async function handleClick(notification: Notification): Promise<void> {
    await handleMarkRead(notification);
    setAnchorEl(null);
    if (notification.link) {
      navigate(notification.link);
    }
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          color="inherit"
          aria-label={`Notifications, ${unreadCount} unread`}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsRounded />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { sx: { width: 380, maxWidth: 'calc(100vw - 24px)', mt: 1 } },
        }}
      >
        <Stack spacing={0}>
          {/* Header */}
          <Box sx={{ p: 2, pb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="h6" fontWeight={800}>
                  Notifications
                </Typography>
                <Typography variant="caption" color="text.secondary" aria-live="polite">
                  {unreadCount} unread
                </Typography>
              </Box>
              <Button
                size="small"
                onClick={() => void handleMarkAllRead()}
                disabled={unreadCount === 0}
              >
                Mark all read
              </Button>
            </Stack>
          </Box>
          <Divider />

          {/* Body */}
          {loading ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={64} />
              ))}
            </Stack>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Alert severity="error">{error}</Alert>
            </Box>
          ) : notifications.length === 0 ? (
            <Stack
              spacing={1}
              alignItems="center"
              justifyContent="center"
              sx={{ p: 4, textAlign: 'center' }}
            >
              <NotificationsNoneRounded color="disabled" />
              <Typography fontWeight={700}>You&apos;re all caught up</Typography>
              <Typography variant="body2" color="text.secondary">
                New RSVPs, budget warnings, and due tasks will show up here.
              </Typography>
            </Stack>
          ) : (
            <>
              <List disablePadding sx={{ maxHeight: 420, overflowY: 'auto' }}>
                {notifications.map((notification, idx) => (
                  <Box key={notification.id}>
                    <ListItemButton
                      alignItems="flex-start"
                      onClick={() => void handleClick(notification)}
                      sx={{
                        px: 2,
                        py: 1.5,
                        bgcolor: notification.is_read ? 'transparent' : 'action.hover',
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.25 }}>
                        {getIcon(notification.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Typography
                              variant="body2"
                              fontWeight={notification.is_read ? 600 : 800}
                            >
                              {notification.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {formatTimeAgo(notification.created_at)}
                            </Typography>
                          </Stack>
                        }
                        secondary={
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {notification.body ?? ''}
                          </Typography>
                        }
                      />
                      <Tooltip title="Dismiss">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={`Dismiss ${notification.title}`}
                          onClick={(e) => void handleDismiss(e, notification)}
                          sx={{ ml: 0.5, mt: 0.25, flexShrink: 0 }}
                        >
                          <CloseRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemButton>
                    {idx < notifications.length - 1 && <Divider component="li" />}
                  </Box>
                ))}
              </List>
              {hasMore && (
                <Box sx={{ p: 1.5, textAlign: 'center' }}>
                  <Button
                    size="small"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                    startIcon={loadingMore ? <CircularProgress size={14} /> : undefined}
                  >
                    {loadingMore ? 'Loading\u2026' : 'Load more'}
                  </Button>
                </Box>
              )}
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
}
