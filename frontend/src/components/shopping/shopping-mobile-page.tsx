/**
 * Mobile-optimised Shopping Page — #799
 *
 * Large tap targets, status toggle (Needed ↔ Purchased), and item search
 * tuned for 360×640 portrait. Optimistic status updates are queued and
 * retried when the device comes back online; the queue is held in memory
 * (and persisted to localStorage so a reload doesn't drop updates) and
 * drained by the browser's `online` event.
 */

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import CloudOffRounded from '@mui/icons-material/CloudOffRounded';
import CloudDoneRounded from '@mui/icons-material/CloudDoneRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type ShoppingItem,
  type ShoppingItemStatus,
  listShoppingItems,
  listShoppingLists,
  updateShoppingItem,
} from '../../services/shopping-service';

type Filter = 'needed' | 'purchased' | 'all';

interface FlatItem extends ShoppingItem {
  list_name: string;
}

interface QueuedUpdate {
  eventId: number;
  listId: number;
  itemId: number;
  status: ShoppingItemStatus;
  queuedAt: number;
}

const QUEUE_STORAGE_KEY = 'shopping-mobile-retry-queue:v1';

function loadQueue(): QueuedUpdate[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedUpdate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedUpdate[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Quota exceeded — drop silently; in-memory queue still operates.
  }
}

