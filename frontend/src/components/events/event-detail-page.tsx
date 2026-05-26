import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import {
  AttachMoneyRounded,
  CameraAltRounded,
  EventSeatRounded,
  GroupsRounded,
  HistoryRounded,
  InsightsRounded,
  HowToRegRounded,
  PhotoLibraryRounded,
  ShoppingCartRounded,
  StorefrontRounded,
  TimelineRounded,
  ViewKanbanRounded,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { PageLayout } from '../layout/page-layout';
import { setLastEventId } from '../../hooks/use-last-event';
import { api, apiFetch, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';
import { canEditEvent, isAdmin } from '../../utils/roles';
import { ActivityFeedPanel } from './activity-feed-panel';
import EventLocationMap from './event-location-map';
import EventCustomFieldsPanel from './event-custom-fields-panel';
import VersionHistoryDrawer from '../collab/version-history-drawer';
import { EventChatPanel } from '../collaboration/event-chat-panel';
import { Badge } from '@mui/material';
import { archiveEvent, unarchiveEvent } from '../../services/events-service';
import { EventTasksTab } from './EventTasksTab';
import { EventRsvpsTab } from './EventRsvpsTab';
import { EventTeamTab } from './EventTeamTab';
import { EventDocumentsTab } from './EventDocumentsTab';

interface PlannerEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  date: string;
  event_date?: string;
  event_time?: string | null;
  capacity: number | null;
  status: string;
  creator_name: string | null;
  cover_image_url?: string | null;
  event_type?: string | null;
  // Story #414 additions
  latitude?: number | null;
  longitude?: number | null;
  waitlist_enabled?: boolean | null;
  // BRD v2 (#540, #578)
  archived_at?: string | null;
  archived_by?: number | null;
  archive_reason?: string | null;
  created_by?: number;
}

interface Task {
  id: number;
  title: string;
  notes: string | null;
  assignee_name: string | null;
  assigned_user_id: number | null;
  due_date: string | null;
  status: string;
  priority: string;
}

interface Rsvp {
  id: number;
  name: string;
  email: string;
  guests: number;
  status: string;
  notes: string | null;
  source: string;
}

interface EventMember {
  user_id: number;
  display_name: string;
  email: string;
  role: string;
  joined_at: string;
}

interface EventDocument {
  id: number;
  event_id: number;
  original_name: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}

interface EventDocumentsResponse {
  documents?: EventDocument[];
}

interface UserOption {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

function normalizePlannerEvent(event: PlannerEvent): PlannerEvent {
  const eventDate = event.date ?? event.event_date ?? '';
  return {
    ...event,
    date: eventDate,
    event_date: eventDate,
  };
}

export default function EventDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<PlannerEvent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [members, setMembers] = useState<EventMember[]>([]);
  const [documents, setDocuments] = useState<EventDocument[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  // Cover image upload state
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // #807 — Version history drawer
  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false);
  // #808 — chat unread badge
  const [chatUnread, setChatUnread] = useState(0);

  const canEdit = user && canEditEvent(user.roleName);
  const goingHeadcount = rsvps.reduce(
    (sum, rsvp) => sum + (rsvp.status === 'Going' ? Number(rsvp.guests || 1) : 0),
    0,
  );
  const remainingCapacity =
    event?.capacity === null || event?.capacity === undefined
      ? null
      : Math.max(event.capacity - goingHeadcount, 0);
  const waitlistOverflow =
    event?.capacity == null ? 0 : Math.max(goingHeadcount - event.capacity, 0);

  const moduleLinks = [
    {
      label: 'Guests',
      icon: <GroupsRounded />,
      path: `/events/${id}/guests`,
    },
    {
      label: 'Check-In',
      icon: <HowToRegRounded />,
      path: `/events/${id}/checkin`,
    },
    {
      label: 'Seating',
      icon: <EventSeatRounded />,
      path: `/events/${id}/seating`,
    },
    {
      label: 'Budget',
      icon: <AttachMoneyRounded />,
      path: `/events/${id}/budget`,
    },
    {
      label: 'Tasks',
      icon: <ViewKanbanRounded />,
      path: `/events/${id}/tasks`,
    },
    {
      label: 'Timeline',
      icon: <TimelineRounded />,
      path: `/events/${id}/timeline`,
    },
    {
      label: 'Vendors',
      icon: <StorefrontRounded />,
      path: `/events/${id}/vendors`,
    },
    {
      label: 'Shopping',
      icon: <ShoppingCartRounded />,
      path: `/events/${id}/shopping`,
    },
    {
      label: 'Analytics',
      icon: <InsightsRounded />,
      path: `/events/${id}/analytics`,
    },
    {
      label: 'Gallery',
      icon: <PhotoLibraryRounded />,
      path: `/events/${id}/gallery`,
    },
  ];

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const data = await api.get<{
        event: PlannerEvent;
        tasks: Task[];
        rsvps: Rsvp[];
        members: EventMember[];
        availableUsers: UserOption[];
      }>(`/api/events/${id}`);
      setEvent(normalizePlannerEvent(data.event));
      setTasks(data.tasks);
      setRsvps(data.rsvps);
      setMembers(data.members ?? []);
      setAvailableUsers(data.availableUsers ?? []);
      const docs = await api.get<EventDocumentsResponse | EventDocument[]>(
        `/api/events/${id}/documents`,
      );
      setDocuments(Array.isArray(docs) ? docs : (docs.documents ?? []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load event.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  // Persist last-visited event id so sidebar workspace links resolve correctly
  useEffect(() => {
    if (id) setLastEventId(id);
  }, [id]);

  async function uploadCoverImage(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverError(null);
    try {
      // Step 1: upload the file via the existing documents endpoint
      const formData = new FormData();
      formData.append('document', file);
      const uploadRes = await apiFetch(`/api/events/${id}/documents`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = (await uploadRes.json().catch(() => ({ error: uploadRes.statusText }))) as {
          error?: string;
        };
        throw new Error(body.error ?? uploadRes.statusText);
      }
      const uploadData = (await uploadRes.json()) as { document?: { file_name?: string } };
      const fileName: string = uploadData.document?.file_name ?? '';
      if (!fileName) throw new Error('Upload did not return a file name.');

      // Step 2: set the cover_image_url reference on the event
      const coverUrl = `/api/uploads/event-documents/${fileName}`;
      await api.patch(`/api/events/${id}/cover`, { cover_image_url: coverUrl });
      await load();
      if (coverInputRef.current) coverInputRef.current.value = '';
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : 'Cover image upload failed.');
    } finally {
      setCoverUploading(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!event) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error ?? 'Event not found.'}</Alert>
      </Box>
    );
  }

  return (
    <PageLayout
      title={event.title}
      subtitle={
        event.date
          ? `${new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${event.event_time ? ` at ${event.event_time}` : ''}`
          : undefined
      }
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: event.title }]}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        {/* Cover image banner */}
        {event.cover_image_url && (
          <Box
            sx={{
              width: '100%',
              height: 220,
              overflow: 'hidden',
              mb: 2,
              borderRadius: 1,
              position: 'relative',
            }}
          >
            <Box
              component="img"
              src={event.cover_image_url}
              alt="Event cover"
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {canEdit && (
              <Box
                component="label"
                aria-label="Change cover image"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  borderRadius: '50%',
                  p: 0.75,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#fff',
                }}
              >
                {coverUploading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <CameraAltRounded fontSize="small" />
                )}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  ref={coverInputRef}
                  onChange={uploadCoverImage}
                />
              </Box>
            )}
          </Box>
        )}
        {!event.cover_image_url && canEdit && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Button
              component="label"
              size="small"
              startIcon={
                coverUploading ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <CameraAltRounded />
                )
              }
              variant="outlined"
              disabled={coverUploading}
            >
              {coverUploading ? 'Uploading…' : 'Set Cover Image'}
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                ref={coverInputRef}
                onChange={uploadCoverImage}
              />
            </Button>
            {coverError && (
              <Typography variant="caption" color="error">
                {coverError}
              </Typography>
            )}
          </Box>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              {event.title}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mt: 0.5, flexWrap: 'wrap' }}
            >
              {event.event_type && (
                <Chip label={event.event_type} size="small" color="info" variant="outlined" />
              )}
              <Typography variant="body2" color="text.secondary">
                {new Date(event.date).toLocaleDateString()}{' '}
                {event.event_time ? `at ${event.event_time}` : ''}
                {event.location ? ` · ${event.location}` : ''}
              </Typography>
            </Stack>
            {event.capacity !== null && event.capacity !== undefined && (
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ mt: 0.5, flexWrap: 'wrap' }}
              >
                <Chip
                  label={`Capacity: ${goingHeadcount}/${event.capacity}`}
                  size="small"
                  color={
                    waitlistOverflow > 0 ? 'error' : remainingCapacity === 0 ? 'warning' : 'default'
                  }
                  variant="outlined"
                  data-testid="capacity-chip"
                />
                {remainingCapacity !== null && remainingCapacity > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    · {remainingCapacity} seats left
                  </Typography>
                )}
                {event.waitlist_enabled && (
                  <Chip
                    label={waitlistOverflow > 0 ? `Waitlist: ${waitlistOverflow}` : 'Waitlist open'}
                    size="small"
                    color="warning"
                    variant={waitlistOverflow > 0 ? 'filled' : 'outlined'}
                    data-testid="waitlist-chip"
                  />
                )}
                {!event.waitlist_enabled && waitlistOverflow > 0 && (
                  <Chip
                    label={`Over by ${waitlistOverflow}`}
                    size="small"
                    color="error"
                    variant="outlined"
                  />
                )}
              </Stack>
            )}
            {event.description && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                {event.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              size="small"
              variant="text"
              startIcon={<HistoryRounded />}
              onClick={() => setVersionDrawerOpen(true)}
              aria-label="Open version history"
              data-testid="event-version-history-open"
            >
              History
            </Button>
            {event.archived_at && (
              <Chip
                label="Archived"
                color="warning"
                size="small"
                data-testid="event-archived-chip"
              />
            )}
            <Chip
              label={event.status}
              color={
                event.status === 'Active'
                  ? 'primary'
                  : event.status === 'Completed'
                    ? 'success'
                    : event.status === 'Cancelled'
                      ? 'error'
                      : event.status === 'Planning' || event.status === 'Confirmed'
                        ? 'warning'
                        : 'default'
              }
            />
            {user && (user.id === event.created_by || isAdmin(user.roleName)) && (
              <Button
                size="small"
                variant="outlined"
                color={event.archived_at ? 'primary' : 'warning'}
                data-testid="event-archive-button"
                onClick={async () => {
                  try {
                    if (event.archived_at) {
                      const updated = await unarchiveEvent(event.id);
                      setEvent({ ...event, ...(updated as Partial<PlannerEvent>) });
                    } else {
                      const reason = window.prompt('Reason for archiving (optional):') ?? undefined;
                      const updated = await archiveEvent(event.id, reason || undefined);
                      setEvent({ ...event, ...(updated as Partial<PlannerEvent>) });
                    }
                  } catch (err) {
                    setError(
                      err instanceof ApiError ? err.message : 'Failed to update archive state.',
                    );
                  }
                }}
              >
                {event.archived_at ? 'Unarchive' : 'Archive'}
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      <Box sx={{ mb: 2 }}>
        <EventLocationMap
          latitude={event.latitude ?? null}
          longitude={event.longitude ?? null}
          locationLabel={event.location}
        />
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
          Event Workspace
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Open every module for this event from one place. Seeded demo data is available in
          development so these screens are not empty.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {moduleLinks.map((moduleLink) => (
            <Button
              key={moduleLink.path}
              size="small"
              variant="outlined"
              startIcon={moduleLink.icon}
              onClick={() => navigate(moduleLink.path)}
            >
              {moduleLink.label}
            </Button>
          ))}
        </Stack>
      </Paper>

      {/* BRD v2 (#577) — Custom fields editor */}
      {event && id && (
        <EventCustomFieldsPanel
          eventId={id}
          canEdit={!!user && (user.id === event.created_by || canEditEvent(user.roleName))}
        />
      )}

      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Tasks (${tasks.length})`} />
        <Tab label={`RSVPs (${rsvps.length})`} />
        <Tab label={`Team (${members.length})`} />
        <Tab label={`Documents (${documents.length})`} />
        <Tab label="Activity" />
        <Tab
          label={
            <Badge
              color="error"
              badgeContent={chatUnread}
              max={99}
              data-testid="event-chat-tab-badge"
            >
              <span>Chat</span>
            </Badge>
          }
          data-testid="event-chat-tab"
        />
      </Tabs>
      <Divider sx={{ mb: 2 }} />

      {/* Tasks Tab */}
      {tab === 0 && (
        <EventTasksTab
          eventId={id!}
          tasks={tasks}
          availableUsers={availableUsers}
          canEdit={!!canEdit}
          onRefresh={load}
        />
      )}

      {/* RSVPs Tab */}
      {tab === 1 && (
        <EventRsvpsTab
          eventId={id!}
          rsvps={rsvps}
          canEdit={!!canEdit}
          capacity={event.capacity ?? null}
          goingHeadcount={goingHeadcount}
          remainingCapacity={remainingCapacity}
          onRefresh={load}
          onError={setError}
        />
      )}

      {/* Team Tab */}
      {tab === 2 && (
        <EventTeamTab
          eventId={id!}
          members={members}
          availableUsers={availableUsers}
          canEdit={!!canEdit}
          onRefresh={load}
          onError={setError}
        />
      )}

      {/* Documents Tab */}
      {tab === 3 && (
        <EventDocumentsTab
          eventId={id!}
          documents={documents}
          canEdit={!!canEdit}
          onRefresh={load}
          onError={setError}
        />
      )}

      {/* Activity Tab */}
      {tab === 4 && <ActivityFeedPanel eventId={id ?? ''} />}

      {/* Chat Tab — #808 */}
      {id && user && (
        <Box sx={{ display: tab === 5 ? 'block' : 'none' }} data-testid="event-chat-tab-panel">
          <EventChatPanel
            eventId={Number(id)}
            currentUserId={user.id}
            hidden={tab !== 5}
            onUnreadChange={setChatUnread}
          />
        </Box>
      )}

      {/* #807 — Version history rollback drawer (event scope). */}
      {id && event && (
        <VersionHistoryDrawer
          open={versionDrawerOpen}
          eventId={Number(id)}
          entityType="event"
          entityId={Number(id)}
          title={event.title}
          onClose={() => setVersionDrawerOpen(false)}
          onRolledBack={() => void load()}
        />
      )}
    </PageLayout>
  );
}
