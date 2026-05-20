/**
 * Notifications Panel
 * Popover content anchored to the notification bell.
 */

import { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import ReplyRounded from '@mui/icons-material/ReplyRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../../services/notifications-service';

interface NotificationsPanelProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onMarkRead: (notification: Notification) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
}

export function getIcon(type: string): JSX.Element {
  if (type === 'task_due') return <TaskAltRounded fontSize="small" />;
  if (type === 'rsvp') return <ReplyRounded fontSize="small" />;
  if (type === 'budget_alert') return <WarningAmberRounded fontSize="small" />;
  return <NotificationsNoneRounded fontSize="small" />;
}

export function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationsPanel({
  anchorEl,
  open,
  notifications,
  loading,
  error,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: NotificationsPanelProps): JSX.Element {
  const navigate = useNavigate();
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications],
  );

  async function handleClick(notification: Notification): Promise<void> {
    await onMarkRead(notification);
    onClose();
    if (notification.link) {
      navigate(notification.link);
    }
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{ sx: { width: 360, maxWidth: 'calc(100vw - 24px)', mt: 1 } }}
    >
      <Stack spacing={0}>
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
            <Button size="small" onClick={() => void onMarkAllRead()} disabled={unreadCount === 0}>
              Mark all read
            </Button>
          </Stack>
        </Box>
        <Divider />

        {loading ? (
          <Stack spacing={1} sx={{ p: 2 }}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} variant="rounded" height={64} />
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
            <Typography fontWeight={700}>You're all caught up</Typography>
            <Typography variant="body2" color="text.secondary">
              New RSVPs, budget warnings, and due tasks will show up here.
            </Typography>
          </Stack>
        ) : (
          <List disablePadding sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {notifications.map((notification, index) => (
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
                        <Typography variant="body2" fontWeight={notification.is_read ? 600 : 800}>
                          {notification.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
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
                </ListItemButton>
                {index < notifications.length - 1 && <Divider component="li" />}
              </Box>
            ))}
          </List>
        )}
      </Stack>
    </Popover>
  );
}
