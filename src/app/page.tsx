import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import CelebrationIcon from '@mui/icons-material/Celebration';

export default function Home(): React.ReactElement {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <CelebrationIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="h1">
            Festival Event Planner
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" component="h2" gutterBottom>
            Welcome
          </Typography>
          <Typography variant="body1">
            Plan and manage your festival events.
          </Typography>
        </Box>
      </Container>
    </>
  );
}
