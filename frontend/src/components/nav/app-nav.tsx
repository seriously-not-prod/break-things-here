import {
  AccountBalanceWalletRounded,
  AddRounded,
  AnalyticsRounded,
  CalendarMonthRounded,
  CalendarTodayRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  DashboardRounded,
  ExpandLessRounded,
  ExpandMoreRounded,
  GroupsRounded,
  ImageRounded,
  ManageAccountsRounded,
  LogoutRounded,
  MailRounded,
  PersonRounded,
  ShoppingCartRounded,
  StorefrontRounded,
  TaskAltRounded,
  TimelineRounded,
} from '@mui/icons-material';
import {
  alpha,
  Avatar,
  Box,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/auth-context';
import { isAdmin } from '../../utils/roles';
import { NotificationCenter } from './notification-center';
import { useThemeMode } from '../../theme/theme-mode-context';
import { LightModeRounded, DarkModeRounded } from '@mui/icons-material';
import { useState, useCallback } from 'react';
import React from 'react';
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '../../theme/app-theme';
import { getLastEventId } from '../../hooks/use-last-event';
import { EventPickerModal } from '../events/event-picker-modal';

interface NavGroup {
  id: string;
  label: string;
  icon: JSX.Element;
  items: NavItem[];
}

interface NavItem {
  label: string;
  to: string;
  icon: JSX.Element;
  adminOnly?: boolean;
  end?: boolean;
  /** When set, clicking fires this instead of navigating to `to` */
  onClickOverride?: () => void;
  /** Sub-path this item represents, used to reopen picker if event changes */
  subPath?: string;
}

function buildNavGroups(eventId: string | null, onNeedEvent: (sub: string) => void): NavGroup[] {
  const ws = (sub: string): NavItem['to'] => (eventId ? `/events/${eventId}/${sub}` : '/events');
  // Workspace items ALWAYS open the event picker so the user can choose
  // which event to view — never silently default to the last-used event.
  const wsItem = (label: string, sub: string, icon: JSX.Element): NavItem => ({
    label,
    to: ws(sub),
    icon,
    subPath: sub,
    onClickOverride: () => onNeedEvent(sub),
  });
  return [
    {
      id: 'event-hub',
      label: 'Event Hub',
      icon: <CalendarMonthRounded />,
      items: [
        { label: 'All Events', to: '/events', icon: <CalendarMonthRounded />, end: true },
        { label: 'Create Event', to: '/events/new', icon: <AddRounded /> },
        { label: 'Calendar View', to: '/events/calendar', icon: <CalendarTodayRounded /> },
        { label: 'My Events', to: '/events/my', icon: <PersonRounded /> },
      ],
    },
    {
      id: 'workspace',
      label: 'Workspace',
      icon: <TaskAltRounded />,
      items: [
        wsItem('Guests', 'guests', <GroupsRounded />),
        wsItem('Tasks', 'tasks', <TaskAltRounded />),
        wsItem('Budget', 'budget', <AccountBalanceWalletRounded />),
        wsItem('Vendors', 'vendors', <StorefrontRounded />),
        wsItem('Timeline', 'timeline', <TimelineRounded />),
        wsItem('Gallery', 'gallery', <ImageRounded />),
        wsItem('Shopping', 'shopping', <ShoppingCartRounded />),
      ].map((item) => ({ ...item, stableKey: `ws-${item.subPath ?? item.label}` })),
    },
  ];
}

const ADMIN_NAV: NavItem[] = [
  { label: 'User Management', to: '/admin', icon: <ManageAccountsRounded />, adminOnly: true },
];

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }): JSX.Element {
  const location = useLocation();
  // For workspace items that use onClickOverride (no NavLink), detect active
  // state manually: match /events/<any-id>/<subPath>
  const isActiveOverride =
    item.onClickOverride && item.subPath
      ? new RegExp(`/events/\\d+/${item.subPath}(/|$)`).test(location.pathname)
      : false;

  const sharedSx = (theme: import('@mui/material').Theme) => ({
    color: 'rgba(255,255,255,0.7)',
    minHeight: 40,
    justifyContent: collapsed ? 'center' : 'flex-start',
    px: collapsed ? 1.5 : 1.25,
    '&.active': {
      backgroundColor: alpha(theme.palette.primary.main, 0.22),
      color: '#fff',
      '& .MuiListItemIcon-root': { color: theme.palette.primary.light },
    },
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.07)', color: '#fff' },
    '& .MuiListItemIcon-root': {
      color: 'rgba(255,255,255,0.5)',
      minWidth: collapsed ? 0 : 36,
      mr: collapsed ? 0 : undefined,
    },
  });

  const inner = (
    <>
      <ListItemIcon sx={{ color: 'inherit', transition: 'min-width 200ms ease' }}>
        {item.icon}
      </ListItemIcon>
      {!collapsed && (
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 500 }}
        />
      )}
    </>
  );

  const btn = item.onClickOverride ? (
    <ListItemButton
      onClick={item.onClickOverride}
      sx={(theme) => ({
        ...sharedSx(theme),
        ...(isActiveOverride && {
          backgroundColor: alpha(theme.palette.primary.main, 0.22),
          color: '#fff',
          '& .MuiListItemIcon-root': { color: theme.palette.primary.light },
        }),
      })}
    >
      {inner}
    </ListItemButton>
  ) : (
    <ListItemButton component={NavLink} to={item.to} end={item.end} sx={sharedSx}>
      {inner}
    </ListItemButton>
  );

  if (collapsed) {
    return (
      <Tooltip title={item.label} placement="right">
        {btn}
      </Tooltip>
    );
  }
  return btn;
}

