import {
  AdminPanelSettingsRounded,
  CalendarMonthRounded,
  DashboardRounded,
  LogoutRounded,
  NotificationsRounded,
  PersonRounded,
} from '@mui/icons-material';
import {
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api-client';

const DRAWER_WIDTH = 220;

interface NavItem {
  label: string;
  to: string;
  icon: JSX.Element;
  adminOnly?: boolean;
}

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  read: number;
  link: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardRounded /> },
  { label: 'Events', to: '/events', icon: <CalendarMonthRounded /> },
  { label: 'Profile', to: '/profile', icon: <PersonRounded /> },
  { label: 'Admin', to: '/admin', icon: <AdminPanelSettingsRounded />, adminOnly: true },
];

const POLL_INTERVAL_MS = 60_000; // refresh notification count every minute

export function AppNav(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchNotifications(): Promise<void> {
    if (!user) return;
    try {
      const data = await api.get<NotificationsResponse>('/api/notifications');
      setNotifications(data.notifications.slice(0, 10));
      setUnreadCount(data.unreadCount);
    } catch {
      // silent — notifications are non-critical
    }
  }

  useEffect(() => {
    void fetchNotifications();
    pollRef.current = setInterval(() => { void fetchNotifications(); }, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleMarkAllRead(): Promise<void> {
    try {
      await api.patch('/api/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  async function handleMarkOneRead(id: number): Promise<void> {
    try {
      await api.patch(`/api/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login');
  }

  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user?.roleId !== 3) return false;
    return true;
  });

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography variant="h6" noWrap fontWeight={700} color="primary">
          🎪 FestPlanner
        </Typography>
        <Tooltip title="Notifications">
          <IconButton
            size="small"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            aria-label="Open notifications"
          >
            <Badge badgeContent={unreadCount} color="error" max={99}>
              <NotificationsRounded fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      </Toolbar>

      {/* Notification dropdown */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { width: 320, maxHeight: 400 } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
          {unreadCount > 0 && (
            <Typography
              variant="caption"
              color="primary"
              sx={{ cursor: 'pointer' }}
              onClick={() => { void handleMarkAllRead(); }}
            >
              Mark all read
            </Typography>
          )}
        </Box>
        <Divider />
        {notifications.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">No notifications</Typography>
          </MenuItem>
        ) : (
          notifications.map((n) => (
            <MenuItem
              key={n.id}
              onClick={() => { if (n.read === 0) void handleMarkOneRead(n.id); setAnchorEl(null); }}
              sx={{ opacity: n.read ? 0.6 : 1, whiteSpace: 'normal', alignItems: 'flex-start', py: 1 }}
            >
              <Box>
                <Typography variant="body2" fontWeight={n.read ? 400 : 700}>
                  {n.title}
                </Typography>
                {n.body ? (
                  <Typography variant="caption" color="text.secondary">{n.body}</Typography>
                ) : null}
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>

      <Divider />
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <List dense>
          {items.map(({ label, to, icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              sx={{
                '&.active': { backgroundColor: 'action.selected', fontWeight: 700 },
              }}
            >
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Divider />
      <List dense>
        <ListItemButton onClick={handleLogout}>
          <ListItemIcon><LogoutRounded /></ListItemIcon>
          <ListItemText primary="Log out" />
        </ListItemButton>
      </List>
    </Drawer>
  );
}

const DRAWER_WIDTH = 220;

interface NavItem {
  label: string;
  to: string;
  icon: JSX.Element;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardRounded /> },
  { label: 'Events', to: '/events', icon: <CalendarMonthRounded /> },
  { label: 'Profile', to: '/profile', icon: <PersonRounded /> },
  { label: 'Admin', to: '/admin', icon: <AdminPanelSettingsRounded />, adminOnly: true },
];

export function AppNav(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login');
  }

  const items = NAV_ITEMS.filter((item) => {
    if (item.adminOnly && user?.roleId !== 3) return false;
    return true;
  });

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
      }}
    >
      <Toolbar>
        <Typography variant="h6" noWrap fontWeight={700} color="primary">
          🎪 FestPlanner
        </Typography>
      </Toolbar>
      <Divider />
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <List dense>
          {items.map(({ label, to, icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              sx={{
                '&.active': { backgroundColor: 'action.selected', fontWeight: 700 },
              }}
            >
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Divider />
      <List dense>
        <ListItemButton onClick={handleLogout}>
          <ListItemIcon><LogoutRounded /></ListItemIcon>
          <ListItemText primary="Log out" />
        </ListItemButton>
      </List>
    </Drawer>
  );
}
