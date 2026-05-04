import {
  AdminPanelSettingsRounded,
  CalendarMonthRounded,
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
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { NotificationBell } from '../notifications/notification-bell';

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
  { label: 'Messages', to: '/messages', icon: <MailRounded /> },
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
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography variant="h6" noWrap fontWeight={700} color="primary">
          🎪 FestPlanner
        </Typography>
        <Stack direction="row" alignItems="center">
          <NotificationBell />
        </Stack>
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
