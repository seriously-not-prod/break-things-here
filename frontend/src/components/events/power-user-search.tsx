/**
 * Power-user global search dialog (#581).
 *
 * Triggered by Ctrl/Cmd+K. Renders a Spotlight-style overlay that queries the
 * /api/search endpoint and renders matches grouped by entity type. Selecting
 * a result navigates to the corresponding detail page.
 */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { globalSearch } from '../../services/events-service';

interface SearchHit {
  id: number | string;
  kind: string;
  [key: string]: unknown;
}

interface SearchState {
  loading: boolean;
  results: Record<string, SearchHit[]>;
  error: string | null;
}

const GROUP_LABELS: Record<string, string> = {
  events: 'Events',
  tasks: 'Tasks',
  rsvps: 'Guests',
  vendors: 'Vendors',
  gallery: 'Gallery',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PowerUserSearch({ open, onClose }: Props): JSX.Element {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ loading: false, results: {}, error: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setState({ loading: false, results: {}, error: null });
    }
  }, [open]);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const next = e.target.value;
    setQuery(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next.trim()) {
      setState({ loading: false, results: {}, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(next.trim(), { limit: 8 });
        setState({
          loading: false,
          results: data.results as unknown as Record<string, SearchHit[]>,
          error: null,
        });
      } catch (err) {
        setState({
          loading: false,
          results: {},
          error: err instanceof Error ? err.message : 'Search failed.',
        });
      }
    }, 250);
  }

  function navigateTo(hit: SearchHit): void {
    onClose();
    switch (hit['kind']) {
      case 'event':
        navigate(`/events/${hit['id']}`);
        break;
      case 'task':
      case 'rsvp':
      case 'vendor':
      case 'photo': {
        const eventId = hit['event_id'];
        if (eventId !== undefined) navigate(`/events/${eventId}`);
        break;
      }
      default:
        break;
    }
  }

  const groups = useMemo(
    () => Object.entries(state.results).filter(([, items]) => items.length > 0),
    [state.results],
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogContent>
        <TextField
          inputRef={inputRef}
          fullWidth
          autoFocus
          placeholder="Search events, tasks, guests, vendors, photos…"
          value={query}
          onChange={handleChange}
          data-testid="power-search-input"
          variant="standard"
          InputProps={{ disableUnderline: false }}
        />
        {state.loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={20} />
          </Box>
        )}
        {state.error && (
          <Typography color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>
            {state.error}
          </Typography>
        )}
        {!state.loading && groups.length === 0 && query.trim() && (
          <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
            No matches.
          </Typography>
        )}
        <List dense>
          {groups.map(([group, hits]) => (
            <Box key={group}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}
              >
                {GROUP_LABELS[group] ?? group}
              </Typography>
              {hits.map((hit) => (
                <ListItem key={`${group}-${hit['id']}`} disablePadding>
                  <ListItemButton onClick={() => navigateTo(hit)}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={500}>
                          {(hit['title'] as string) ??
                            (hit['name'] as string) ??
                            (hit['original_name'] as string) ??
                            String(hit['id'])}
                        </Typography>
                      }
                      secondary={
                        <Box
                          component="span"
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Chip
                            label={String(hit['kind'])}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          {(hit['event_title'] as string) && (
                            <Typography variant="caption" color="text.secondary">
                              {hit['event_title'] as string}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </Box>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
}
