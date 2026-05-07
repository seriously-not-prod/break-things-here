import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface SeatingTable {
  id: number;
  event_id: number;
  name: string;
  capacity: number;
  layout_x: number | null;
  layout_y: number | null;
  created_at: string;
}

interface AssignedRsvp {
  rsvp_id: number;
  name: string;
  email: string;
  status: string;
}

interface SeatingTableWithGuests extends SeatingTable {
  guests: AssignedRsvp[];
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

async function assertEventAccess(req: AuthRequest, res: Response, eventId: string): Promise<boolean> {
  const event = await requireEventAccess(req, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage seating for this event.',
  });
  return Boolean(event);
}

/** GET /api/events/:eventId/seating/tables */
export async function listTables(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const tables = await db.all<SeatingTable>(
    'SELECT * FROM seating_tables WHERE event_id = ? ORDER BY name ASC',
    [eventId],
  );

  const result: SeatingTableWithGuests[] = await Promise.all(
    tables.map(async (table) => {
      const guests = await db.all<AssignedRsvp>(
        `SELECT sa.rsvp_id, r.name, r.email, r.status
         FROM seating_assignments sa
         JOIN rsvps r ON r.id = sa.rsvp_id
         WHERE sa.table_id = ?`,
        [table.id],
      );
      return { ...table, guests };
    }),
  );

  return res.json({ tables: result });
}

/** POST /api/events/:eventId/seating/tables */
export async function createTable(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { eventId } = req.params;
  const { name, capacity } = req.body as { name?: string; capacity?: number | string };

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  if (!name?.trim()) return res.status(400).json({ error: 'Table name is required.' });

  const cap = capacity !== undefined ? Number(capacity) : 8;
  if (!Number.isInteger(cap) || cap < 1) {
    return res.status(400).json({ error: 'Capacity must be a positive integer.' });
  }

  const event = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE id = ? AND deleted_at IS NULL',
    [eventId],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const layoutSeed = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM seating_tables WHERE event_id = ?',
    [eventId],
  );
  const existingCount = layoutSeed?.count ?? 0;
  const layoutX = 32 + (existingCount % 3) * 300;
  const layoutY = 32 + Math.floor(existingCount / 3) * 210;

  const result = await db.run(
    `INSERT INTO seating_tables (event_id, name, capacity, layout_x, layout_y)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [eventId, name.trim(), cap, layoutX, layoutY],
  );

  const table = await db.get<SeatingTable>(
    'SELECT * FROM seating_tables WHERE id = ?',
    [result.lastID],
  );

  return res.status(201).json({ table });
}

/** PATCH /api/events/:eventId/seating/tables/:tableId/layout */
export async function updateTableLayout(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { tableId, eventId } = req.params;
  const { layout_x, layout_y } = req.body as {
    layout_x?: number | string;
    layout_y?: number | string;
  };

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const nextX = Number(layout_x);
  const nextY = Number(layout_y);
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || nextX < 0 || nextY < 0) {
    return res.status(400).json({ error: 'Layout coordinates must be non-negative numbers.' });
  }

  const table = await db.get<Pick<SeatingTable, 'id'>>(
    'SELECT id FROM seating_tables WHERE id = ? AND event_id = ?',
    [tableId, eventId],
  );
  if (!table) return res.status(404).json({ error: 'Table not found.' });

  await db.run(
    'UPDATE seating_tables SET layout_x = ?, layout_y = ? WHERE id = ?',
    [Math.round(nextX), Math.round(nextY), tableId],
  );

  const updatedTable = await db.get<SeatingTable>(
    'SELECT * FROM seating_tables WHERE id = ?',
    [tableId],
  );

  return res.json({ table: updatedTable });
}

/** DELETE /api/events/:eventId/seating/tables/:tableId */
export async function deleteTable(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { tableId, eventId } = req.params;

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const table = await db.get<Pick<SeatingTable, 'id'>>(
    'SELECT id FROM seating_tables WHERE id = ? AND event_id = ?',
    [tableId, eventId],
  );
  if (!table) return res.status(404).json({ error: 'Table not found.' });

  await db.run('DELETE FROM seating_tables WHERE id = ?', [tableId]);
  return res.json({ message: 'Table deleted.' });
}

/** POST /api/events/:eventId/seating/tables/:tableId/assign/:rsvpId */
export async function assignGuest(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { tableId, rsvpId, eventId } = req.params;

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const table = await db.get<{ id: number; capacity: number }>(
    'SELECT id, capacity FROM seating_tables WHERE id = ? AND event_id = ?',
    [tableId, eventId],
  );
  if (!table) return res.status(404).json({ error: 'Table not found.' });

  const rsvp = await db.get<{ id: number }>(
    'SELECT id FROM rsvps WHERE id = ? AND event_id = ?',
    [rsvpId, eventId],
  );
  if (!rsvp) return res.status(404).json({ error: 'RSVP not found.' });

  // Check if already assigned to a different table
  const existing = await db.get<{ table_id: number }>(
    'SELECT table_id FROM seating_assignments WHERE rsvp_id = ?',
    [rsvpId],
  );
  if (existing) {
    if (existing.table_id === Number(tableId)) {
      return res.status(409).json({ error: 'Guest already assigned to this table.' });
    }
    // Remove from the previous table before reassigning
    await db.run(
      'DELETE FROM seating_assignments WHERE rsvp_id = ?',
      [rsvpId],
    );
  }

  // Capacity check
  const assigned = await db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM seating_assignments WHERE table_id = ?',
    [tableId],
  );
  if ((assigned?.count ?? 0) >= table.capacity) {
    return res.status(409).json({ error: 'Table is at capacity.' });
  }

  await db.run(
    'INSERT INTO seating_assignments (table_id, rsvp_id) VALUES (?, ?)',
    [tableId, rsvpId],
  );

  return res.status(201).json({ message: 'Guest assigned.' });
}

/** DELETE /api/events/:eventId/seating/tables/:tableId/assign/:rsvpId */
export async function unassignGuest(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const db = getDatabase();
  const { tableId, rsvpId, eventId } = req.params;

  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const assignment = await db.get<{ table_id: number }>(
    'SELECT table_id FROM seating_assignments WHERE table_id = ? AND rsvp_id = ?',
    [tableId, rsvpId],
  );
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  await db.run(
    'DELETE FROM seating_assignments WHERE table_id = ? AND rsvp_id = ?',
    [tableId, rsvpId],
  );

  return res.json({ message: 'Guest unassigned.' });
}
