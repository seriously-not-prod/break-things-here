import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

const CATEGORIES = ['Contract','Invoice','Permit','Itinerary','Checklist','Budget','Vendor','Other'];

async function fetchDocuments(eventId: string, q?: string, category?: string) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category) params.set('category', category);
  const res = await fetch(`${base}/api/events/${eventId}/documents?${params.toString()}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

export default function DocumentsPage({ params }: { params: { id: string } }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery(['documents', params.id, q, category], () => fetchDocuments(params.id, q, category));

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Documents</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <Button variant="contained">Upload Document</Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Uploaded</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? null : data?.documents?.map((d: any) => (
              <TableRow key={d.id}>
                <TableCell>{d.display_name || d.original_name}</TableCell>
                <TableCell>{d.category || '-'}</TableCell>
                <TableCell>{(d.file_size/1024).toFixed(1)} KB</TableCell>
                <TableCell>{new Date(d.created_at).toLocaleString()}</TableCell>
                <TableCell>
                  <Button size="small" href={`/api/events/${params.id}/documents/${d.id}`}>Download</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
