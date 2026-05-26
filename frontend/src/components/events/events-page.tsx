import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  ArchiveRounded,
  BookmarkAddRounded,
  BookmarkBorderRounded,
  BookmarkRounded,
  CalendarMonthRounded,
  ClearRounded,
  DeleteRounded,
  DescriptionRounded,
  DownloadRounded,
  ListRounded,
  SearchRounded,
  TuneRounded,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api-client';
import { useAuth } from '../../contexts/auth-context';
import { canEditEvent } from '../../utils/roles';
import { EventCalendarView } from './event-calendar-view';
import {
  buildEventQuery,
  type Event as PlannerEventFull,
  type EventListFilters,
} from '../../services/events-service';
import {
  bulkArchiveOrDelete,
  bulkExportCsv,
  type BulkResultSummary,
} from '../../services/event-bulk-service';
import {
  createPreset,
  deletePreset,
  listPresets,
  type FilterPreset,
} from '../../services/event-filter-presets-service';
import EventTemplatesDialog from './event-templates-dialog';
import { PageLayout } from '../layout/page-layout';
import PowerUserSearch from './power-user-search';
import { EventCreateEditDialog } from './EventCreateEditDialog';
import { EventListTable } from './EventListTable';

interface PlannerEvent extends Omit<
  Pick<
    PlannerEventFull,
    | 'id'
    | 'title'
    | 'location'
    | 'date'
    | 'capacity'
    | 'status'
    | 'creator_name'
    | 'created_by'
    | 'event_type'
    | 'tags'
    | 'latitude'
    | 'longitude'
    | 'waitlist_enabled'
    | 'event_time'
    | 'going_count'
    | 'pending_count'
  >,
  'status'
> {
  // Loosen status to string here so the legacy table cells keep working with
  // values outside the strict EventStatus union (e.g. 'Cancelled', 'Ongoing').
  status: string;
}

// BRD v2 (#575) — full event lifecycle status set.
const STATUS_OPTIONS = ['Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled'];
const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  Draft: 'default',
  Planning: 'warning',
  Confirmed: 'warning',
  Active: 'primary',
  Completed: 'success',
  Cancelled: 'error',
  Ongoing: 'success',
};
// BRD v2 (#580) — supported view modes.
const EVENT_VIEWS = ['list', 'grid', 'calendar', 'timeline'] as const;
type EventViewMode = (typeof EVENT_VIEWS)[number];
// BRD v2 (#578) — archive filter mode.
type ArchiveFilter = 'active' | 'all' | 'only';

interface AdvancedFilters {
  title_q: string;
  location_q: string;
  date_from: string;
  date_to: string;
  capacity_min: string;
  capacity_max: string;
  event_type: string;
  has_waitlist: '' | 'true' | 'false';
}

const EMPTY_ADVANCED: AdvancedFilters = {
  title_q: '',
  location_q: '',
  date_from: '',
  date_to: '',
  capacity_min: '',
  capacity_max: '',
  event_type: '',
  has_waitlist: '',
};

interface EventsPageProps {
  initialView?: EventViewMode;
  ownerOnly?: boolean;
}

function buildFilters(opts: {
  ownerOnly: boolean;
  selectedTags: string[];
  searchQuery: string;
  status: string;
  advanced: AdvancedFilters;
  archive?: ArchiveFilter;
}): EventListFilters {
  const { ownerOnly, selectedTags, searchQuery, status, advanced, archive } = opts;
  const filters: EventListFilters = {};
  if (ownerOnly) filters.owner = 'me';
  if (selectedTags.length > 0) filters.tags = [...selectedTags];
  if (searchQuery.trim()) filters.q = searchQuery.trim();
  if (status) filters.status = status;
  if (advanced.title_q.trim()) filters.title_q = advanced.title_q.trim();
  if (advanced.location_q.trim()) filters.location_q = advanced.location_q.trim();
  if (advanced.date_from) filters.date_from = advanced.date_from;
  if (advanced.date_to) filters.date_to = advanced.date_to;
  if (advanced.capacity_min) filters.capacity_min = advanced.capacity_min;
  if (advanced.capacity_max) filters.capacity_max = advanced.capacity_max;
  if (advanced.event_type.trim()) filters.event_type = advanced.event_type.trim();
  if (advanced.has_waitlist === 'true') filters.has_waitlist = true;
  if (advanced.has_waitlist === 'false') filters.has_waitlist = false;
  // Archive filter (#578).
  if (archive === 'all') filters.archived = 'true';
  else if (archive === 'only') filters.archived = 'only';
  return filters;
}

