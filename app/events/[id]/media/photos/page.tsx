import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

async function fetchPhotos(eventId: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const res = await fetch(`${base}/api/events/${eventId}/photos`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export default function PhotosPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery(['photos', params.id], () => fetchPhotos(params.id));

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Photo Gallery</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2">Drag & drop or choose photos to upload (JPG, PNG, WebP, HEIC).</Typography>
      </Paper>

      <Grid container spacing={2}>
        {(data?.photos ?? []).map((p: any) => (
          <Grid item xs={6} sm={4} md={3} key={p.id}>
            <Paper sx={{ p: 0 }}>
              <img src={`/api/events/${params.id}/photos/${p.id}/download`} alt={p.caption || p.original_name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
