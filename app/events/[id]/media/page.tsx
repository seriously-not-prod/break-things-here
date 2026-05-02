import React from 'react';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';

async function fetchStats(eventId: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const res = await fetch(`${base}/api/events/${eventId}/media/stats`);
  if (!res.ok) throw new Error('Failed to load');
  return res.json();
}

export default function MediaOverview({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery(['media-stats', params.id], () => fetchStats(params.id));

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Documents & Media</Typography>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[{
          key: 'documents', title: 'Total Documents', value: data?.totalDocuments
        }, { key: 'photos', title: 'Total Photos', value: data?.totalPhotos
        }, { key: 'storage', title: 'Storage Used', value: data ? `${(data.storageUsed/1024/1024).toFixed(1)} MB / ${(data.storageLimit/1024/1024).toFixed(0)} MB` : null
        }, { key: 'albums', title: 'Albums Created', value: data?.albumsCreated
        }].map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.key}>
            <Paper sx={{ p: 2, borderRadius: 2, boxShadow: '0 6px 18px rgba(108,99,255,0.08)' }}>
              <Typography variant="subtitle2" color="text.secondary">{c.title}</Typography>
              {isLoading ? <Skeleton /> : <Typography variant="h6" sx={{ color: 'text.primary' }}>{c.value ?? 0}</Typography>}
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Button variant="contained">Quick Upload Document</Button>
        <Button variant="contained">Quick Upload Photo</Button>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Recent Documents</Typography>
            {/* Recent documents list will be loaded by a separate endpoint */}
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6">Recent Photos</Typography>
            {/* Thumbnail grid */}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
