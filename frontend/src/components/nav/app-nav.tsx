import {
  AddRounded,
  AdminPanelSettingsRounded,
  CalendarMonthRounded,
  CalendarTodayRounded,
  DashboardRounded,
  LogoutRounded,
  MailRounded,
  PersonRounded,
} from '@mui/icons-material';
import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { NotificationBell } from '../notifications/notification-bell';

const DRAWER_WIDTH = 260;

interface NavItem {
  label: string;
  to: string;
  icon: JSX.Element;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardRounded /> },
  { label: 'Profile', to: '/profile', icon: <PersonRounded /> },
  { label: 'Messages', to: '/messages', icon: <MailRounded /> },
  { label: 'Admin', to: '/admin', icon: <AdminPanelSettingsRounded />, adminOnly: true },
];

const EVENT_HUB_ITEMS: NavItem[] = [
  { label: 'All Events', to: '/events', icon: <CalendarMonthRounded /> },
  { label: 'Create Event', to: '/events/new', icon: <AddRounded /> },
  { label: 'Calendar View', to: '/events/calendar', icon: <CalendarTodayRounded /> },
  { label: 'My Events', to: '/events/my', icon: <PersonRounded /> },
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
      sx={(theme) => ({
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: '#1A0E3C',
          color: theme.palette.common.white,
        },
      })}
    >
      {/* Top-left: app name — Top-right: notification bell */}
      <Toolbar sx={{ justifyContent: 'space-between', gap: 1 }}>
        <Typography
          variant="subtitle1"
          fontWeight={700}
          sx={{ color: 'common.white', lineHeight: 1.2, flexShrink: 1, minWidth: 0 }}
        >
          🗓 eQuip Fest Planner
        </Typography>
        <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
          <NotificationBell />
        </Stack>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Middle: scrollable nav items */}
      <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
        <List
          dense
          subheader={
            <ListSubheader sx={{ color: 'rgba(255,255,255,0.9)', bgcolor: 'transparent' }}>
              Event Hub
            </ListSubheader>
          }
        >
          {EVENT_HUB_ITEMS.map(({ label, to, icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              sx={(theme) => ({
                color: theme.palette.common.white,
                '&.active': {
                  backgroundColor: theme.palette.action.selected,
                  fontWeight: 700,
                  color: theme.palette.primary.main,
                },
                '&.active .MuiListItemIcon-root, & .MuiListItemIcon-root': { color: 'inherit' },
              })}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>

        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.06)' }} />

        <List dense>
          {items.map(({ label, to, icon }) => (
            <ListItemButton
              key={to}
              component={NavLink}
              to={to}
              sx={(theme) => ({
                color: theme.palette.common.white,
                '&.active': {
                  backgroundColor: theme.palette.action.selected,
                  fontWeight: 700,
                  color: theme.palette.primary.main,
                },
                '&.active .MuiListItemIcon-root, & .MuiListItemIcon-root': { color: 'inherit' },
              })}
            >
              <ListItemIcon sx={{ color: 'inherit' }}>{icon}</ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      {/* Bottom: logout */}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      {user && (
        <List dense>
          <ListItemButton
            onClick={handleLogout}
            sx={(theme) => ({
              color: theme.palette.common.white,
              '& .MuiListItemIcon-root': { color: theme.palette.common.white },
            })}
          >
            <ListItemIcon><LogoutRounded /></ListItemIcon>
            <ListItemText primary="Log out" />
          </ListItemButton>
        </List>
      )}
    </Drawer>
  );
}
