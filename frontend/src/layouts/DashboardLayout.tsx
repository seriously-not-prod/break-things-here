import React, { useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton,
  List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Avatar, Menu, MenuItem, Divider, Tooltip, Badge, useTheme,
  useMediaQuery, CssBaseline,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  FolderOpen as ProjectsIcon,
  Assignment as TasksIcon,
  People as UsersIcon,
  Timeline as ActivityIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  Festival as LogoIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const DRAWER_FULL = 240;
const DRAWER_MINI = 64;

const NAV_ITEMS = [
  { label: 'Dashboard',     path: '/',              icon: <DashboardIcon /> },
  { label: 'Projects',      path: '/projects',      icon: <ProjectsIcon /> },
  { label: 'Tasks',         path: '/tasks',         icon: <TasksIcon /> },
  { label: 'Users',         path: '/users',         icon: <UsersIcon /> },
  { label: 'Activity Logs', path: '/activity',      icon: <ActivityIcon /> },
  { label: 'Settings',      path: '/settings',      icon: <SettingsIcon /> },
];

interface Props { children: ReactNode }

export default function DashboardLayout({ children }: Props) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const drawerWidth = collapsed && !isMobile ? DRAWER_MINI : DRAWER_FULL;

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate('/login');
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'primary.dark' }}>
      {/* Logo */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, py: 2, minHeight: 64,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <LogoIcon sx={{ color: 'primary.light', fontSize: 28 }} />
        {(!collapsed || isMobile) && (
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 700, whiteSpace: 'nowrap' }}>
            FestPlanner
          </Typography>
        )}
      </Box>

      {/* Nav Items */}
      <List sx={{ flex: 1, py: 1 }}>
        {NAV_ITEMS.map(({ label, path, icon }) => {
          const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <ListItem key={path} disablePadding sx={{ display: 'block', px: 1, mb: 0.5 }}>
              <Tooltip title={collapsed && !isMobile ? label : ''} placement="right">
                <ListItemButton
                  component={Link}
                  to={path}
                  onClick={() => isMobile && setMobileOpen(false)}
                  sx={{
                    borderRadius: 2,
                    minHeight: 44,
                    px: collapsed && !isMobile ? 1.5 : 2,
                    justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
                    bgcolor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
                  }}
                >
                  <ListItemIcon sx={{
                    color: active ? 'white' : 'rgba(255,255,255,0.7)',
                    minWidth: collapsed && !isMobile ? 0 : 40,
                    mr: collapsed && !isMobile ? 0 : 1,
                  }}>
                    {icon}
                  </ListItemIcon>
                  {(!collapsed || isMobile) && (
                    <ListItemText
                      primary={label}
                      primaryTypographyProps={{
                        fontSize: 14,
                        fontWeight: active ? 600 : 400,
                        color: active ? 'white' : 'rgba(255,255,255,0.8)',
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <Box sx={{ p: 1, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <ListItemButton
            onClick={() => setCollapsed(!collapsed)}
            sx={{ borderRadius: 2, justifyContent: 'center', color: 'rgba(255,255,255,0.7)' }}
          >
            <ChevronLeftIcon sx={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </ListItemButton>
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      {/* Top AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          transition: 'width 0.2s, margin 0.2s',
          bgcolor: 'white',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar>
          {isMobile && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1, color: 'text.primary' }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.primary', fontWeight: 600 }}>
            {NAV_ITEMS.find(n => n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path))?.label ?? 'Dashboard'}
          </Typography>

          <Tooltip title="Notifications">
            <IconButton sx={{ color: 'text.secondary', mr: 0.5 }}>
              <Badge badgeContent={3} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="Account">
            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                {user?.display_name?.[0]?.toUpperCase() ?? 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{ elevation: 2, sx: { mt: 0.5, minWidth: 180 } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={600}>{user?.display_name}</Typography>
          <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setAnchorEl(null); navigate('/profile'); }}>
          <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Sidebar — Mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_FULL } }}
      >
        {drawerContent}
      </Drawer>

      {/* Sidebar — Desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 0.2s',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 0.2s',
            border: 'none',
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: '#f5f6fa',
          minHeight: '100vh',
          p: { xs: 2, sm: 3 },
          mt: 8,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          transition: 'width 0.2s',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
