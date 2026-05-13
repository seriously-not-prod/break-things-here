/**
 * Group seating logic (#593).
 *
 * Owners define named seating groups (family, VIP, etc.) and assign guests
 * to a group. When `seat_together` is true, the bulk-assign endpoint moves
 * every group member onto the same table in one operation and rejects the
 * call if the target table cannot fit the whole group.
 *
 * Note: the legacy free-text `rsvps.guest_group` column is preserved for
 * display/CSV purposes; the new `seating_group_id` FK is the source of
 * truth for seating logic.
 */
import type { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface SeatingGroupRow {
  id: number;
  event_id: number;
  name: string;
  seat_together: boolean;
  preferred_table_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/events/:eventId/seating/groups */
export async function listGroups(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: true });
  if (!event) return res as Response;
  const db = getDatabase();
  const groups = await db.all<SeatingGroupRow>(
    `SELECT * FROM seating_groups WHERE event_id = ? ORDER BY name ASC`,
    [eventId],
  );
  const members = await db.all<{ seating_group_id: number; id: number; name: string; email: string; guests: number }>(
    `SELECT seating_group_id, id, name, email, guests
     FROM rsvps WHERE event_id = ? AND seating_group_id IS NOT NULL`,
    [eventId],
  );
  const grouped = new Map<number, typeof members>();
  for (const m of members) {
    if (!grouped.has(m.seating_group_id)) grouped.set(m.seating_group_id, []);
    grouped.get(m.seating_group_id)!.push(m);
  }
  return res.json({
    groups: groups.map((g) => ({
      ...g,
      members: grouped.get(g.id) ?? [],
      member_count: grouped.get(g.id)?.length ?? 0,
      total_guests: (grouped.get(g.id) ?? []).reduce((acc, x) => acc + (x.guests ?? 1), 0),
    })),
  });
}

/** POST /api/events/:eventId/seating/groups */
export async function createGroup(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { name, seat_together, preferred_table_id, notes } = (req.body ?? {}) as {
    name?: string; seat_together?: boolean; preferred_table_id?: number; notes?: string;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'Group name is required.' });
  const db = getDatabase();
  try {
    const result = await db.run(
      `INSERT INTO seating_groups (event_id, name, seat_together, preferred_table_id, notes)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [eventId, name.trim(), seat_together !== false, preferred_table_id ?? null, notes?.trim() || null],
    );
    const row = await db.get<SeatingGroupRow>(
      `SELECT * FROM seating_groups WHERE id = ?`,
      [result.lastID],
    );
    return res.status(201).json({ group: row });
  } catch (err) {
    const m = err instanceof Error ? err.message : 'Insert failed';
    if (/unique|duplicate/i.test(m)) {
      return res.status(409).json({ error: 'A seating group with that name already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create seating group.' });
  }
}

/** PATCH /api/events/:eventId/seating/groups/:id */
export async function updateGroup(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { name, seat_together, preferred_table_id, notes } = (req.body ?? {}) as Record<string, unknown>;
  const fields: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  if (typeof name === 'string') { fields.push('name = ?'); params.push(name.trim()); }
  if (seat_together !== undefined) { fields.push('seat_together = ?'); params.push(Boolean(seat_together)); }
  if (preferred_table_id !== undefined) { fields.push('preferred_table_id = ?'); params.push(preferred_table_id === null ? null : Number(preferred_table_id)); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes ? String(notes).trim() : null); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id, eventId);
  const db = getDatabase();
  await db.run(
    `UPDATE seating_groups SET ${fields.join(', ')} WHERE id = ? AND event_id = ?`,
    params,
  );
  const row = await db.get<SeatingGroupRow>(
    `SELECT * FROM seating_groups WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );
  if (!row) return res.status(404).json({ error: 'Seating group not found.' });
  return res.json({ group: row });
}

/** DELETE /api/events/:eventId/seating/groups/:id */
export async function deleteGroup(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const db = getDatabase();
  await db.run(
    `UPDATE rsvps SET seating_group_id = NULL WHERE event_id = ? AND seating_group_id = ?`,
    [eventId, id],
  );
  await db.run(`DELETE FROM seating_groups WHERE id = ? AND event_id = ?`, [id, eventId]);
  return res.json({ deleted: true });
}

