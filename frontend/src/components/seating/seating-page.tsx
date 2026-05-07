/**
 * Seating Chart Page — issue #386 (story #377)
 *
 * Route: /events/:id/seating
 *
 * Left panel: seating tables with assigned guest chips.
 * Right panel: unassigned RSVPs eligible for assignment.
 */
/**
 * Updated for issue #457 (story #417): added drag-and-drop chart editor tab.
 * The original list view is preserved as "List" tab; a new "Chart Editor" tab
 * exposes SeatingChartEditor powered by @dnd-kit.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AddRounded, DeleteRounded, PersonRemoveRounded, TableChartRounded, ViewListRounded } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import * as guestService from '../../services/guest-service';
import type { Rsvp, SeatingTable } from '../../services/guest-service';
import { ApiError } from '../../lib/api-client';
import { SeatingChartEditor } from './seating-chart-editor';

interface CreateTableForm {
  name: string;
  capacity: string;
}

const FORM_DEFAULT: CreateTableForm = { name: '', capacity: '8' };

export function SeatingPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();

  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateTableForm>(FORM_DEFAULT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');

  const loadAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const [tablesData, rsvpsData] = await Promise.all([
        guestService.listTables(eventId),
        guestService.listRsvps(eventId),
      ]);
      setTables(tablesData);
      setRsvps(rsvpsData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load seating data.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Compute the set of assigned rsvp IDs across all tables
  const assignedIds = new Set(
    tables.flatMap((t) => t.guests.map((g) => g.rsvp_id)),
  );

  const unassigned = rsvps.filter((r) => !assignedIds.has(r.id));

  // ── Create table ────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setForm(FORM_DEFAULT);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleCreateTable = async () => {
    if (!eventId) return;
    if (!form.name.trim()) {
      setFormError('Table name is required.');
      return;
    }
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1) {
      setFormError('Capacity must be a positive whole number.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const newTable = await guestService.createTable(eventId, {
        name: form.name.trim(),
        capacity: cap,
      });
      setTables((prev) => [...prev, { ...newTable, guests: [] }]);
      setCreateOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create table.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete table ─────────────────────────────────────────────────────────

  const handleDeleteTable = async (tableId: number) => {
    if (!eventId) return;
    try {
      await guestService.deleteTable(eventId, tableId);
      setTables((prev) => prev.filter((t) => t.id !== tableId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete table.');
    }
  };

  // ── Assign guest ─────────────────────────────────────────────────────────

  const handleAssign = async (tableId: number, rsvpId: number) => {
    if (!eventId || rsvpId === 0) return;
    try {
      await guestService.assignGuest(eventId, tableId, rsvpId);
      // Refresh all data to reflect new assignment
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign guest.');
    }
  };

  // ── Unassign guest ────────────────────────────────────────────────────────

  const handleUnassign = async (tableId: number, rsvpId: number) => {
    if (!eventId) return;
    try {
      await guestService.unassignGuest(eventId, tableId, rsvpId);
      setTables((prev) =>
        prev.map((t) =>
          t.id === tableId
            ? { ...t, guests: t.guests.filter((g) => g.rsvp_id !== rsvpId) }
            : t,
        ),
      );
      // Re-add the guest to the rsvps list (keep local state consistent)
      const rsvp = rsvps.find((r) => r.id === rsvpId);
      if (rsvp) {
        // Trigger a reload so counts are accurate
        setRsvps((prev) => [...prev]);
        await loadAll();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to unassign guest.');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Seating Chart
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddRounded />}
          onClick={handleOpenCreate}
          aria-label="Create new table"
        >
          New Table
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* View-mode tab strip */}
      <Tabs
        value={viewMode}
        onChange={(_e, v: 'list' | 'chart') => setViewMode(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        aria-label="Seating view mode"
      >
        <Tab
          value="list"
          label="List View"
          icon={<ViewListRounded fontSize="small" />}
          iconPosition="start"
          aria-label="Switch to list view"
        />
        <Tab
          value="chart"
          label="Chart Editor"
          icon={<TableChartRounded fontSize="small" />}
          iconPosition="start"
          aria-label="Switch to chart editor"
        />
      </Tabs>

      {/* ── Chart Editor tab ─────────────────────────────────────────────── */}
      {viewMode === 'chart' && !loading && (
        <SeatingChartEditor
          tables={tables}
          rsvps={rsvps}
          error={error}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onDeleteTable={handleDeleteTable}
          onClearError={() => setError(null)}
        />
      )}

      {viewMode === 'chart' && loading && (
        <Stack spacing={2}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      )}

      {/* ── List View tab ────────────────────────────────────────────────── */}
      {viewMode === 'list' && <Grid container spacing={3}>
        {/* Left panel — Tables */}
        <Grid item xs={12} md={8}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            Tables ({tables.length})
          </Typography>

          {loading && (
            <Stack spacing={2}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
              ))}
            </Stack>
          )}

          {!loading && tables.length === 0 && (
            <Box
              sx={{
                p: 6,
                textAlign: 'center',
                color: 'text.secondary',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Typography>No tables yet. Create one to start assigning seats.</Typography>
            </Box>
          )}

          {!loading && (
            <Stack spacing={2}>
              {tables.map((table) => (
                <Card key={table.id} variant="outlined">
                  <CardHeader
                    title={table.name}
                    subheader={`Capacity: ${table.guests.length} / ${table.capacity}`}
                    action={
                      <Tooltip title="Delete table">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleDeleteTable(table.id)}
                          aria-label={`Delete table ${table.name}`}
                        >
                          <DeleteRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    }
                  />
                  <CardContent sx={{ pt: 0 }}>
                    {/* Assigned guests chips */}
                    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                      {table.guests.map((g) => (
                        <Box
                          key={g.rsvp_id}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            px: 0.5,
                            py: 0.25,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 4,
                          }}
                        >
                          <Chip
                            label={g.name}
                            size="small"
                            aria-label={`${g.name} assigned to ${table.name}`}
                          />
                          <Tooltip title={`Remove ${g.name} from table`}>
                            <IconButton
                              size="small"
                              color="default"
                              onClick={() => void handleUnassign(table.id, g.rsvp_id)}
                              aria-label={`Remove ${g.name} from table`}
                            >
                              <PersonRemoveRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                      {table.guests.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                          No guests assigned
                        </Typography>
                      )}
                    </Stack>

                    {/* Assign from unassigned */}
                    {table.guests.length < table.capacity && unassigned.length > 0 && (
                      <Select
                        displayEmpty
                        size="small"
                        value=""
                        onChange={(e: SelectChangeEvent) =>
                          void handleAssign(table.id, Number(e.target.value))
                        }
                        inputProps={{ 'aria-label': `Assign guest to ${table.name}` }}
                        sx={{ minWidth: 220 }}
                        renderValue={() => 'Assign a guest…'}
                      >
                        {unassigned.map((r) => (
                          <MenuItem key={r.id} value={r.id}>
                            {r.name} — {r.status}
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Grid>

        {/* Right panel — Unassigned guests */}
        <Grid item xs={12} md={4}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            Unassigned ({unassigned.length})
          </Typography>

          {loading && (
            <Stack spacing={1}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="text" />
              ))}
            </Stack>
          )}

          {!loading && unassigned.length === 0 && (
            <Box
              sx={{
                p: 4,
                textAlign: 'center',
                color: 'text.secondary',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <Typography variant="body2">All guests have been assigned a seat.</Typography>
            </Box>
          )}

          {!loading && (
            <Stack spacing={1}>
              {unassigned.map((r) => (
                <Box
                  key={r.id}
                  sx={{
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {r.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.email} · {r.status}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Grid>
      </Grid>
      }

      {/* Create Table Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Table</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label="Table name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              inputProps={{ 'aria-label': 'Table name', maxLength: 80 }}
              fullWidth
              autoFocus
            />
            <TextField
              label="Capacity"
              type="number"
              value={form.capacity}
              onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
              inputProps={{ 'aria-label': 'Table capacity', min: 1 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateTable()}
            disabled={saving}
            aria-label="Save new table"
          >
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
