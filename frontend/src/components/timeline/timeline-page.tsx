import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineItem,
  TimelineOppositeContent,
  TimelineSeparator,
} from '@mui/lab';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type CreateActivityInput,
  type TimelineActivity,
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
} from '../../services/timeline-service';
import { type Vendor, listVendors } from '../../services/vendors-service';

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

function toLocalDateTimeInput(isoString: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

function hasOverlap(a: TimelineActivity, b: TimelineActivity): boolean {
  if (!a.start_time || !a.end_time || !b.start_time || !b.end_time) return false;
  const aStart = new Date(a.start_time).getTime();
  const aEnd = new Date(a.end_time).getTime();
  const bStart = new Date(b.start_time).getTime();
  const bEnd = new Date(b.end_time).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function computeConflicts(activities: TimelineActivity[]): Set<number> {
  const conflictIds = new Set<number>();
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      if (hasOverlap(activities[i], activities[j])) {
        conflictIds.add(activities[i].id);
        conflictIds.add(activities[j].id);
      }
    }
  }
  return conflictIds;
}

interface SortableTimelineItemProps {
  activity: TimelineActivity;
  isConflict: boolean;
  vendorMap: Map<number, string>;
  onEdit: (a: TimelineActivity) => void;
  onDelete: (a: TimelineActivity) => void;
  isLast: boolean;
}

function SortableTimelineItem({
  activity,
  isConflict,
  vendorMap,
  onEdit,
  onDelete,
  isLast,
}: SortableTimelineItemProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TimelineItem ref={setNodeRef} style={style}>
      <TimelineOppositeContent sx={{ maxWidth: 100, pt: '14px' }}>
        <Typography variant="caption" color="text.secondary">
          {formatTime(activity.start_time)}
          {activity.end_time && activity.start_time !== activity.end_time && (
            <>
              <br />
              {formatTime(activity.end_time)}
            </>
          )}
        </Typography>
      </TimelineOppositeContent>

      <TimelineSeparator>
        <TimelineDot color={isConflict ? 'warning' : 'primary'} />
        {!isLast && <TimelineConnector />}
      </TimelineSeparator>

      <TimelineContent sx={{ py: '12px', px: 2 }}>
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: isConflict ? 'warning.main' : 'divider',
            bgcolor: isConflict ? 'warning.50' : 'background.paper',
          }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box
              {...listeners}
              {...attributes}
              sx={{ cursor: 'grab', color: 'text.disabled', mt: 0.25, flexShrink: 0 }}
              aria-label="Drag to reorder"
            >
              <DragIndicatorRounded fontSize="small" />
            </Box>
            <Box flex={1}>
              <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
                <Typography variant="subtitle2">{activity.title}</Typography>
                {isConflict && (
                  <Tooltip title="Time conflict with another activity">
                    <WarningAmberRounded fontSize="small" color="warning" />
                  </Tooltip>
                )}
              </Stack>
              {activity.location && (
                <Typography variant="caption" color="text.secondary" display="block">
                  📍 {activity.location}
                </Typography>
              )}
              {activity.vendor_id && vendorMap.has(activity.vendor_id) && (
                <Chip
                  label={vendorMap.get(activity.vendor_id)}
                  size="small"
                  variant="outlined"
                  sx={{ mt: 0.5 }}
                />
              )}
              {activity.description && (
                <Typography variant="body2" mt={0.5} sx={{ whiteSpace: 'pre-line' }}>
                  {activity.description}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5} flexShrink={0}>
              <IconButton size="small" aria-label={`Edit ${activity.title}`} onClick={() => onEdit(activity)}>
                <EditRounded fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label={`Delete ${activity.title}`} onClick={() => onDelete(activity)}>
                <DeleteRounded fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        </Box>
      </TimelineContent>
    </TimelineItem>
  );
}

const emptyForm: CreateActivityInput = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  location: '',
  vendor_id: undefined,
  sort_order: 0,
};

