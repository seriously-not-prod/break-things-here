import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  CalendarTodayRounded,
  PersonRemoveRounded,
  SearchRounded,
} from '@mui/icons-material';
import { api, ApiError } from '../../lib/api-client';

const EVENT_ROLES = ['Owner', 'Co-Organizer', 'Helper', 'Guest'] as const;
type EventRole = (typeof EVENT_ROLES)[number];

interface EventOption {
  id: number;
  title: string;
  date: string;
  location?: string | null;
  status?: string;
}

interface Member {
  user_id: number;
  display_name: string;
  email: string;
  role: EventRole;
  joined_at: string;
}

interface AvailableUser {
  user_id: number;
  display_name: string;
  email: string;
  role_name: string | null;
}

interface MembersResponse {
  members: Member[];
  availableUsers: AvailableUser[];
}

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

export function EventAccessPanel(): JSX.Element {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventOption | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const [addUserId, setAddUserId] = useState<number | ''>('');
  const [addRole, setAddRole] = useState<EventRole>('Helper');
  const [adding, setAdding] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tracks the latest loadMembers request so stale responses from a previously
  // selected event don't overwrite the current event's data when the user
  // switches events quickly.
  const latestRequestRef = useRef(0);

  useEffect(() => {
    setEventsLoading(true);
    api
      .get<EventOption[] | { events: EventOption[] }>('/api/events?limit=200')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data as { events: EventOption[] }).events ?? [];
        setEvents(list);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load events.'),
      )
      .finally(() => setEventsLoading(false));
  }, []);

  async function loadMembers(eventId: number): Promise<void> {
    const requestId = ++latestRequestRef.current;
    setMembersLoading(true);
    setError(null);
    try {
      const data = await api.get<MembersResponse>(`/api/events/${eventId}/members`);
      if (requestId !== latestRequestRef.current) return;
      setMembers(data.members ?? []);
      setAvailableUsers(data.availableUsers ?? []);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load members.');
      setMembers([]);
      setAvailableUsers([]);
    } finally {
      if (requestId === latestRequestRef.current) {
        setMembersLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!selectedEvent) {
      // Bump the request token so any in-flight loadMembers from a previously
      // selected event won't update state after it resolves.
      latestRequestRef.current++;
      setMembers([]);
      setAvailableUsers([]);
      setMembersLoading(false);
      return;
    }
    void loadMembers(selectedEvent.id);
  }, [selectedEvent]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const nonMembers = useMemo(
    () => availableUsers.filter((u) => !memberIds.has(u.user_id)),
    [availableUsers, memberIds],
  );

  async function addMember(): Promise<void> {
    if (!selectedEvent || !addUserId) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/api/events/${selectedEvent.id}/members`, {
        user_id: addUserId,
        role: addRole,
      });
      setSuccess('User granted access to the event.');
      setAddUserId('');
      setAddRole('Helper');
      await loadMembers(selectedEvent.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(member: Member, nextRole: EventRole): Promise<void> {
    if (!selectedEvent || member.role === nextRole) return;
    setError(null);
    setSuccess(null);
    try {
      await api.post(`/api/events/${selectedEvent.id}/members`, {
        user_id: member.user_id,
        role: nextRole,
      });
      setSuccess(`Role updated for ${member.display_name}.`);
      await loadMembers(selectedEvent.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update role.');
    }
  }

  async function removeMember(member: Member): Promise<void> {
    if (!selectedEvent) return;
    if (!window.confirm(`Revoke ${member.display_name}'s access to this event?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await api.delete(`/api/events/${selectedEvent.id}/members/${member.user_id}`);
      setSuccess(`${member.display_name} no longer has access to this event.`);
      await loadMembers(selectedEvent.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove member.');
    }
  }

  return (
    <Stack spacing={3}>
      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
          1. Select an event
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pick an event below to manage which users can access it. Users without an entry here cannot see
          the event's data.
        </Typography>
        <Autocomplete
          options={events}
          value={selectedEvent}
          onChange={(_, val) => setSelectedEvent(val)}
          loading={eventsLoading}
          getOptionLabel={(opt) => opt.title}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, opt) => (
            <Box component="li" {...props} key={opt.id}>
              <Avatar
                sx={{ width: 32, height: 32, mr: 1.5, bgcolor: 'primary.main', fontSize: 12, fontWeight: 700 }}
              >
                {opt.title
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={600}>
                  {opt.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(opt.date)}
                  {opt.location ? ` · ${opt.location}` : ''}
                </Typography>
              </Box>
              {opt.status && <Chip label={opt.status} size="small" sx={{ ml: 1 }} />}
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Event"
              placeholder="Search events…"
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <>
                    <SearchRounded fontSize="small" sx={{ mr: 1, color: 'text.disabled' }} />
                    {params.InputProps.startAdornment}
                  </>
                ),
                endAdornment: (
                  <>
                    {eventsLoading ? <CircularProgress color="inherit" size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        {selectedEvent && (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
            <CalendarTodayRounded fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              <strong>{selectedEvent.title}</strong> · {formatDate(selectedEvent.date)}
              {selectedEvent.location ? ` · ${selectedEvent.location}` : ''}
            </Typography>
          </Stack>
        )}
      </Paper>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {selectedEvent && (
        <>
          <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              2. Grant access
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose a user and the role they should have for this event.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
              <TextField
                select
                fullWidth
                label="User"
                value={addUserId === '' ? '' : String(addUserId)}
                onChange={(e) => setAddUserId(e.target.value ? Number(e.target.value) : '')}
                disabled={adding || nonMembers.length === 0}
                helperText={nonMembers.length === 0 ? 'All users already have access.' : undefined}
                sx={{ flex: 2 }}
              >
                {nonMembers.map((u) => (
                  <MenuItem key={u.user_id} value={u.user_id}>
                    {u.display_name} · {u.email}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Event role"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as EventRole)}
                disabled={adding}
                sx={{ flex: 1, minWidth: 160 }}
              >
                {EVENT_ROLES.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <AddRounded />}
                onClick={addMember}
                disabled={adding || !addUserId}
                sx={{ minWidth: 140, height: 56 }}
              >
                Grant access
              </Button>
            </Stack>
          </Paper>

          <Paper elevation={1} sx={{ p: 0, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ p: 2.5, pb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Users with access ({members.length})
              </Typography>
              <Typography variant="body2" color="text.secondary">
                These are the only users who can see this event's data.
              </Typography>
            </Box>
            {membersLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} />
              </Box>
            ) : members.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5, px: 3 }}>
                <Typography variant="body2" color="text.secondary">
                  No users have access yet. Use the form above to grant access.
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Event role</TableCell>
                      <TableCell>Joined</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.user_id} hover>
                        <TableCell>{m.display_name}</TableCell>
                        <TableCell>{m.email}</TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={m.role}
                            onChange={(e) => changeRole(m, e.target.value as EventRole)}
                            sx={{ minWidth: 150 }}
                          >
                            {EVENT_ROLES.map((r) => (
                              <MenuItem key={r} value={r}>
                                {r}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>{formatDate(m.joined_at)}</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Revoke access">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeMember(m)}
                              aria-label={`Remove ${m.display_name}`}
                            >
                              <PersonRemoveRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}