function NavGroupSection({
  group,
  collapsed,
  defaultOpen = true,
}: {
  group: NavGroup;
  collapsed: boolean;
  defaultOpen?: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const { user } = useAuth();
  const location = useLocation();

  const visibleItems = group.items.filter((item) => {
    if (item.adminOnly && !isAdmin(user?.roleName)) return false;
    return true;
  });

  const isGroupActive = visibleItems.some(
    (item) => location.pathname === item.to || location.pathname.startsWith(item.to.split('?')[0]),
  );

  if (collapsed) {
    return (
      <Box sx={{ mb: 0.5 }}>
        <Tooltip title={group.label} placement="right">
          <ListItemButton
            sx={(theme) => ({
              justifyContent: 'center',
              px: 1.5,
              minHeight: 40,
              color: isGroupActive ? theme.palette.primary.light : 'rgba(255,255,255,0.5)',
              borderRadius: 8,
              mx: 1,
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.07)', color: '#fff' },
            })}
            onClick={() => setOpen((v) => !v)}
          >
            <ListItemIcon sx={{ minWidth: 0, color: 'inherit' }}>{group.icon}</ListItemIcon>
          </ListItemButton>
        </Tooltip>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 0.5 }}>
      <ListItemButton
        onClick={() => setOpen((v) => !v)}
        sx={{
          mx: 1,
          px: 1.25,
          minHeight: 36,
          borderRadius: 8,
          color: isGroupActive ? '#fff' : 'rgba(255,255,255,0.45)',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff' },
        }}
      >
        <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>{group.icon}</ListItemIcon>
        <ListItemText
          primary={group.label}
          primaryTypographyProps={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        />
        {open ? (
          <ExpandLessRounded sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
        ) : (
          <ExpandMoreRounded sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
        )}
      </ListItemButton>
      <Collapse in={open} timeout="auto">
        <List dense disablePadding sx={{ pl: 0.5 }}>
          {visibleItems.map((item) => (
            <NavItemRow
              key={(item as { stableKey?: string }).stableKey ?? item.to}
              item={item}
              collapsed={false}
            />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

export interface AppNavProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function AppNav({ collapsed, onToggleCollapse }: AppNavProps): React.ReactElement {
  const { user, logout } = useAuth();
  const { mode, toggleMode } = useThemeMode();
  const navigate = useNavigate();

  const lastEventId = getLastEventId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingSub, setPendingSub] = useState('');

  function openPicker(sub: string): void {
    setPendingSub(sub);
    setPickerOpen(true);
  }

  const navGroups = buildNavGroups(lastEventId, openPicker);
  const analyticsTo = lastEventId ? `/events/${lastEventId}/analytics` : '/events';
  const mainItems: NavItem[] = [
    { label: 'Dashboard', to: '/dashboard', icon: <DashboardRounded /> },
    { label: 'Messages', to: '/messages', icon: <MailRounded /> },
    {
      label: 'Analytics',
      to: analyticsTo,
      icon: <AnalyticsRounded />,
      subPath: 'analytics',
      onClickOverride: () => openPicker('analytics'),
    },
  ];

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const adminItems = ADMIN_NAV.filter((item) => {
    if (item.adminOnly && !isAdmin(user?.roleName)) return false;
    return true;
  });

  const drawerWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;
  const userInitials = (user?.displayName ?? user?.email ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          transition: 'width 250ms cubic-bezier(0.4,0,0.2,1)',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            overflowX: 'hidden',
            transition: 'width 250ms cubic-bezier(0.4,0,0.2,1)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        {/* ── Logo / Brand ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            px: collapsed ? 1 : 2,
            py: 1.5,
            minHeight: 60,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {!collapsed && (
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563EB 0%, #0ea5e9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '-0.5px',
                }}
              >
                EF
              </Box>
              <Box>
                <Typography
                  variant="subtitle1"
                  sx={{ color: '#fff', fontWeight: 800, lineHeight: 1.1, fontSize: '0.9375rem' }}
                >
                  eQuip Fest
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.625rem', lineHeight: 1 }}
                >
                  Festival Management
                </Typography>
              </Box>
            </Stack>
          )}
          {collapsed && (
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563EB 0%, #0ea5e9 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#fff',
              }}
            >
              EF
            </Box>
          )}
          {!collapsed && (
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              sx={{
                color: 'rgba(255,255,255,0.4)',
                '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
              }}
              aria-label="Collapse sidebar"
            >
              <ChevronLeftRounded />
            </IconButton>
          )}
        </Box>

        {/* ── Expand button when collapsed ── */}
        {collapsed && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 1,
              borderBottom: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <Tooltip title="Expand sidebar" placement="right">
              <IconButton
                size="small"
                onClick={onToggleCollapse}
                sx={{
                  color: 'rgba(255,255,255,0.4)',
                  '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
                }}
                aria-label="Expand sidebar"
              >
                <ChevronRightRounded />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* ── Notification Centre ── */}
        {!collapsed && (
          <Box
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
          >
            <NotificationCenter />
          </Box>
        )}
        {collapsed && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
            <NotificationCenter />
          </Box>
        )}

        {/* ── Scrollable Nav ── */}
        <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
          {/* Main items */}
          <List dense disablePadding>
            {mainItems.map((item) => (
              <NavItemRow key={item.to} item={item} collapsed={collapsed} />
            ))}
          </List>

          <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.07)' }} />

          {/* Grouped nav sections */}
          {!collapsed &&
            navGroups.map((group, idx) => (
              <NavGroupSection
                key={group.id}
                group={group}
                collapsed={false}
                defaultOpen={idx === 0}
              />
            ))}
          {collapsed &&
            navGroups.map((group) => (
              <NavGroupSection key={group.id} group={group} collapsed={true} />
            ))}

          {/* Admin */}
          {adminItems.length > 0 && (
            <>
              <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.07)' }} />
              <List dense disablePadding>
                {adminItems.map((item) => (
                  <NavItemRow key={item.to} item={item} collapsed={collapsed} />
                ))}
              </List>
            </>
          )}
        </Box>

        {/* ── Bottom: theme toggle + user profile ── */}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.07)' }} />
        <Box sx={{ p: collapsed ? 1 : 1.5 }}>
          {/* Dark mode toggle */}
          <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', mb: 1 }}>
            <Tooltip
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              placement="right"
            >
              <IconButton
                size="small"
                onClick={toggleMode}
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)' },
                }}
                aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {mode === 'dark' ? (
                  <LightModeRounded fontSize="small" />
                ) : (
                  <DarkModeRounded fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>

          {/* User profile */}
          <Tooltip
            title={collapsed ? (user?.displayName ?? user?.email ?? 'Profile') : ''}
            placement="right"
          >
            <ListItemButton
              component={NavLink}
              to="/profile"
              sx={{
                borderRadius: 8,
                px: collapsed ? 1 : 1.25,
                py: 0.75,
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: 'rgba(255,255,255,0.7)',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.07)', color: '#fff' },
                '&.active': { backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' },
              }}
            >
              <Avatar
                sx={{
                  width: 30,
                  height: 30,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  bgcolor: '#2563EB',
                  flexShrink: 0,
                  mr: collapsed ? 0 : 1.25,
                }}
              >
                {userInitials}
              </Avatar>
              {!collapsed && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '0.8125rem',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user?.displayName ?? 'User'}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6875rem', lineHeight: 1 }}
                  >
                    {user?.roleName ?? 'Member'}
                  </Typography>
                </Box>
              )}
            </ListItemButton>
          </Tooltip>

          {/* Logout */}
          <Tooltip title="Log out" placement="right">
            <ListItemButton
              onClick={handleLogout}
              sx={{
                mt: 0.5,
                borderRadius: 8,
                px: collapsed ? 1 : 1.25,
                py: 0.75,
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: 'rgba(255,255,255,0.4)',
                '&:hover': { backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171' },
              }}
              aria-label="Log out"
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: collapsed ? 0 : 36 }}>
                <LogoutRounded fontSize="small" />
              </ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary="Log out"
                  primaryTypographyProps={{ fontSize: '0.8125rem', fontWeight: 500 }}
                />
              )}
            </ListItemButton>
          </Tooltip>
        </Box>
      </Drawer>

      <EventPickerModal
        open={pickerOpen}
        targetSubPath={pendingSub}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}
