import { Box, Button, Typography } from '@mui/material';

interface DashboardProps {
  user?: { id: number; email: string; displayName?: string };
  onLogout?: () => void;
}

export default function Dashboard({ user, onLogout }: DashboardProps): JSX.Element {
  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Welcome{user?.displayName ? `, ${user.displayName}` : ''}
      </Typography>
      <Typography variant="body1" sx={{ mb: 3 }}>
        This is a simple dashboard placeholder. Add your components here.
      </Typography>
      <Button variant="contained" color="secondary" onClick={onLogout}>
        Log out
      </Button>
    </Box>
  );
}
