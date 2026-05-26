import {
  Button,
  Checkbox,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ContentCopyRounded,
  DeleteRounded,
  EditRounded,
  OpenInNewRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  Draft: 'default',
  Planning: 'warning',
  Confirmed: 'warning',
  Active: 'primary',
  Completed: 'success',
  Cancelled: 'error',
  Ongoing: 'success',
};

interface PlannerEvent {
  id: number;
  title: string;
  location: string | null;
  date: string;
  capacity: number | null;
  status: string;
  creator_name: string | null;
  event_type: string | null;
  tags: string | null;
  latitude: number | null;
  longitude: number | null;
  waitlist_enabled: boolean | null;
  event_time: string | null;
  going_count: number | null;
  pending_count: number | null;
  created_by: number | null;
}

function capacityLabel(event: PlannerEvent): string {
  if (event.capacity == null) return '—';
  const going = Number(event.going_count ?? 0);
  const remaining = Math.max(event.capacity - going, 0);
  const overflow = Math.max(going - event.capacity, 0);
  if (overflow > 0) {
    return event.waitlist_enabled
      ? `${going}/${event.capacity} · waitlist ${overflow}`
      : `${going}/${event.capacity} · over by ${overflow}`;
  }
  return `${going}/${event.capacity} · ${remaining} left`;
}

interface EventListTableProps {
  events: PlannerEvent[];
  canCreate: boolean;
  selectedIds: Set<number>;
  allSelected: boolean;
  someSelected: boolean;
  selectedTags: string[];
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  onToggleTag: (tag: string) => void;
  onEdit: (event: PlannerEvent) => void;
  onClone: (id: number) => void;
  onDelete: (id: number) => void;
}

export function EventListTable({
  events,
  canCreate,
  selectedIds,
  allSelected,
  someSelected,
  selectedTags,
  onToggleSelect,
  onToggleSelectAll,
  onToggleTag,
  onEdit,
  onClone,
  onDelete,
}: EventListTableProps): JSX.Element {
  const navigate = useNavigate();

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {canCreate && (
              <TableCell padding="checkbox">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={onToggleSelectAll}
                  inputProps={{ 'aria-label': 'select-all-events-table' }}
                />
              </TableCell>
            )}
            <TableCell>
              <strong>Title</strong>
            </TableCell>
            <TableCell>
              <strong>Date</strong>
            </TableCell>
            <TableCell>
              <strong>Location</strong>
            </TableCell>
            <TableCell>
              <strong>Capacity</strong>
            </TableCell>
            <TableCell>
              <strong>Status</strong>
            </TableCell>
            <TableCell>
              <strong>Tags</strong>
            </TableCell>
            <TableCell>
              <strong>Created by</strong>
            </TableCell>
            <TableCell align="right">
              <strong>Actions</strong>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {events.map((event) => {
            const selected = selectedIds.has(event.id);
            const overflow =
              event.capacity != null && Number(event.going_count ?? 0) > event.capacity;
            return (
              <TableRow
                key={event.id}
                hover
                selected={selected}
                data-testid={`event-row-${event.id}`}
              >
                {canCreate && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected}
                      onChange={() => onToggleSelect(event.id)}
                      inputProps={{ 'aria-label': `select-event-${event.id}` }}
                    />
                  </TableCell>
                )}
                <TableCell>
                  {event.title}
                  {event.event_type && (
                    <Chip
                      label={event.event_type}
                      size="small"
                      variant="outlined"
                      sx={{ ml: 1 }}
                    />
                  )}
                  {event.waitlist_enabled && (
                    <Tooltip title="Waitlist enabled for this event">
                      <Chip
                        label="Waitlist"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ ml: 0.5 }}
                      />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>{new Date(event.date).toLocaleDateString()}</TableCell>
                <TableCell>
                  {event.location ?? '—'}
                  {event.latitude != null && event.longitude != null && (
                    <Tooltip
                      title={`Coordinates: ${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}`}
                    >
                      <Chip label="Map" size="small" variant="outlined" sx={{ ml: 0.5 }} />
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2">{capacityLabel(event)}</Typography>
                    {overflow && (
                      <Chip
                        label="Over capacity"
                        size="small"
                        color="error"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Chip
                    label={event.status}
                    color={STATUS_COLORS[event.status] ?? 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {event.tags
                    ? event.tags
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .map((tag) => (
                          <Chip
                            key={tag}
                            label={tag}
                            size="small"
                            variant="outlined"
                            color={selectedTags.includes(tag) ? 'primary' : 'default'}
                            onClick={() => onToggleTag(tag)}
                            clickable
                            sx={{ mr: 0.25, mb: 0.25 }}
                          />
                        ))
                    : '—'}
                </TableCell>
                <TableCell>{event.creator_name ?? '—'}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Button
                      size="small"
                      startIcon={<OpenInNewRounded />}
                      onClick={() => navigate(`/events/${event.id}`)}
                    >
                      Open
                    </Button>
                    {canCreate && (
                      <>
                        <Button
                          size="small"
                          startIcon={<EditRounded />}
                          onClick={() => onEdit(event)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          startIcon={<ContentCopyRounded />}
                          onClick={() => onClone(event.id)}
                        >
                          Clone
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<DeleteRounded />}
                          onClick={() => onDelete(event.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