function capacityLabel(event: PlannerEvent): string {
  if (event.capacity == null) return '—';
  const going = Number(event.going_count ?? 0);
  const remaining = Math.max(event.capacity - going, 0);
  const overflow = Math.max(going - event.capacity, 0);
  if (overflow > 0) {
    // Only call the overflow a "waitlist" when waitlist is actually enabled —
    // otherwise it's just over capacity, not a managed waitlist.
    return event.waitlist_enabled
      ? `${going}/${event.capacity} · waitlist ${overflow}`
      : `${going}/${event.capacity} · over by ${overflow}`;
  }
  return `${going}/${event.capacity} · ${remaining} left`;
}

export default function EventsPage({
  initialView = 'list',
  ownerOnly = false,
}: EventsPageProps): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [view, setView] = useState<EventViewMode>(initialView);
  // BRD v2 (#578) — archive filter mode.
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('active');

  // Filters
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Saved filter presets
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<number | null>(null);
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<HTMLElement | null>(null);
  const [presetSaveOpen, setPresetSaveOpen] = useState(false);
  const [presetSaveName, setPresetSaveName] = useState('');
  const [presetSaveError, setPresetSaveError] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<BulkResultSummary | null>(null);

  // Templates dialog
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // BRD v2 (#581) — power-user search dialog
  const [searchOpen, setSearchOpen] = useState(false);

  // Bind Ctrl/Cmd+K to open the power-user search.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogInitialForm, setDialogInitialForm] = useState<Record<string, unknown>>({});

  const isMyEvents = location.pathname === '/events/my';
  const canCreate = !!user && canEditEvent(user.roleName);

  const filters = useMemo(
    () =>
      buildFilters({
        ownerOnly,
        selectedTags,
        searchQuery,
        status: statusFilter,
        advanced,
        archive: archiveFilter,
      }),
    [ownerOnly, selectedTags, searchQuery, statusFilter, advanced, archiveFilter],
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    events.forEach((event) => {
      event.tags?.split(',').forEach((tag) => {
        const trimmed = tag.trim();
        if (trimmed) tagSet.add(trimmed);
      });
    });
    return Array.from(tagSet).sort();
  }, [events]);

  const loadEvents = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildEventQuery(filters);
      const data = await api.get<PlannerEvent[] | { events: PlannerEvent[] }>(`/api/events${qs}`);
      const list: PlannerEvent[] = Array.isArray(data)
        ? data
        : ((data as { events: PlannerEvent[] }).events ?? []);
      setEvents(list);
      // Drop selections that no longer match the current filter
      setSelectedIds((prev) => {
        const visible = new Set(list.map((e) => e.id));
        const next = new Set<number>();
        prev.forEach((id) => {
          if (visible.has(id)) next.add(id);
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load presets once
  useEffect(() => {
    void (async () => {
      try {
        setPresets(await listPresets());
      } catch (err) {
        // Presets are non-critical; silently degrade.
        console.error('Failed to load filter presets', err);
      }
    })();
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (location.pathname === '/events/calendar') {
      setView('calendar');
      return;
    }
    if (location.pathname === '/events' || location.pathname === '/events/my') {
      setView('list');
    }
  }, [location.pathname]);

  // Reset filters when switching between All Events and My Events
  useEffect(() => {
    setSelectedTags([]);
    setSearchQuery('');
    setStatusFilter('');
    setAdvanced(EMPTY_ADVANCED);
    setActivePresetId(null);
    setSelectedIds(new Set());
  }, [ownerOnly]);

  function handleViewToggle(newView: EventViewMode): void {
    if (isMyEvents) {
      setView(newView);
      return;
    }
    if (newView === 'calendar') {
      navigate('/events/calendar');
    } else if (newView === 'list') {
      navigate('/events');
    } else {
      // Grid/timeline views are local state — they don't have their own routes.
      setView(newView);
    }
  }

  function toggleTag(tag: string): void {
    setActivePresetId(null);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  function clearAllFilters(): void {
    setSelectedTags([]);
    setSearchQuery('');
    setStatusFilter('');
    setAdvanced(EMPTY_ADVANCED);
    setActivePresetId(null);
  }

  function applyPreset(p: FilterPreset): void {
    const f = p.filters ?? {};
    setSelectedTags(f.tags ?? []);
    setSearchQuery(f.q ?? '');
    setStatusFilter(Array.isArray(f.status) ? f.status.join(',') : (f.status ?? ''));
    setAdvanced({
      title_q: f.title_q ?? '',
      location_q: f.location_q ?? '',
      date_from: f.date_from ?? '',
      date_to: f.date_to ?? '',
      capacity_min: f.capacity_min !== undefined ? String(f.capacity_min) : '',
      capacity_max: f.capacity_max !== undefined ? String(f.capacity_max) : '',
      event_type: f.event_type ?? '',
      has_waitlist: f.has_waitlist === true ? 'true' : f.has_waitlist === false ? 'false' : '',
    });
    setActivePresetId(p.id);
    setPresetMenuAnchor(null);
  }

  async function savePresetSubmit(): Promise<void> {
    setPresetSaveError(null);
    if (!presetSaveName.trim()) {
      setPresetSaveError('Name is required.');
      return;
    }
    try {
      const created = await createPreset(presetSaveName.trim(), filters);
      setPresets((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setActivePresetId(created.id);
      setPresetSaveOpen(false);
      setPresetSaveName('');
      setFeedback(`Preset "${created.name}" saved.`);
    } catch (err) {
      setPresetSaveError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  async function handleDeletePreset(p: FilterPreset): Promise<void> {
    if (!window.confirm(`Delete preset "${p.name}"?`)) return;
    try {
      await deletePreset(p.id);
      setPresets((prev) => prev.filter((x) => x.id !== p.id));
      if (activePresetId === p.id) setActivePresetId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  // ---- Bulk selection ----

  const allVisibleIds = useMemo(() => events.map((e) => e.id), [events]);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSelect(id: number): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  async function runBulkArchiveOrDelete(action: 'archive' | 'delete'): Promise<void> {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    if (
      action === 'delete' &&
      !window.confirm(`Delete ${ids.length} events? This cannot be undone.`)
    ) {
      return;
    }
    setBulkRunning(true);
    setBulkSummary(null);
    try {
      const summary = await bulkArchiveOrDelete(action, ids);
      setBulkSummary(summary);
      const labelMap: Record<typeof action, string> = {
        archive: 'archived',
        delete: 'deleted',
      };
      setFeedback(`${labelMap[action]} ${summary.success}/${summary.total} events.`);
      setSelectedIds(new Set());
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed.');
    } finally {
      setBulkRunning(false);
    }
  }

  async function runBulkExport(): Promise<void> {
    if (selectedIds.size === 0) return;
    setBulkRunning(true);
    try {
      await bulkExportCsv(Array.from(selectedIds));
      setFeedback(`Exported ${selectedIds.size} events.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBulkRunning(false);
    }
  }

  // ---- Single event create / edit ----

  function openCreate(): void {
    setEditingId(null);
    setDialogInitialForm({});
    setDialogOpen(true);
  }

  function openEdit(event: PlannerEvent): void {
    setEditingId(event.id);
    setDialogInitialForm({
      title: event.title,
      description: '',
      location: event.location ?? '',
      date: event.date,
      event_time: event.event_time ?? '',
      capacity: event.capacity == null ? '' : String(event.capacity),
      status: event.status,
      latitude: event.latitude == null ? '' : String(event.latitude),
      longitude: event.longitude == null ? '' : String(event.longitude),
      waitlist_enabled: !!event.waitlist_enabled,
      tags: event.tags ?? '',
      event_type: event.event_type ?? '',
    });
    setDialogOpen(true);
  }

  async function handleClone(id: number): Promise<void> {
    try {
      await api.post(`/api/events/${id}/clone`);
      await loadEvents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Clone failed.');
    }
  }

  async function handleDelete(id: number): Promise<void> {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    try {
      await api.delete(`/api/events/${id}`);
      await loadEvents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  const pageTitle = isMyEvents ? 'My Events' : 'Events';
  const filterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '',
  ).length;

  return (
    <PageLayout
      title={pageTitle}
      subtitle={isMyEvents ? 'Showing only events you created' : undefined}
      breadcrumbs={
        isMyEvents
          ? [{ label: 'Events', to: '/events' }, { label: 'My Events' }]
          : [{ label: 'Events' }]
      }
      actions={
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <ButtonGroup size="small" variant="outlined" aria-label="View toggle">
            <Button
              startIcon={<ListRounded />}
              onClick={() => handleViewToggle('list')}
              variant={view === 'list' ? 'contained' : 'outlined'}
              aria-pressed={view === 'list'}
            >
              List
            </Button>
            <Button
              onClick={() => setView('grid')}
              variant={view === 'grid' ? 'contained' : 'outlined'}
              aria-pressed={view === 'grid'}
            >
              Grid
            </Button>
            <Button
              startIcon={<CalendarMonthRounded />}
              onClick={() => handleViewToggle('calendar')}
              variant={view === 'calendar' ? 'contained' : 'outlined'}
              aria-pressed={view === 'calendar'}
            >
              Calendar
            </Button>
            <Button
              onClick={() => setView('timeline')}
              variant={view === 'timeline' ? 'contained' : 'outlined'}
              aria-pressed={view === 'timeline'}
            >
              Timeline
            </Button>
          </ButtonGroup>
          <Button
            size="small"
            variant={archiveFilter === 'only' ? 'contained' : 'outlined'}
            onClick={() =>
              setArchiveFilter(
                archiveFilter === 'active' ? 'all' : archiveFilter === 'all' ? 'only' : 'active',
              )
            }
            aria-label="Toggle archived events"
            data-testid="archive-filter-toggle"
          >
            {archiveFilter === 'active'
              ? 'Active only'
              : archiveFilter === 'all'
                ? 'Including archived'
                : 'Archived only'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setSearchOpen(true)}
            aria-label="Open power-user search"
            data-testid="power-search-button"
          >
            Search (⌘K)
          </Button>
          {canCreate && (
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={<DescriptionRounded />}
                onClick={() => setTemplatesOpen(true)}
              >
                Templates
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddRounded />}
                onClick={openCreate}
              >
                New Event
              </Button>
            </>
          )}
        </Stack>
      }
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {feedback && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setFeedback(null)}>
          {feedback}
        </Alert>
      )}
      {bulkSummary && bulkSummary.results.some((r) => r.status !== 'ok') && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setBulkSummary(null)}>
          {bulkSummary.results.filter((r) => r.status !== 'ok').length} events skipped:{' '}
          {bulkSummary.results
            .filter((r) => r.status !== 'ok')
            .map((r) => `#${r.event_id} (${r.status})`)
            .join(', ')}
        </Alert>
      )}

      {/* Search / advanced / preset toolbar */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        alignItems={{ md: 'center' }}
        sx={{ mb: 2 }}
      >
        <TextField
          size="small"
          placeholder="Search by title, location, status, tags…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setActivePresetId(null);
          }}
          sx={{ flex: 1, maxWidth: 480 }}
          inputProps={{ 'aria-label': 'event-search' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: searchQuery ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearRounded fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
        <Button
          size="small"
          variant={advancedOpen ? 'contained' : 'outlined'}
          startIcon={<TuneRounded />}
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          aria-controls="event-advanced-search"
        >
          Advanced
        </Button>
        <Stack direction="row" spacing={0.5}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<BookmarkBorderRounded />}
            onClick={(e) => setPresetMenuAnchor(e.currentTarget)}
            aria-haspopup="menu"
          >
            Saved filters{presets.length ? ` (${presets.length})` : ''}
          </Button>
          {filterCount > 0 && (
            <Button
              size="small"
              startIcon={<BookmarkAddRounded />}
              onClick={() => {
                setPresetSaveOpen(true);
                setPresetSaveName('');
                setPresetSaveError(null);
              }}
            >
              Save as preset
            </Button>
          )}
          {filterCount > 0 && (
            <Button size="small" onClick={clearAllFilters}>
              Clear all
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Saved filters menu */}
      {presetMenuAnchor && (
        <Paper
          elevation={4}
          sx={{ position: 'absolute', zIndex: 10, p: 1, minWidth: 240 }}
          onMouseLeave={() => setPresetMenuAnchor(null)}
        >
          {presets.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
              No saved filters yet.
            </Typography>
          ) : (
            presets.map((p) => (
              <Stack
                key={p.id}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                  p: 0.75,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                  cursor: 'pointer',
                }}
                onClick={() => applyPreset(p)}
              >
                <Box>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <BookmarkRounded
                      fontSize="small"
                      color={activePresetId === p.id ? 'primary' : 'action'}
                    />
                    <Typography variant="body2">{p.name}</Typography>
                  </Stack>
                </Box>
                <IconButton
                  size="small"
                  edge="end"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeletePreset(p);
                  }}
                  aria-label={`Delete preset ${p.name}`}
                >
                  <DeleteRounded fontSize="small" />
                </IconButton>
              </Stack>
            ))
          )}
        </Paper>
      )}

      {/* Advanced search panel */}
      <Collapse in={advancedOpen} unmountOnExit>
        <Paper id="event-advanced-search" variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Title contains"
              value={advanced.title_q}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, title_q: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ 'aria-label': 'advanced-title' }}
            />
            <TextField
              size="small"
              label="Location contains"
              value={advanced.location_q}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, location_q: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ 'aria-label': 'advanced-location' }}
            />
            <TextField
              size="small"
              label="Date from"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={advanced.date_from}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, date_from: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ 'aria-label': 'advanced-date-from' }}
            />
            <TextField
              size="small"
              label="Date to"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={advanced.date_to}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, date_to: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ 'aria-label': 'advanced-date-to' }}
            />
            <TextField
              size="small"
              label="Capacity min"
              type="number"
              value={advanced.capacity_min}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, capacity_min: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ min: 0, 'aria-label': 'advanced-capacity-min' }}
            />
            <TextField
              size="small"
              label="Capacity max"
              type="number"
              value={advanced.capacity_max}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, capacity_max: e.target.value }));
                setActivePresetId(null);
              }}
              inputProps={{ min: 0, 'aria-label': 'advanced-capacity-max' }}
            />
            <TextField
              size="small"
              label="Event type"
              value={advanced.event_type}
              onChange={(e) => {
                setAdvanced((p) => ({ ...p, event_type: e.target.value }));
                setActivePresetId(null);
              }}
            />
            <TextField
              size="small"
              label="Status"
              select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setActivePresetId(null);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">Any</MenuItem>
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Waitlist"
              select
              value={advanced.has_waitlist}
              onChange={(e) => {
                setAdvanced((p) => ({
                  ...p,
                  has_waitlist: e.target.value as AdvancedFilters['has_waitlist'],
                }));
                setActivePresetId(null);
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="true">Enabled</MenuItem>
              <MenuItem value="false">Disabled</MenuItem>
            </TextField>
          </Stack>
        </Paper>
      </Collapse>

      {/* Tag chips */}
      {!loading && availableTags.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
            Filter by tag:
          </Typography>
          {availableTags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              onClick={() => toggleTag(tag)}
              color={selectedTags.includes(tag) ? 'primary' : 'default'}
              variant={selectedTags.includes(tag) ? 'filled' : 'outlined'}
              clickable
            />
          ))}
          {selectedTags.length > 0 && (
            <Button size="small" onClick={() => setSelectedTags([])} sx={{ ml: 0.5 }}>
              Clear
            </Button>
          )}
        </Box>
      )}

      {/* Bulk toolbar */}
      {canCreate && view === 'list' && events.length > 0 && (
        <Paper
          variant="outlined"
          sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleSelectAll}
            inputProps={{ 'aria-label': 'select-all-events' }}
          />
          <Typography variant="body2" color="text.secondary">
            {selectedIds.size === 0
              ? `${events.length} events`
              : `${selectedIds.size} of ${events.length} selected`}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <ButtonGroup
            size="small"
            variant="outlined"
            disabled={selectedIds.size === 0 || bulkRunning}
          >
            <Button
              startIcon={<ArchiveRounded />}
              onClick={() => void runBulkArchiveOrDelete('archive')}
              data-testid="bulk-archive-button"
            >
              Archive
            </Button>
            <Button
              startIcon={<DownloadRounded />}
              onClick={() => void runBulkExport()}
              data-testid="bulk-export-button"
            >
              Export CSV
            </Button>
            <Button
              color="error"
              startIcon={<DeleteRounded />}
              onClick={() => void runBulkArchiveOrDelete('delete')}
              data-testid="bulk-delete-button"
            >
              Delete
            </Button>
          </ButtonGroup>
        </Paper>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : view === 'calendar' ? (
        <EventCalendarView events={events as unknown as PlannerEventFull[]} />
      ) : events.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {filterCount > 0
              ? 'No events match the current filters.'
              : isMyEvents
                ? 'You have not created any events yet.'
                : 'No events yet. Create your first event!'}
          </Typography>
        </Paper>
      ) : view === 'grid' ? (
        // BRD v2 (#580) — grid view renders cards for each event.
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
          }}
          data-testid="events-grid-view"
        >
          {events.map((event) => (
            <Paper
              key={event.id}
              variant="outlined"
              sx={{ p: 2, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 1 }}
              onClick={() => navigate(`/events/${event.id}`)}
            >
              <Typography variant="subtitle1" fontWeight={600}>
                {event.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {new Date(event.date).toLocaleDateString()} · {event.location}
              </Typography>
              <Box>
                <Chip
                  label={event.status}
                  color={STATUS_COLORS[event.status] ?? 'default'}
                  size="small"
                />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {capacityLabel(event)}
              </Typography>
            </Paper>
          ))}
        </Box>
      ) : view === 'timeline' ? (
        // BRD v2 (#580) — timeline view groups events chronologically.
        <Paper variant="outlined" sx={{ p: 2 }} data-testid="events-timeline-view">
          <Stack divider={<Box sx={{ borderBottom: 1, borderColor: 'divider' }} />} spacing={1}>
            {[...events]
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((event) => (
                <Box
                  key={event.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', py: 1 }}
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <Box sx={{ minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(event.date).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {event.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {event.location}
                    </Typography>
                  </Box>
                  <Chip
                    label={event.status}
                    color={STATUS_COLORS[event.status] ?? 'default'}
                    size="small"
                  />
                </Box>
              ))}
          </Stack>
        </Paper>
      ) : (
        <EventListTable
          events={events}
          canCreate={canCreate}
          selectedIds={selectedIds}
          allSelected={allSelected}
          someSelected={someSelected}
          selectedTags={selectedTags}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onToggleTag={toggleTag}
          onEdit={openEdit}
          onClone={handleClone}
          onDelete={handleDelete}
        />
      )}

      {/* Templates dialog */}
      <EventTemplatesDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onTemplateApplied={(eventId) => {
          setFeedback(`Created event #${eventId} from template.`);
          void loadEvents();
        }}
      />

      {/* Save preset dialog */}
      <Dialog
        open={presetSaveOpen}
        onClose={() => setPresetSaveOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Save filter preset</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {presetSaveError && <Alert severity="error">{presetSaveError}</Alert>}
            <TextField
              label="Preset name"
              value={presetSaveName}
              onChange={(e) => setPresetSaveName(e.target.value)}
              fullWidth
              autoFocus
              required
              inputProps={{ maxLength: 120, 'aria-label': 'preset-name' }}
            />
            <Typography variant="caption" color="text.secondary">
              {filterCount === 0
                ? 'No filters set; preset will load the default view.'
                : `${filterCount} active filter${filterCount === 1 ? '' : 's'} will be saved.`}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetSaveOpen(false)}>Cancel</Button>
          <Button onClick={() => void savePresetSubmit()} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create / edit event dialog */}
      <EventCreateEditDialog
        open={dialogOpen}
        editingId={editingId}
        initialForm={dialogInitialForm}
        onClose={() => setDialogOpen(false)}
        onSaved={() => void loadEvents()}
        onError={setError}
      />

      <PowerUserSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </PageLayout>
  );
}
