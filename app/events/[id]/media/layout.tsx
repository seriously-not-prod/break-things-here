import React from 'react';
import Sidebar from '../../../components/Sidebar';
import Box from '@mui/material/Box';

export default function MediaLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default', p: 2 }}>
      <Sidebar eventId={params.id} />
      <Box component="main" sx={{ flex: 1, ml: 3 }}>
        {children}
      </Box>
    </Box>
  );
}
