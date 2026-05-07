/**
 * Seating Chart Editor — issue #457 (story #417)
 *
 * Drag-and-drop visual editor that sits inside the SeatingPage chart tab.
 *
 * - Unassigned guests (right panel) are draggable onto any table drop zone.
 * - Assigned guest chips are draggable to other tables (reassignment).
 * - A DragOverlay ghost follows the pointer during a drag.
 * - All seating mutations call the parent callbacks which hit the existing API.
 * - Existing CRUD (create/delete table, unassign button) is preserved.
 */
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { DeleteRounded, PersonRemoveRounded } from '@mui/icons-material';
import { useState } from 'react';
import type { Rsvp, SeatingTable } from '../../services/guest-service';

// ─── Internal types ───────────────────────────────────────────────────────────

interface AssignedGuest {
  rsvp_id: number;
  name: string;
  email: string;
  status: string;
}

interface ActiveGuest {
  rsvpId: number;
  name: string;
  email: string;
  status: string;
  sourceTableId: number | null; // null = was unassigned
}

// ─── Drag-ID helpers ──────────────────────────────────────────────────────────

const toGuestDragId = (rsvpId: number) => `guest-${rsvpId}`;
const toTableDropId = (tableId: number) => `table-${tableId}`;

function parseGuestId(dragId: string): number | null {
  const match = /^guest-(\d+)$/.exec(dragId);
  return match ? parseInt(match[1], 10) : null;
}

function parseTableId(dropId: string): number | null {
  const match = /^table-(\d+)$/.exec(dropId);
  return match ? parseInt(match[1], 10) : null;
}

// ─── DraggableGuest — assigned chip variant ───────────────────────────────────

interface DraggableAssignedGuestProps {
  guest: AssignedGuest;
  tableId: number;
  tableName: string;
  onUnassign: (tableId: number, rsvpId: number) => void;
}

function DraggableAssignedGuest({
  guest,
  tableId,
  tableName,
  onUnassign,
}: DraggableAssignedGuestProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: toGuestDragId(guest.rsvp_id),
      data: { rsvpId: guest.rsvp_id, sourceTableId: tableId },
    });

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
      }}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
    >
      {/* grab handle area */}
      <Box
        {...listeners}
        {...attributes}
        sx={{ display: 'flex', alignItems: 'center', cursor: isDragging ? 'grabbing' : 'grab' }}
        aria-label={`Drag ${guest.name} to reassign`}
      >
        <Chip
          label={guest.name}
          size="small"
          aria-label={`${guest.name} assigned to ${tableName}`}
          sx={{ cursor: 'inherit' }}
        />
      </Box>
      <Tooltip title={`Remove ${guest.name} from table`}>
        <IconButton
          size="small"
          color="default"
          onClick={() => onUnassign(tableId, guest.rsvp_id)}
          aria-label={`Remove ${guest.name} from table`}
        >
          <PersonRemoveRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

// ─── DraggableUnassignedGuest — list-item variant ─────────────────────────────

interface DraggableUnassignedGuestProps {
  rsvp: Rsvp;
}

function DraggableUnassignedGuest({ rsvp }: DraggableUnassignedGuestProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: toGuestDragId(rsvp.id),
      data: { rsvpId: rsvp.id, sourceTableId: null },
    });

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        touchAction: 'none',
      }}
      {...listeners}
      {...attributes}
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
      role="button"
      aria-label={`Drag ${rsvp.name} to a table`}
    >
      <Typography variant="body2" fontWeight={600}>
        {rsvp.name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {rsvp.email} · {rsvp.status}
      </Typography>
    </Box>
  );
}

// ─── DroppableTable ───────────────────────────────────────────────────────────

interface DroppableTableProps {
  table: SeatingTable;
  onUnassign: (tableId: number, rsvpId: number) => void;
  onDeleteTable: (tableId: number) => void;
}

