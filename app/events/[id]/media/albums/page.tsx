import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';

export default function AlbumsPage({ params }: { params: { id: string } }) {
  return (
    <Box>
      <Typography variant="h5">Albums</Typography>
      <Paper sx={{ p: 2, mt: 2 }}>
        <Button variant="contained">Create Album</Button>
        <Typography variant="body2" sx={{ mt: 2 }}>No albums yet.</Typography>
      </Paper>
    </Box>
  );
}
