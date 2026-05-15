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
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
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
import AssessmentRounded from '@mui/icons-material/AssessmentRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ListAltRounded from '@mui/icons-material/ListAltRounded';
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
import { PageLayout } from '../layout/page-layout';
import {
  type ActivityStatus,
  type CreateActivityInput,
  type TimelineActivity,
  type TimelineComparisonItem,
  type TimelineComparisonSummary,
  createActivity,
  deleteActivity,
  getTimelineComparison,
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

function formatVariance(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return 'On time';
  const abs = Math.abs(minutes);
  const sign = minutes > 0 ? '+' : '-';
  if (abs < 60) return `${sign}${abs}m`;
  return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`;
}

function statusColor(status: ActivityStatus): 'default' | 'primary' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'completed': return 'success';
    case 'in-progress': return 'primary';
    case 'skipped': return 'error';
    default: return 'default';
  }
}

function varianceColor(minutes: number | null): string {
  if (minutes === null) return 'text.secondary';
  if (minutes === 0) return 'success.main';
  return Math.abs(minutes) <= 15 ? 'warning.main' : 'error.main';
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
                <Chip
                  label={activity.status ?? 'planned'}
                  size="small"
                  color={statusColor(activity.status ?? 'planned')}
                  variant="outlined"
                  sx={{ fontSize: '0.65rem', height: 18 }}
                />
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
  planned_start_time: '',
  planned_end_time: '',
  actual_start_time: '',
  actual_end_time: '',
  status: 'planned',
  location: '',
  vendor_id: undefined,
  sort_order: 0,
};

export default function TimelinePage(): JSX.Element {
  const { id: eventIdStr } = useParams<{ id: string }>();
  const eventId = Number(eventIdStr);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState(0);
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comparisonItems, setComparisonItems] = useState<TimelineComparisonItem[]>([]);
  const [comparisonSummary, setComparisonSummary] = useState<TimelineComparisonSummary | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

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

  useEffect(() => {
    if (activeTab === 1) void loadComparison();
  }, [activeTab, eventId]);

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

  async function loadComparison(): Promise<void> {
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const data = await getTimelineComparison(eventId);
      setComparisonItems(data.comparison);
      setComparisonSummary(data.summary);
    } catch {
      setComparisonError('Failed to load timeline comparison.');
    } finally {
      setComparisonLoading(false);
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
      planned_start_time: toLocalDateTimeInput(activity.planned_start_time),
      planned_end_time: toLocalDateTimeInput(activity.planned_end_time),
      actual_start_time: toLocalDateTimeInput(activity.actual_start_time),
      actual_end_time: toLocalDateTimeInput(activity.actual_end_time),
      status: activity.status ?? 'planned',
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

  function handleStatusChange(e: SelectChangeEvent): void {
    setForm(prev => ({ ...prev, status: e.target.value as ActivityStatus }));
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
        planned_start_time: form.planned_start_time || undefined,
        planned_end_time: form.planned_end_time || undefined,
        actual_start_time: form.actual_start_time || undefined,
        actual_end_time: form.actual_end_time || undefined,
        status: form.status ?? 'planned',
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
    <PageLayout
      title="Event Timeline"
      breadcrumbs={[{ label: 'Events', to: '/events' }, { label: 'Timeline' }]}
      actions={
        <Stack direction="row" spacing={1} alignItems="center">
          {conflictIds.size > 0 && (
            <Chip
              icon={<WarningAmberRounded />}
              label={`${conflictIds.size} conflict${conflictIds.size > 1 ? 's' : ''}`}
              color="warning"
              size="small"
            />
          )}
          {activeTab === 0 && (
            <Button variant="contained" startIcon={<AddRounded />} onClick={openAddDialog}>
              Add Activity
            </Button>
          )}
        </Stack>
      }
    >

      <Tabs
        value={activeTab}
        onChange={(_e, v: number) => setActiveTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        aria-label="Timeline view tabs"
      >
        <Tab icon={<ListAltRounded />} iconPosition="start" label="Timeline" id="tab-timeline" aria-controls="tabpanel-timeline" />
        <Tab icon={<AssessmentRounded />} iconPosition="start" label="Planned vs Actual" id="tab-comparison" aria-controls="tabpanel-comparison" />
      </Tabs>

      {/* ── Timeline Tab ─────────────────────────────────────────────────── */}
      <Box role="tabpanel" id="tabpanel-timeline" aria-labelledby="tab-timeline" hidden={activeTab !== 0}>
        {activeTab === 0 && (
          <>
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
          </>
        )}
      </Box>

      {/* ── Comparison Tab ───────────────────────────────────────────────── */}
      <Box role="tabpanel" id="tabpanel-comparison" aria-labelledby="tab-comparison" hidden={activeTab !== 1}>
        {activeTab === 1 && (
          <>
            {comparisonError && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setComparisonError(null)}>{comparisonError}</Alert>
            )}

            {comparisonLoading ? (
              <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
            ) : (
              <>
                {/* Summary chips */}
                {comparisonSummary && (
                  <Stack direction="row" spacing={1} flexWrap="wrap" mb={2}>
                    <Chip label={`Total: ${comparisonSummary.total}`} size="small" />
                    <Chip label={`Planned: ${comparisonSummary.planned}`} size="small" color="default" />
                    <Chip label={`In Progress: ${comparisonSummary.in_progress}`} size="small" color="primary" />
                    <Chip label={`Completed: ${comparisonSummary.completed}`} size="small" color="success" />
                    <Chip label={`Skipped: ${comparisonSummary.skipped}`} size="small" color="error" />
                  </Stack>
                )}

                {comparisonItems.length === 0 ? (
                  <Typography color="text.secondary">No activities to compare. Add activities on the Timeline tab.</Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" aria-label="Planned vs actual timeline comparison">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Activity</strong></TableCell>
                          <TableCell><strong>Status</strong></TableCell>
                          <TableCell><strong>Planned Start</strong></TableCell>
                          <TableCell><strong>Actual Start</strong></TableCell>
                          <TableCell><strong>Start Variance</strong></TableCell>
                          <TableCell><strong>End Variance</strong></TableCell>
                          <TableCell><strong>Planned Duration</strong></TableCell>
                          <TableCell><strong>Actual Duration</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparisonItems.map(item => (
                          <TableRow key={item.id} hover>
                            <TableCell>{item.title}</TableCell>
                            <TableCell>
                              <Chip
                                label={item.status}
                                size="small"
                                color={statusColor(item.status)}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {item.planned_start_time ? formatTime(item.planned_start_time) : '—'}
                            </TableCell>
                            <TableCell>
                              {item.actual_start_time ? formatTime(item.actual_start_time) : '—'}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ color: varianceColor(item.start_variance_minutes), fontWeight: item.start_variance_minutes !== null ? 600 : 400 }}
                              >
                                {formatVariance(item.start_variance_minutes)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{ color: varianceColor(item.end_variance_minutes), fontWeight: item.end_variance_minutes !== null ? 600 : 400 }}
                              >
                                {formatVariance(item.end_variance_minutes)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {item.planned_duration_minutes !== null ? `${item.planned_duration_minutes}m` : '—'}
                            </TableCell>
                            <TableCell>
                              {item.actual_duration_minutes !== null ? `${item.actual_duration_minutes}m` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}
          </>
        )}
      </Box>

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

              <FormControl>
                <InputLabel id="status-select-label">Status</InputLabel>
                <Select
                  labelId="status-select-label"
                  label="Status"
                  value={form.status ?? 'planned'}
                  onChange={handleStatusChange}
                >
                  <MenuItem value="planned">Planned</MenuItem>
                  <MenuItem value="in-progress">In Progress</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="skipped">Skipped</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Display times (used in the timeline view)
              </Typography>
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

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Planned times (pre-event schedule)
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Planned Start"
                  type="datetime-local"
                  value={form.planned_start_time ?? ''}
                  onChange={handleTextField('planned_start_time')}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Planned End"
                  type="datetime-local"
                  value={form.planned_end_time ?? ''}
                  onChange={handleTextField('planned_end_time')}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Actual times (post-event recording)
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Actual Start"
                  type="datetime-local"
                  value={form.actual_start_time ?? ''}
                  onChange={handleTextField('actual_start_time')}
                  InputLabelProps={{ shrink: true }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Actual End"
                  type="datetime-local"
                  value={form.actual_end_time ?? ''}
                  onChange={handleTextField('actual_end_time')}
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
    </PageLayout>
  );
}
