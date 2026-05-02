import React from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import FolderIcon from '@mui/icons-material/Folder';
import GridViewIcon from '@mui/icons-material/GridView';
import { usePathname } from 'next/navigation';

export default function Sidebar({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/events/${eventId}/media`;
  const items = [
    { href: `${base}`, label: 'Overview', icon: <GridViewIcon /> },
    { href: `${base}/documents`, label: 'Documents', icon: <InsertDriveFileIcon /> },
    { href: `${base}/photos`, label: 'Photo Gallery', icon: <PhotoLibraryIcon /> },
    { href: `${base}/albums`, label: 'Albums', icon: <FolderIcon /> },
  ];

  return (
    <Box sx={{ width: 260, bgcolor: '#1A1A2E', color: '#fff', borderRadius: 2, p: 2 }}>
      <Typography variant="h6" sx={{ color: '#fff', mb: 2 }}>Media</Typography>
      <List>
        {items.map((it) => {
          const active = pathname?.startsWith(it.href) ?? false;
          return (
            <ListItem key={it.href} sx={{ bgcolor: active ? 'rgba(108,99,255,0.12)' : 'transparent', borderRadius: 1 }}>
              <ListItemIcon sx={{ color: '#fff', minWidth: 40 }}>{it.icon}</ListItemIcon>
              <Link href={it.href} style={{ color: '#fff', textDecoration: 'none' }}>
                <ListItemText primary={it.label} primaryTypographyProps={{ style: { color: '#fff' } }} />
              </Link>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
