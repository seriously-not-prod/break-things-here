import {
  AdminPanelSettingsRounded,
  BarChartRounded,
  CalendarMonthRounded,
  DashboardRounded,
  LogoutRounded,
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
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';

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
  { label: 'Analytics', to: '/analytics', icon: <BarChartRounded />, adminOnly: true },
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
