import { Box, Paper, Typography } from '@mui/material';
import { LoginForm } from './components/LoginForm/LoginForm.tsx';

function App(): JSX.Element {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        background: 'linear-gradient(180deg, #f5f9fc 0%, #e8f2f7 100%)'
      }}
    >
      <Paper elevation={3} sx={{ width: '100%', maxWidth: 480, p: 4 }}>
        <Typography component="h1" variant="h5" mb={2}>
          Login
        </Typography>
        <LoginForm />
      </Paper>
    </Box>
  );
}

export default App;