function DroppableTable({ table, onUnassign, onDeleteTable }: DroppableTableProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: toTableDropId(table.id) });

  const isFull = table.guests.length >= table.capacity;

  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{
        borderColor: isOver && !isFull ? 'primary.main' : isFull ? 'warning.main' : 'divider',
        borderWidth: isOver && !isFull ? 2 : 1,
        bgcolor: isOver && !isFull ? 'primary.50' : 'background.paper',
        transition: 'border-color 0.15s, background-color 0.15s',
        minHeight: 120,
      }}
    >
      <CardHeader
        title={table.name}
        subheader={
          <Typography
            variant="caption"
            color={isFull ? 'warning.main' : 'text.secondary'}
            aria-label={`${table.guests.length} of ${table.capacity} seats filled`}
          >
            {table.guests.length} / {table.capacity} seats{isFull ? ' (full)' : ''}
          </Typography>
        }
        action={
          <Tooltip title="Delete table">
            <IconButton
              size="small"
              color="error"
              onClick={() => onDeleteTable(table.id)}
              aria-label={`Delete table ${table.name}`}
            >
              <DeleteRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        <Stack
          direction="row"
          flexWrap="wrap"
          gap={1}
          sx={{ minHeight: 48, alignItems: 'flex-start' }}
        >
          {table.guests.map((g) => (
            <DraggableAssignedGuest
              key={g.rsvp_id}
              guest={g as AssignedGuest}
              tableId={table.id}
              tableName={table.name}
              onUnassign={onUnassign}
            />
          ))}
          {table.guests.length === 0 && (
            <Typography
              variant="caption"
              color={isOver ? 'primary.main' : 'text.disabled'}
              sx={{ alignSelf: 'center', fontStyle: 'italic' }}
            >
              {isOver ? 'Release to assign' : 'Drag guests here'}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── GhostCard — shown in DragOverlay ────────────────────────────────────────

function GhostCard({ name, email, status }: { name: string; email: string; status: string }): JSX.Element {
  return (
    <Box
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'primary.main',
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        boxShadow: 4,
        pointerEvents: 'none',
        minWidth: 160,
      }}
    >
      <Typography variant="body2" fontWeight={600}>
        {name}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {email} · {status}
      </Typography>
    </Box>
  );
}

// ─── SeatingChartEditor (public export) ──────────────────────────────────────

export interface SeatingChartEditorProps {
  tables: SeatingTable[];
  rsvps: Rsvp[];
  error: string | null;
  onAssign: (tableId: number, rsvpId: number) => Promise<void>;
  onUnassign: (tableId: number, rsvpId: number) => Promise<void>;
  onDeleteTable: (tableId: number) => Promise<void>;
  onClearError: () => void;
}

export function SeatingChartEditor({
  tables,
  rsvps,
  error,
  onAssign,
  onUnassign,
  onDeleteTable,
  onClearError,
}: SeatingChartEditorProps): JSX.Element {
  const [activeGuest, setActiveGuest] = useState<ActiveGuest | null>(null);

  // Require at least 8px movement so click-only actions don't trigger DnD
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Build lookup maps
  const rsvpById = new Map(rsvps.map((r) => [r.id, r]));
  const assignedIds = new Set(tables.flatMap((t) => t.guests.map((g) => g.rsvp_id)));
  const unassigned = rsvps.filter((r) => !assignedIds.has(r.id));

  const handleDragStart = ({ active }: DragStartEvent) => {
    const rsvpId = parseGuestId(active.id.toString());
    if (rsvpId === null) return;

    const rsvp = rsvpById.get(rsvpId);
    const sourceTableId = (active.data.current?.sourceTableId as number | null) ?? null;

    if (rsvp) {
      setActiveGuest({ rsvpId, name: rsvp.name, email: rsvp.email, status: rsvp.status, sourceTableId });
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveGuest(null);

    if (!over) return;

    const rsvpId = parseGuestId(active.id.toString());
    const targetTableId = parseTableId(over.id.toString());

    if (rsvpId === null || targetTableId === null) return;

    const sourceTableId = (active.data.current?.sourceTableId as number | null) ?? null;

    // No-op if dropped on the same table it came from
    if (sourceTableId === targetTableId) return;

    // Check target table capacity before attempting assign
    const targetTable = tables.find((t) => t.id === targetTableId);
    if (!targetTable) return;
    if (targetTable.guests.length >= targetTable.capacity) return;

    void onAssign(targetTableId, rsvpId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {error && (
        <Alert severity="error" onClose={onClearError} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* ── Left / centre: Table drop zones ── */}
        <Grid item xs={12} md={8}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            Tables ({tables.length})
          </Typography>

          {tables.length === 0 ? (
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
              <Typography>No tables yet. Use "New Table" to add one.</Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {tables.map((table) => (
                <Grid item xs={12} sm={6} key={table.id}>
                  <DroppableTable
                    table={table}
                    onUnassign={onUnassign}
                    onDeleteTable={onDeleteTable}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Grid>

        {/* ── Right: Unassigned guests ── */}
        <Grid item xs={12} md={4}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
            Unassigned ({unassigned.length})
          </Typography>

          {unassigned.length === 0 ? (
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
          ) : (
            <Stack spacing={1}>
              {unassigned.map((r) => (
                <DraggableUnassignedGuest key={r.id} rsvp={r} />
              ))}
            </Stack>
          )}
        </Grid>
      </Grid>

      {/* Ghost chip shown while dragging */}
      <DragOverlay>
        {activeGuest && (
          <GhostCard
            name={activeGuest.name}
            email={activeGuest.email}
            status={activeGuest.status}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
}
