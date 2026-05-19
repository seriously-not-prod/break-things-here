/**
 * Quick Access Grid — issue #372
 * Navigation shortcuts to the modules already available in the dedicated frontend.
 */

import { Box, Button, Grid } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventIcon from '@mui/icons-material/Event';
import MailRoundedIcon from '@mui/icons-material/MailRounded';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../../contexts/auth-context';
import { canEditEvent, isAdmin as isAdminRole } from '../../utils/roles';

export interface QuickAccessGridProps {
  user: AuthUser | null;
}

export function QuickAccessGrid({ user }: QuickAccessGridProps): JSX.Element {
  const navigate = useNavigate();
  const isAdmin = isAdminRole(user?.roleName);
  const canCreateEvent = canEditEvent(user?.roleName);

  return (
    <Box>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<EventIcon />}
            onClick={() => navigate('/events')}
            aria-label="Go to Events page"
          >
            Events
          </Button>
        </Grid>

        {canCreateEvent && (
          <Grid item xs={12} sm={6}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddCircleOutlineIcon />}
              onClick={() => navigate('/events/new')}
              aria-label="Create a new event"
            >
              Create Event
            </Button>
          </Grid>
        )}

        <Grid item xs={12} sm={canCreateEvent ? 6 : 12}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<CalendarMonthIcon />}
            onClick={() => navigate('/events/calendar')}
            aria-label="Open the event calendar"
          >
            Calendar
          </Button>
        </Grid>

        <Grid item xs={12} sm={6}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<MailRoundedIcon />}
            onClick={() => navigate('/messages')}
            aria-label="Open messages"
          >
            Messages
          </Button>
        </Grid>

        <Grid item xs={12} sm={isAdmin ? 6 : 12}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<PersonIcon />}
            onClick={() => navigate('/profile')}
            aria-label="Go to Profile page"
          >
            Profile
          </Button>
        </Grid>

        {isAdmin && (
          <Grid item xs={12} sm={6}>
            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              startIcon={<AdminPanelSettingsIcon />}
              onClick={() => navigate('/admin')}
              aria-label="Go to Admin page"
            >
              Admin
            </Button>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