/** POST /api/events/:eventId/seating/groups/:id/members  body: { rsvpIds: number[] } */
export async function setGroupMembers(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { rsvpIds } = (req.body ?? {}) as { rsvpIds?: unknown };
  if (!Array.isArray(rsvpIds)) {
    return res.status(400).json({ error: 'rsvpIds[] is required.' });
  }
  // Reject null/string/negative/zero entries before constructing the SQL —
  // we never want raw client input to flow into IN clauses unvalidated.
  const safeIds = rsvpIds.filter((rid) => Number.isInteger(rid) && (rid as number) > 0) as number[];
  if (safeIds.length !== rsvpIds.length) {
    return res.status(400).json({ error: 'Invalid rsvpIds.' });
  }
  const db = getDatabase();
  const group = await db.get<{ id: number }>(
    `SELECT id FROM seating_groups WHERE id = ? AND event_id = ?`,
    [id, eventId],
  );
  if (!group) return res.status(404).json({ error: 'Seating group not found.' });

  // Clear existing assignments for the group, then re-assign the requested ids
  await db.run(
    `UPDATE rsvps SET seating_group_id = NULL WHERE event_id = ? AND seating_group_id = ?`,
    [eventId, id],
  );
  if (safeIds.length > 0) {
    const placeholders = safeIds.map(() => '?').join(', ');
    await db.run(
      `UPDATE rsvps SET seating_group_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE event_id = ? AND id IN (${placeholders})`,
      [id, eventId, ...safeIds],
    );
  }
  return res.json({ memberCount: safeIds.length });
}

/** POST /api/events/:eventId/seating/groups/:id/seat — bulk assign group members to a table */
export async function seatGroupAtTable(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const event = await requireEventAccess(authReq, res, eventId, { ownerOnly: true });
  if (!event) return res as Response;
  const { tableId } = (req.body ?? {}) as { tableId?: number };
  if (!Number.isInteger(tableId) || (tableId as number) <= 0) {
    return res.status(400).json({ error: 'tableId is required.' });
  }
  const db = getDatabase();
  const table = await db.get<{ id: number; capacity: number }>(
    `SELECT id, capacity FROM seating_tables WHERE id = ? AND event_id = ?`,
    [tableId, eventId],
  );
  if (!table) return res.status(404).json({ error: 'Seating table not found.' });

  const members = await db.all<{ id: number; guests: number }>(
    `SELECT id, guests FROM rsvps WHERE event_id = ? AND seating_group_id = ?`,
    [eventId, id],
  );
  if (members.length === 0) {
    return res.status(400).json({ error: 'Group has no members to seat.' });
  }

  // Capacity check including any non-group guests already at the table.
  const existing = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(r.guests), 0)::int AS total
     FROM seating_assignments sa
     JOIN rsvps r ON r.id = sa.rsvp_id
     WHERE sa.table_id = ? AND (r.seating_group_id IS NULL OR r.seating_group_id <> ?)`,
    [tableId, id],
  );
  const groupSeatCount = members.reduce((acc, m) => acc + (m.guests ?? 1), 0);
  const occupiedByOthers = existing?.total ?? 0;
  if (occupiedByOthers + groupSeatCount > (table.capacity ?? 0)) {
    return res.status(409).json({
      error: 'Table does not have enough capacity for the entire group.',
      capacity: table.capacity,
      occupiedByOthers,
      groupSeatCount,
    });
  }

  // Remove members from any other tables first; then assign to target table.
  for (const m of members) {
    await db.run(
      `DELETE FROM seating_assignments WHERE rsvp_id = ?`,
      [m.id],
    );
    await db.run(
      `INSERT INTO seating_assignments (table_id, rsvp_id) VALUES (?, ?)
       ON CONFLICT (table_id, rsvp_id) DO NOTHING`,
      [tableId, m.id],
    );
  }
  return res.json({ seated: members.length, tableId, groupId: Number(id) });
}
