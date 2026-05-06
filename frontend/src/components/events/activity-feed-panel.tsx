import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Skeleton,
  Typography,
} from '@mui/material';
import FeedRounded from '@mui/icons-material/FeedRounded';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { listFeed } from '../../services/events-service';
import type { ActivityFeedEntry } from '../../services/events-service';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ActivityFeedPanelProps {
  eventId: number | string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

function avatarColor(name: string | null): string {
  const colors = [
    '#1976d2', '#388e3c', '#f57c00', '#7b1fa2',
    '#c62828', '#00838f', '#558b2f', '#ad1457',
  ] as const;
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Skeleton rows shown while loading ─────────────────────────────────────────

function FeedSkeleton(): JSX.Element {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <ListItem key={i} alignItems="flex-start" divider>
          <ListItemAvatar>
            <Skeleton variant="circular" width={40} height={40} />
          </ListItemAvatar>
          <ListItemText
            primary={<Skeleton width="60%" />}
            secondary={<Skeleton width="40%" />}
          />
        </ListItem>
      ))}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

export function ActivityFeedPanel({ eventId }: ActivityFeedPanelProps): JSX.Element {
  const [feed, setFeed] = useState<ActivityFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFeed = useCallback(async (): Promise<void> => {
    try {
      const entries = await listFeed(eventId);
      setFeed(entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity feed.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetchFeed();
    intervalRef.current = setInterval(() => { void fetchFeed(); }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [fetchFeed]);

  return (
    <Paper variant="outlined" sx={{ mt: 1 }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FeedRounded fontSize="small" />
          Activity Feed
        </Typography>
      </Box>

      {error && (
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography color="error" variant="body2">{error}</Typography>
        </Box>
      )}

      <List disablePadding aria-label="Activity feed">
        {loading ? (
          <FeedSkeleton />
        ) : feed.length === 0 ? (
          <ListItem>
            <ListItemText
              primary={
                <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                  No activity yet. Actions like RSVPs, tasks, and expenses will appear here.
                </Typography>
              }
            />
          </ListItem>
        ) : (
          feed.map((entry) => (
            <ListItem key={entry.id} alignItems="flex-start" divider>
              <ListItemAvatar>
                <Avatar
                  sx={{ bgcolor: avatarColor(entry.actor_name), width: 36, height: 36, fontSize: '0.75rem' }}
                  aria-label={entry.actor_name ?? 'System'}
                >
                  {initials(entry.actor_name)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Typography variant="body2">
                    {entry.description}
                  </Typography>
                }
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {entry.actor_name ?? 'System'} · {timeAgo(entry.created_at)}
                  </Typography>
                }
              />
            </ListItem>
          ))
        )}
      </List>
    </Paper>
  );
}