export default function ShoppingMobilePage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);
  const navigate = useNavigate();

  const [items, setItems] = useState<FlatItem[]>([]);
  const [filter, setFilter] = useState<Filter>('needed');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [queue, setQueue] = useState<QueuedUpdate[]>(() => loadQueue());
  const [snack, setSnack] = useState<{ open: boolean; message: string }>({
    open: false,
    message: '',
  });

  const draining = useRef(false);

  const loadAll = useCallback(async (): Promise<void> => {
    if (!Number.isFinite(eventId)) return;
    setLoading(true);
    setError(null);
    try {
      const lists = await listShoppingLists(eventId);
      const grouped = await Promise.all(
        lists.map(async (list) => {
          const listItems = await listShoppingItems(eventId, list.id);
          return listItems.map<FlatItem>((item) => ({ ...item, list_name: list.name }));
        }),
      );
      setItems(grouped.flat());
    } catch {
      setError('Failed to load shopping items.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => saveQueue(queue), [queue]);

  // Drain the retry queue (best-effort). Triggered when we go back online,
  // when the queue is populated, or on mount if there are pending updates.
  const drainQueue = useCallback(async (): Promise<void> => {
    if (draining.current) return;
    if (queue.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    draining.current = true;
    let remaining = [...queue];
    try {
      for (const update of [...remaining]) {
        try {
          await updateShoppingItem(update.eventId, update.listId, update.itemId, {
            status: update.status,
          });
          remaining = remaining.filter((q) => q !== update);
          setQueue(remaining);
        } catch {
          // Stop the drain at the first failure — keep the rest queued.
          break;
        }
      }
      if (remaining.length === 0) {
        setSnack({ open: true, message: 'All offline updates synced.' });
      }
    } finally {
      draining.current = false;
      setQueue(remaining);
    }
  }, [queue]);

  useEffect(() => {
    const handleOnline = (): void => {
      setOnline(true);
      void drainQueue();
    };
    const handleOffline = (): void => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [drainQueue]);

  useEffect(() => {
    if (online && queue.length > 0) {
      void drainQueue();
    }
  }, [online, queue, drainQueue]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'needed' && item.status === 'Purchased') return false;
      if (filter === 'purchased' && item.status !== 'Purchased') return false;
      if (
        q &&
        !item.name.toLowerCase().includes(q) &&
        !(item.notes ?? '').toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [items, filter, search]);

  const togglePurchased = useCallback(
    async (item: FlatItem): Promise<void> => {
      const next: ShoppingItemStatus = item.status === 'Purchased' ? 'Needed' : 'Purchased';
      // Optimistic update
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setQueue((prev) => [
          ...prev.filter((q) => q.itemId !== item.id),
          { eventId, listId: item.list_id, itemId: item.id, status: next, queuedAt: Date.now() },
        ]);
        setSnack({ open: true, message: 'Offline — change will sync when you reconnect.' });
        return;
      }
      try {
        await updateShoppingItem(eventId, item.list_id, item.id, { status: next });
      } catch {
        setQueue((prev) => [
          ...prev.filter((q) => q.itemId !== item.id),
          { eventId, listId: item.list_id, itemId: item.id, status: next, queuedAt: Date.now() },
        ]);
        setSnack({ open: true, message: 'Sync failed — queued for retry.' });
      }
    },
    [eventId],
  );

  return (
    <Box sx={{ p: 1.5, pb: 6, maxWidth: 480, mx: 'auto' }} data-testid="shopping-mobile-page">
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <IconButton
          onClick={() => navigate(`/events/${eventId}/shopping`)}
          aria-label="Back to desktop shopping"
          size="large"
        >
          <ArrowBackRounded />
        </IconButton>
        <Typography variant="h6" component="h1" sx={{ flex: 1 }}>
          Shopping
        </Typography>
        <Badge
          color={online ? 'success' : 'error'}
          variant="dot"
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          {online ? <CloudDoneRounded color="success" /> : <CloudOffRounded color="error" />}
        </Badge>
        {queue.length > 0 && (
          <Typography
            variant="caption"
            color="warning.main"
            sx={{ ml: 0.5 }}
            data-testid="shopping-mobile-queue-count"
          >
            {queue.length} queued
          </Typography>
        )}
      </Stack>

      <TextField
        fullWidth
        size="medium"
        placeholder="Search items"
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRounded />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 1.5 }}
        inputProps={{ 'aria-label': 'Search shopping items', autoCapitalize: 'none' }}
      />

      <ToggleButtonGroup
        size="small"
        exclusive
        fullWidth
        value={filter}
        onChange={(_, v: Filter | null) => v && setFilter(v)}
        aria-label="Filter items"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="needed" data-testid="mobile-filter-needed">
          Needed
        </ToggleButton>
        <ToggleButton value="purchased" data-testid="mobile-filter-purchased">
          Purchased
        </ToggleButton>
        <ToggleButton value="all" data-testid="mobile-filter-all">
          All
        </ToggleButton>
      </ToggleButtonGroup>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No items match your filter.</Typography>
        </Box>
      ) : (
        <Stack spacing={1.5} role="list" aria-label="Shopping items">
          {filtered.map((item) => (
            <Button
              key={item.id}
              role="listitem"
              data-testid={`mobile-item-${item.id}`}
              fullWidth
              onClick={() => void togglePurchased(item)}
              sx={{
                py: 1.5,
                px: 2,
                justifyContent: 'flex-start',
                textAlign: 'left',
                bgcolor: item.status === 'Purchased' ? 'success.50' : 'background.paper',
                color: 'text.primary',
                border: '1px solid',
                borderColor: item.status === 'Purchased' ? 'success.light' : 'divider',
                minHeight: 64,
                fontWeight: 500,
              }}
              startIcon={
                item.status === 'Purchased' ? (
                  <CheckCircleRounded color="success" />
                ) : (
                  <RadioButtonUncheckedRounded color="action" />
                )
              }
              aria-label={`Toggle ${item.name} (currently ${item.status})`}
              aria-pressed={item.status === 'Purchased'}
            >
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="body1"
                  sx={{
                    fontWeight: 600,
                    textDecoration: item.status === 'Purchased' ? 'line-through' : 'none',
                  }}
                >
                  {item.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {item.list_name} · qty {item.quantity}
                  {item.unit ? ` ${item.unit}` : ''}
                  {item.estimated_cost !== null &&
                    ` · ${`$${Number(item.estimated_cost).toFixed(2)}`}`}
                </Typography>
              </Box>
            </Button>
          ))}
        </Stack>
      )}

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setSnack((prev) => ({ ...prev, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
