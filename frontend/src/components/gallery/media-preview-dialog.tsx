import { useEffect, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from '@mui/material';
import {
  ArrowBackIosNewRounded,
  ArrowForwardIosRounded,
  CloseRounded,
} from '@mui/icons-material';
import type { GalleryItem } from '../../services/gallery-service';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface MediaPreviewDialogProps {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
}

export function MediaPreviewDialog({
  items,
  initialIndex,
  onClose,
}: MediaPreviewDialogProps): JSX.Element {
  const [index, setIndex] = useState(initialIndex);

  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  function goPrev(): void {
    if (hasPrev) setIndex((i) => i - 1);
  }

  function goNext(): void {
    if (hasNext) setIndex((i) => i + 1);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 'ArrowRight') goNext();
  }

  if (!item) return <></>;

  const formattedDate = new Date(item.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="md"
      onKeyDown={handleKeyDown}
      aria-labelledby="preview-dialog-title"
    >
      <DialogTitle
        id="preview-dialog-title"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600} component="span">
            {item.originalName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Uploaded {formattedDate}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close preview" size="small">
          <CloseRounded />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          bgcolor: 'black',
          minHeight: 320,
        }}
      >
        {hasPrev && (
          <IconButton
            onClick={goPrev}
            aria-label="Previous image"
            sx={{
              position: 'absolute',
              left: 8,
              zIndex: 1,
              color: 'white',
              bgcolor: 'rgba(0,0,0,0.4)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}
          >
            <ArrowBackIosNewRounded />
          </IconButton>
        )}

        <img
          src={`${API_BASE}${item.url}`}
          alt={item.originalName}
          style={{
            maxWidth: '100%',
            maxHeight: '70vh',
            objectFit: 'contain',
            display: 'block',
          }}
        />

        {hasNext && (
          <IconButton
            onClick={goNext}
            aria-label="Next image"
            sx={{
              position: 'absolute',
              right: 8,
              zIndex: 1,
              color: 'white',
              bgcolor: 'rgba(0,0,0,0.4)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}
          >
            <ArrowForwardIosRounded />
          </IconButton>
        )}
      </DialogContent>

      <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {index + 1} / {items.length}
        </Typography>
      </Box>
    </Dialog>
  );
}
