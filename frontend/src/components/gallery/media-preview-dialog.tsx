import { useEffect, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBackIosNewRounded,
  ArrowForwardIosRounded,
  CheckRounded,
  CloseRounded,
  DeleteRounded,
  EditRounded,
} from '@mui/icons-material';
import type { GalleryItem } from '../../services/gallery-service';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface MediaPreviewDialogProps {
  items: GalleryItem[];
  initialIndex: number;
  onClose: () => void;
  /** Called when the user confirms a delete action inside the dialog. */
  onDelete?: (itemId: number) => void;
  /** Called when the user saves an updated caption. */
  onCaptionUpdate?: (itemId: number, caption: string) => void;
}

export function MediaPreviewDialog({
  items,
  initialIndex,
  onClose,
  onDelete,
  onCaptionUpdate,
}: MediaPreviewDialogProps): JSX.Element {
  const [index, setIndex] = useState(initialIndex);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');

  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  // Reset caption editor whenever the viewed item changes
  useEffect(() => {
    setEditingCaption(false);
    setCaptionDraft(item?.caption ?? '');
  }, [index, item?.caption]);

  function goPrev(): void {
    if (hasPrev) setIndex((i) => i - 1);
  }

  function goNext(): void {
    if (hasNext) setIndex((i) => i + 1);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (editingCaption) return; // let the text field handle keys
    if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 'ArrowRight') goNext();
  }

  function handleCaptionSave(): void {
    if (item && onCaptionUpdate) {
      onCaptionUpdate(item.id, captionDraft);
    }
    setEditingCaption(false);
  }

  function handleDelete(): void {
    if (item && onDelete) {
      onDelete(item.id);
      onClose();
    }
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
          {item.caption && (
            <Typography variant="body2" color="text.primary" sx={{ mt: 0.5, fontStyle: 'italic' }}>
              {item.caption}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {onDelete && (
            <Tooltip title="Delete image">
              <IconButton onClick={handleDelete} aria-label="Delete image" size="small" color="error">
                <DeleteRounded />
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} aria-label="Close preview" size="small">
            <CloseRounded />
          </IconButton>
        </Box>
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
          alt={item.caption ?? item.originalName}
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

      {/* Caption area */}
      <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
        {editingCaption ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              fullWidth
              size="small"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              placeholder="Add a caption…"
              inputProps={{ 'aria-label': 'Caption input', maxLength: 500 }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCaptionSave(); }
                if (e.key === 'Escape') setEditingCaption(false);
              }}
            />
            <Tooltip title="Save caption">
              <IconButton onClick={handleCaptionSave} aria-label="Save caption" size="small" color="primary">
                <CheckRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title="Cancel">
              <IconButton onClick={() => setEditingCaption(false)} aria-label="Cancel caption edit" size="small">
                <CloseRounded />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant="body2"
              color={item.caption ? 'text.primary' : 'text.disabled'}
              sx={{ flex: 1 }}
            >
              {item.caption ?? 'No caption'}
            </Typography>
            {onCaptionUpdate && (
              <Tooltip title="Edit caption">
                <IconButton
                  onClick={() => {
                    setCaptionDraft(item.caption ?? '');
                    setEditingCaption(true);
                  }}
                  aria-label="Edit caption"
                  size="small"
                >
                  <EditRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', pb: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {index + 1} / {items.length}
        </Typography>
      </Box>
    </Dialog>
  );
}
