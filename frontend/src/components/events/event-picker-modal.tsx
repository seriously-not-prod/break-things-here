import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  CalendarTodayRounded,
  CloseRounded,
  LocationOnRounded,
  SearchRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api-client';
import { setLastEventId } from '../../hooks/use-last-event';
import { useAuth } from '../../contexts/auth-context';
import { canEditEvent } from '../../utils/roles';

interface PickerEvent {
  id: number;
  title: string;
  date: string;
  end_date?: string | null;
  location?: string | null;
  status?: string;
}

interface EventPickerModalProps {
  open: boolean;
  /** Sub-path to navigate to after selection e.g. 'tasks', 'budget', 'guests' */
  targetSubPath: string;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  Draft: '#6b7280',
  Completed: '#3b82f6',
  Cancelled: '#ef4444',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const SUB_LABELS: Record<string, string> = {
  guests: 'Guests',
  tasks: 'Tasks',
  budget: 'Budget',
  vendors: 'Vendors',
  timeline: 'Timeline',
  gallery: 'Gallery',
  shopping: 'Shopping',
  analytics: 'Analytics',
  checkin: 'Check-in',
  seating: 'Seating',
};

export function EventPickerModal({ open, targetSubPath, onClose }: EventPickerModalProps): JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = canEditEvent(user?.roleName);
  const [events, setEvents] = useState<PickerEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    api
      .get<PickerEvent[] | { events: PickerEvent[] }>('/api/events?limit=100')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { events: PickerEvent[] }).events ?? [];
        setEvents(list);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q),
    );
  }, [events, search]);

  function handleSelect(event: PickerEvent): void {
    setLastEventId(event.id);
    onClose();
    navigate(`/events/${event.id}/${targetSubPath}`);
  }

  const targetLabel = SUB_LABELS[targetSubPath] ?? targetSubPath;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: { borderRadius: 3, maxHeight: '80vh' },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
          pt: 2.5,
          px: 3,
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Select an Event
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose which event to open <strong>{targetLabel}</strong> for
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRounded />
        </IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pb: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" sx={{ color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Divider />

      <DialogContent sx={{ p: 0, overflowY: 'auto' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {!loading && filtered.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
            <CalendarTodayRounded sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" fontWeight={500}>
              {search ? 'No events match your search' : 'No events yet'}
            </Typography>
            <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
              {search ? 'Try a different search term' : 'Create your first event to get started'}
            </Typography>
            {!search && canCreate && (
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                sx={{ mt: 2.5 }}
                onClick={() => { onClose(); navigate('/events/new'); }}
              >
                Create Event
              </Button>
            )}
          </Box>
        )}

        {!loading && filtered.length > 0 && (
          <List disablePadding>
            {filtered.map((event, idx) => {
              const statusColor = STATUS_COLORS[event.status ?? ''] ?? '#6b7280';
              const initials = event.title
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <Box key={event.id}>
                  <ListItemButton
                    onClick={() => handleSelect(event)}
                    sx={{
                      px: 3,
                      py: 1.5,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        mr: 2,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        bgcolor: 'primary.main',
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </Avatar>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                          {event.title}
                        </Typography>
                      }
                      secondary={
                        <Box
                          component="span"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.25, flexWrap: 'wrap' }}
                        >
                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <CalendarTodayRounded sx={{ fontSize: 12, color: 'text.disabled' }} />
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(event.date)}
                            </Typography>
                          </Box>
                          {event.location && (
                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <LocationOnRounded sx={{ fontSize: 12, color: 'text.disabled' }} />
                              <Typography variant="caption" color="text.secondary">
                                {event.location}
                              </Typography>
                            </Box>
                          )}
                          {event.status && (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                px: 0.75,
                                py: 0.125,
                                borderRadius: 1,
                                bgcolor: `${statusColor}18`,
                                color: statusColor,
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                lineHeight: 1.6,
                              }}
                            >
                              {event.status}
                            </Box>
                          )}
                        </Box>
                      }
                      disableTypography
                    />
                  </ListItemButton>
                  {idx < filtered.length - 1 && <Divider sx={{ ml: 9 }} />}
                </Box>
              );
            })}
          </List>
        )}
      </DialogContent>

      {!loading && filtered.length > 0 && (
        <>
          <Divider />
          <Box sx={{ px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" color="text.disabled">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </Typography>
            {canCreate && (
              <Button
                size="small"
                startIcon={<AddRounded />}
                onClick={() => { onClose(); navigate('/events/new'); }}
              >
                Create New Event
              </Button>
            )}
          </Box>
        </>
      )}
    </Dialog>
  );
}
