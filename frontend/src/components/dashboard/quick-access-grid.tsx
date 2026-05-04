/**
 * Quick Access Grid — issue #372
 * Navigation shortcuts to /events, /profile, /admin + placeholder chips for future features.
 */

import { Box, Button, Chip, Grid, Typography } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ImageIcon from '@mui/icons-material/Image';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AuthUser } from '../../contexts/auth-context';

export interface QuickAccessGridProps {
  user: AuthUser | null;
}

interface PlaceholderFeature {
  label: string;
  icon: ReactElement;
}

const PLACEHOLDER_FEATURES: PlaceholderFeature[] = [
  { label: 'Gallery', icon: <ImageIcon fontSize="small" /> },
  { label: 'Check-in', icon: <HowToRegIcon fontSize="small" /> },
  { label: 'Budget', icon: <AttachMoneyIcon fontSize="small" /> },
  { label: 'Seating', icon: <TableRestaurantIcon fontSize="small" /> },
];

export function QuickAccessGrid({ user }: QuickAccessGridProps): JSX.Element {
  const navigate = useNavigate();
  const isAdmin = user?.roleName === 'Admin';

  return (
    <Box>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={isAdmin ? 4 : 6}>
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

        <Grid item xs={12} sm={isAdmin ? 4 : 6}>
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
          <Grid item xs={12} sm={4}>
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

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 2, mb: 0.75, display: 'block' }}
      >
        Coming soon
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {PLACEHOLDER_FEATURES.map((feat) => (
          <Chip
            key={feat.label}
            icon={feat.icon}
            label={feat.label}
            size="small"
            disabled
            aria-label={`${feat.label} — coming soon`}
          />
        ))}
      </Box>
    </Box>
  );
}
