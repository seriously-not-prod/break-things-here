/**
 * Seating Chart Page — issue #386 (story #377)
 *
 * Route: /events/:id/seating
 *
 * Left panel: seating tables with assigned guest chips.
 * Right panel: unassigned RSVPs eligible for assignment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  DeleteRounded,
  DragIndicatorRounded,
  PersonRemoveRounded,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import * as guestService from '../../services/guest-service';
import type { Rsvp, SeatingTable } from '../../services/guest-service';
import { ApiError } from '../../lib/api-client';

interface CreateTableForm {
  name: string;
  capacity: string;
}

interface DragGuestPayload {
  rsvpId: number;
  fromTableId: number | null;
}

interface TablePosition {
  x: number;
  y: number;
}

interface ActiveTableDrag {
  tableId: number;
  offsetX: number;
  offsetY: number;
}

const FORM_DEFAULT: CreateTableForm = { name: '', capacity: '8' };
const TABLE_WIDTH = 260;
const TABLE_HEIGHT = 190;
const LAYOUT_WIDTH = 960;
const LAYOUT_HEIGHT = 560;

function getFallbackPosition(index: number): TablePosition {
  return {
    x: 32 + (index % 3) * 300,
    y: 32 + Math.floor(index / 3) * 210,
  };
}

function getTablePosition(table: SeatingTable, index: number): TablePosition {
  if (table.layout_x != null && table.layout_y != null) {
    return { x: table.layout_x, y: table.layout_y };
  }
  return getFallbackPosition(index);
}

function normaliseTables(nextTables: SeatingTable[]): SeatingTable[] {
  return nextTables.map((table, index) => {
    const position = getTablePosition(table, index);
    return {
      ...table,
      layout_x: position.x,
      layout_y: position.y,
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseGuestDragPayload(raw: string): DragGuestPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DragGuestPayload>;
    if (typeof parsed.rsvpId !== 'number') return null;
    if (parsed.fromTableId !== null && parsed.fromTableId !== undefined && typeof parsed.fromTableId !== 'number') {
      return null;
    }
    return {
      rsvpId: parsed.rsvpId,
      fromTableId: parsed.fromTableId ?? null,
    };
  } catch {
    return null;
  }
}

export function SeatingPage(): JSX.Element {
  const { id: eventId } = useParams<{ id: string }>();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<ActiveTableDrag | null>(null);
  const latestTablesRef = useRef<SeatingTable[]>([]);
  const pendingDragPositionRef = useRef<TablePosition | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateTableForm>(FORM_DEFAULT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingTableId, setDraggingTableId] = useState<number | null>(null);
  const [savingLayoutTableId, setSavingLayoutTableId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const [tablesData, rsvpsData] = await Promise.all([
        guestService.listTables(eventId),
        guestService.listRsvps(eventId),
      ]);
      setTables(normaliseTables(tablesData));
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

  useEffect(() => {
    latestTablesRef.current = tables;
  }, [tables]);

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
      setTables((prev) => normaliseTables([...prev, { ...newTable, guests: [] }]));
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

  const updateDraggedTablePosition = useCallback((tableId: number, position: TablePosition) => {
    setTables((prev) => {
      const next = prev.map((table) =>
        table.id === tableId
          ? { ...table, layout_x: position.x, layout_y: position.y }
          : table,
      );
      latestTablesRef.current = next;
      return next;
    });
  }, []);

  const persistTableLayout = useCallback(async (tableId: number) => {
    if (!eventId) return;

    const table = latestTablesRef.current.find((candidate) => candidate.id === tableId);
    if (!table || table.layout_x == null || table.layout_y == null) return;

    setSavingLayoutTableId(tableId);
    try {
      const updatedTable = await guestService.updateTableLayout(eventId, tableId, {
        layout_x: table.layout_x,
        layout_y: table.layout_y,
      });
      setTables((prev) =>
        prev.map((candidate) =>
          candidate.id === tableId ? { ...candidate, ...updatedTable, guests: candidate.guests } : candidate,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save table layout.');
      await loadAll();
    } finally {
      setSavingLayoutTableId((current) => (current === tableId ? null : current));
    }
  }, [eventId, loadAll]);

  useEffect(() => {
    if (draggingTableId == null) return;

    const flushPendingDragPosition = () => {
      const dragState = dragStateRef.current;
      const pendingPosition = pendingDragPositionRef.current;
      dragFrameRef.current = null;
      if (!dragState || !pendingPosition) return;
      updateDraggedTablePosition(dragState.tableId, pendingPosition);
      pendingDragPositionRef.current = null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      const canvas = canvasRef.current;
      if (!dragState || !canvas) return;

      const canvasRect = canvas.getBoundingClientRect();
      pendingDragPositionRef.current = {
        x: clamp(
          Math.round(event.clientX - canvasRect.left - dragState.offsetX),
          0,
          canvasRect.width - TABLE_WIDTH,
        ),
        y: clamp(
          Math.round(event.clientY - canvasRect.top - dragState.offsetY),
          0,
          canvasRect.height - TABLE_HEIGHT,
        ),
      };

      if (dragFrameRef.current == null) {
        dragFrameRef.current = window.requestAnimationFrame(flushPendingDragPosition);
      }
    };

    const handlePointerUp = () => {
      const dragState = dragStateRef.current;
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        flushPendingDragPosition();
      }
      dragStateRef.current = null;
      setDraggingTableId(null);
      if (dragState) {
        void persistTableLayout(dragState.tableId);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (dragFrameRef.current != null) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      pendingDragPositionRef.current = null;
    };
  }, [draggingTableId, persistTableLayout, updateDraggedTablePosition]);

  const handleTablePointerDown = (tableId: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tableIndex = tables.findIndex((table) => table.id === tableId);
    const table = tables[tableIndex];
    if (!table) return;

    const canvasRect = canvas.getBoundingClientRect();
    const currentPosition = getTablePosition(table, tableIndex);
    dragStateRef.current = {
      tableId,
      offsetX: event.clientX - canvasRect.left - currentPosition.x,
      offsetY: event.clientY - canvasRect.top - currentPosition.y,
    };
    setDraggingTableId(tableId);
  };

  const handleGuestDragStart = (
    event: React.DragEvent<HTMLElement>,
    rsvpId: number,
    fromTableId: number | null,
  ) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/json',
      JSON.stringify({ rsvpId, fromTableId } satisfies DragGuestPayload),
    );
  };

  const handleGuestDrop = async (
    event: React.DragEvent<HTMLElement>,
    targetTableId: number | null,
  ) => {
    event.preventDefault();
    const payload = parseGuestDragPayload(event.dataTransfer.getData('application/json'));
    if (!payload || !eventId || payload.fromTableId === targetTableId) return;

    try {
      if (targetTableId == null) {
        if (payload.fromTableId == null) return;
        await guestService.unassignGuest(eventId, payload.fromTableId, payload.rsvpId);
      } else {
        await guestService.assignGuest(eventId, targetTableId, payload.rsvpId);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to move guest.');
    }
  };

  const renderGuestCard = (
    guest: { id: number; name: string; email: string; status: string },
    fromTableId: number | null,
    tableName?: string,
  ) => (
    <Stack
      key={`${fromTableId ?? 'pool'}-${guest.id}`}
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ width: '100%' }}
    >
      <Box
        draggable
        data-testid={`draggable-guest-${guest.id}`}
        onDragStart={(event) => handleGuestDragStart(event, guest.id, fromTableId)}
        sx={{
          flex: 1,
          px: 1.25,
          py: 1,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          cursor: 'grab',
        }}
        aria-label={tableName ? `${guest.name} assigned to ${tableName}` : `${guest.name} unassigned guest`}
      >
        <Typography variant="body2" fontWeight={600}>
          {guest.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {guest.email} · {guest.status}
        </Typography>
      </Box>
      {fromTableId != null && (
        <Tooltip title={`Remove ${guest.name} from table`}>
          <IconButton
            size="small"
            color="default"
            onClick={() => void handleUnassign(fromTableId, guest.id)}
            aria-label={`Remove ${guest.name} from table`}
          >
            <PersonRemoveRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Seating Chart Editor
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
            Drag tables to arrange the room, then drag guests between tables or back to the unassigned list.
          </Typography>
        </Box>
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

      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5}>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  Layout Editor
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tables ({tables.length})
                </Typography>
              </Box>
              <Chip
                label={savingLayoutTableId != null ? 'Saving layout…' : 'Drag tables to reposition'}
                color={savingLayoutTableId != null ? 'warning' : 'default'}
                variant="outlined"
              />
            </Stack>

            {loading && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 2 }} />
                ))}
              </Stack>
            )}

            {!loading && (
              <Box sx={{ mt: 2, overflowX: 'auto' }}>
                <Box
                  ref={canvasRef}
                  data-testid="seating-layout-canvas"
                  role="region"
                  aria-label="Seating layout editor"
                  sx={{
                    position: 'relative',
                    minWidth: LAYOUT_WIDTH,
                    height: LAYOUT_HEIGHT,
                    borderRadius: 3,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: '#fcfaf5',
                    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(25, 118, 210, 0.12) 1px, transparent 0)',
                    backgroundSize: '24px 24px',
                    overflow: 'hidden',
                  }}
                >
                  {tables.length === 0 && (
                    <Stack
                      spacing={1}
                      alignItems="center"
                      justifyContent="center"
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        color: 'text.secondary',
                      }}
                    >
                      <Typography fontWeight={600}>No tables yet.</Typography>
                      <Typography variant="body2">Create one to start designing the seating layout.</Typography>
                    </Stack>
                  )}

                  {tables.map((table, index) => {
                    const position = getTablePosition(table, index);
                    return (
                      <Card
                        key={table.id}
                        data-testid={`table-card-${table.id}`}
                        variant="outlined"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => void handleGuestDrop(event, table.id)}
                        sx={{
                          position: 'absolute',
                          left: position.x,
                          top: position.y,
                          width: TABLE_WIDTH,
                          minHeight: TABLE_HEIGHT,
                          borderRadius: 3,
                          borderColor: draggingTableId === table.id ? 'primary.main' : 'divider',
                          boxShadow: draggingTableId === table.id ? 6 : 2,
                          zIndex: draggingTableId === table.id ? 2 : 1,
                          transition: draggingTableId === table.id ? 'none' : 'box-shadow 120ms ease',
                        }}
                      >
                        <CardHeader
                          title={table.name}
                          subheader={`Capacity: ${table.guests.length} / ${table.capacity}`}
                          action={
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              <Tooltip title="Drag to move table">
                                <IconButton
                                  size="small"
                                  onPointerDown={handleTablePointerDown(table.id)}
                                  aria-label={`Move ${table.name}`}
                                >
                                  <DragIndicatorRounded fontSize="small" />
                                </IconButton>
                              </Tooltip>
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
                            </Stack>
                          }
                        />
                        <CardContent sx={{ pt: 0 }}>
                          <Stack spacing={1} sx={{ mb: 1.5 }}>
                            {table.guests.map((guest) =>
                              renderGuestCard(
                                {
                                  id: guest.rsvp_id,
                                  name: guest.name,
                                  email: guest.email,
                                  status: guest.status,
                                },
                                table.id,
                                table.name,
                              ),
                            )}
                            {table.guests.length === 0 && (
                              <Typography variant="caption" color="text.secondary">
                                Drop guests here or use the assignment menu below.
                              </Typography>
                            )}
                          </Stack>

                          <Divider sx={{ mb: 1.5 }} />

                          {table.guests.length < table.capacity && unassigned.length > 0 && (
                            <Select
                              displayEmpty
                              size="small"
                              value=""
                              onChange={(event: SelectChangeEvent) =>
                                void handleAssign(table.id, Number(event.target.value))
                              }
                              inputProps={{ 'aria-label': `Assign guest to ${table.name}` }}
                              fullWidth
                              renderValue={() => 'Assign a guest…'}
                            >
                              {unassigned.map((guest) => (
                                <MenuItem key={guest.id} value={guest.id}>
                                  {guest.name} — {guest.status}
                                </MenuItem>
                              ))}
                            </Select>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={2}>
            <Card
              variant="outlined"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => void handleGuestDrop(event, null)}
              sx={{ borderRadius: 3 }}
            >
              <CardHeader
                title="Unassigned Guests"
                subheader={
                  unassigned.length === 0
                    ? 'Everyone is seated.'
                    : `${unassigned.length} guests waiting for a seat`
                }
              />
              <CardContent>
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
                      p: 3,
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

                {!loading && unassigned.length > 0 && (
                  <Stack spacing={1.25}>
                    {unassigned.map((guest) =>
                      renderGuestCard(
                        {
                          id: guest.id,
                          name: guest.name,
                          email: guest.email,
                          status: guest.status,
                        },
                        null,
                      ),
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Editing Tips
              </Typography>
              <Stack spacing={0.75}>
                <Typography variant="body2" color="text.secondary">
                  Drag a table handle to reposition it on the room layout.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Drag a guest onto a table to seat them or onto the unassigned list to remove them.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  The assignment menu remains available for quick keyboard-friendly changes.
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

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