export default function TimelinePage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);
  const navigate = useNavigate();

  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<TimelineActivity | null>(null);
  const [form, setForm] = useState<CreateActivityInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TimelineActivity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void Promise.all([loadActivities(), loadVendors()]);
  }, [eventId]);

  async function loadActivities(): Promise<void> {
    setLoading(true);
    try {
      const data = await listActivities(eventId);
      setActivities(data);
    } catch {
      setError('Failed to load timeline.');
    } finally {
      setLoading(false);
    }
  }

  async function loadVendors(): Promise<void> {
    try {
      const data = await listVendors(eventId);
      setVendors(data);
    } catch {
      // Non-critical — proceed without vendor links
    }
  }

  const vendorMap = new Map(vendors.map(v => [v.id, v.name]));
  const conflictIds = computeConflicts(activities);

  function openAddDialog(): void {
    setEditingActivity(null);
    setForm({ ...emptyForm, sort_order: activities.length });
    setFormError(null);
    setDialogOpen(true);
  }

  function openEditDialog(activity: TimelineActivity): void {
    setEditingActivity(activity);
    setForm({
      title: activity.title,
      description: activity.description ?? '',
      start_time: toLocalDateTimeInput(activity.start_time),
      end_time: toLocalDateTimeInput(activity.end_time),
      location: activity.location ?? '',
      vendor_id: activity.vendor_id ?? undefined,
      sort_order: activity.sort_order,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleTextField(field: keyof CreateActivityInput) {
    return (e: ChangeEvent<HTMLInputElement>): void => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };
  }

  function handleVendorChange(e: SelectChangeEvent): void {
    const val = e.target.value;
    setForm(prev => ({ ...prev, vendor_id: val ? Number(val) : undefined }));
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateActivityInput = {
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        location: form.location?.trim() || undefined,
        vendor_id: form.vendor_id,
        sort_order: form.sort_order,
      };

      if (editingActivity) {
        const updated = await updateActivity(eventId, editingActivity.id, payload);
        setActivities(prev => prev.map(a => (a.id === updated.id ? updated : a))
          .sort((a, b) => {
            if (a.start_time && b.start_time) return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
            return a.sort_order - b.sort_order;
          }));
      } else {
        const created = await createActivity(eventId, payload);
        setActivities(prev => [...prev, created].sort((a, b) => {
          if (a.start_time && b.start_time) return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          return a.sort_order - b.sort_order;
        }));
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save activity.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteActivity(eventId, deleteTarget.id);
      setActivities(prev => prev.filter(a => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError('Failed to delete activity.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activities.findIndex(a => a.id === active.id);
    const newIndex = activities.findIndex(a => a.id === over.id);
    const reordered = arrayMove(activities, oldIndex, newIndex);

    setActivities(reordered);

    // Persist sort_order changes
    await Promise.all(
      reordered.map((activity, index) =>
        activity.sort_order !== index
          ? updateActivity(eventId, activity.id, { sort_order: index }).catch(() => undefined)
          : Promise.resolve(),
      ),
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
        <IconButton onClick={() => navigate(`/events/${eventId}`)} aria-label="Back to event">
          <ArrowBackRounded />
        </IconButton>
        <Typography variant="h5" component="h1">Event Timeline</Typography>
        <Box flex={1} />
        {conflictIds.size > 0 && (
          <Chip
            icon={<WarningAmberRounded />}
            label={`${conflictIds.size} conflict${conflictIds.size > 1 ? 's' : ''}`}
            color="warning"
            size="small"
          />
        )}
        <Button variant="contained" startIcon={<AddRounded />} onClick={openAddDialog}>
          Add Activity
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : activities.length === 0 ? (
        <Typography color="text.secondary">No activities scheduled. Add one to get started.</Typography>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activities.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <Timeline position="right" sx={{ px: 0 }}>
              {activities.map((activity, index) => (
                <SortableTimelineItem
                  key={activity.id}
                  activity={activity}
                  isConflict={conflictIds.has(activity.id)}
                  vendorMap={vendorMap}
                  onEdit={openEditDialog}
                  onDelete={a => setDeleteTarget(a)}
                  isLast={index === activities.length - 1}
                />
              ))}
            </Timeline>
          </SortableContext>
        </DndContext>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit} noValidate>
          <DialogTitle>{editingActivity ? 'Edit Activity' : 'Add Activity'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} mt={1}>
              {formError && <Alert severity="error">{formError}</Alert>}
              <TextField
                label="Title"
                value={form.title}
                onChange={handleTextField('title')}
                required
                autoFocus
                inputProps={{ 'aria-required': 'true' }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Start Time"
                  type="datetime-local"
                  value={form.start_time ?? ''}
                  onChange={handleTextField('start_time')}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="End Time"
                  type="datetime-local"
                  value={form.end_time ?? ''}
                  onChange={handleTextField('end_time')}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                label="Location"
                value={form.location ?? ''}
                onChange={handleTextField('location')}
              />
              {vendors.length > 0 && (
                <FormControl>
                  <InputLabel id="vendor-select-label">Vendor (optional)</InputLabel>
                  <Select
                    labelId="vendor-select-label"
                    label="Vendor (optional)"
                    value={form.vendor_id !== undefined ? String(form.vendor_id) : ''}
                    onChange={handleVendorChange}
                  >
                    <MenuItem value="">None</MenuItem>
                    {vendors.map(v => (
                      <MenuItem key={v.id} value={String(v.id)}>{v.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={form.description ?? ''}
                onChange={handleTextField('description')}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? <CircularProgress size={20} /> : (editingActivity ? 'Save' : 'Add')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Activity</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteTarget?.title}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
