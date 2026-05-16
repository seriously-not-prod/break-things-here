/**
 * Guest Groups Controller — #667
 * CRUD management for guest groups and bulk CSV import.
 */
import type { RequestHandler, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getDatabase } from '../db/database.js';
import { logAudit } from '../utils/audit-log.js';

interface GuestGroup {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// GET /api/events/:eventId/guest-groups
export const listGuestGroups: RequestHandler = async (req, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) { res.status(400).json({ error: 'Invalid eventId' }); return; }
  const db = getDatabase();
  const groups = await db.all<GuestGroup>(
    `SELECT gg.*, COUNT(ggm.rsvp_id)::int AS member_count
       FROM guest_groups gg
       LEFT JOIN guest_group_members ggm ON ggm.group_id = gg.id
      WHERE gg.event_id = $1
      GROUP BY gg.id
      ORDER BY gg.name`,
    [eventId],
  );
  res.json(groups);
};

// POST /api/events/:eventId/guest-groups
export const createGuestGroup: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) { res.status(400).json({ error: 'Invalid eventId' }); return; }
  const { name, description } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const db = getDatabase();
  const row = await db.get<GuestGroup>(
    `INSERT INTO guest_groups (event_id, name, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [eventId, name.trim(), description ?? null, req.user!.id],
  );
  await logAudit(req.user!.id, 'create_guest_group', { eventId, name });
  res.status(201).json(row);
};

// PUT /api/events/:eventId/guest-groups/:id
export const updateGuestGroup: RequestHandler = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  if (!id || !eventId) { res.status(400).json({ error: 'Invalid id or eventId' }); return; }
  const { name, description } = req.body ?? {};
  if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  const db = getDatabase();
  const row = await db.get<GuestGroup>(
    `UPDATE guest_groups
        SET name = $1, description = $2, updated_at = NOW()
      WHERE id = $3 AND event_id = $4
      RETURNING *`,
    [name.trim(), description ?? null, id, eventId],
  );
  if (!row) { res.status(404).json({ error: 'Guest group not found' }); return; }
  await logAudit(req.user!.id, 'update_guest_group', { id, name });
  res.json(row);
};

// DELETE /api/events/:eventId/guest-groups/:id
export const deleteGuestGroup: RequestHandler = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  if (!id || !eventId) { res.status(400).json({ error: 'Invalid id' }); return; }
  const db = getDatabase();
  await db.run(
    `DELETE FROM guest_groups WHERE id = $1 AND event_id = $2`,
    [id, eventId],
  );
  await logAudit(req.user!.id, 'delete_guest_group', { id });
  res.status(204).send();
};

// POST /api/events/:eventId/guest-groups/:id/members — assign RSVPs to a group
export const addGroupMembers: RequestHandler = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { rsvp_ids } = req.body ?? {};
  if (!Array.isArray(rsvp_ids) || rsvp_ids.length === 0) {
    res.status(400).json({ error: 'rsvp_ids array is required' });
    return;
  }
  const db = getDatabase();
  // Upsert members using individual inserts to preserve idempotency
  let added = 0;
  for (const rsvpId of rsvp_ids) {
    try {
      await db.run(
        `INSERT INTO guest_group_members (group_id, rsvp_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, Number(rsvpId)],
      );
      added++;
    } catch {
      // Skip invalid rsvp_ids
    }
  }
  await logAudit(req.user!.id, 'add_group_members', { group_id: id, added });
  res.json({ added });
};

// DELETE /api/events/:eventId/guest-groups/:id/members — remove RSVPs from group
export const removeGroupMembers: RequestHandler = async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: 'Invalid id' }); return; }
  const { rsvp_ids } = req.body ?? {};
  if (!Array.isArray(rsvp_ids) || rsvp_ids.length === 0) {
    res.status(400).json({ error: 'rsvp_ids array is required' });
    return;
  }
  const db = getDatabase();
  for (const rsvpId of rsvp_ids) {
    await db.run(
      `DELETE FROM guest_group_members WHERE group_id = $1 AND rsvp_id = $2`,
      [id, Number(rsvpId)],
    );
  }
  res.json({ removed: rsvp_ids.length });
};

// POST /api/events/:eventId/guest-groups/csv-import
// Bulk import guests from CSV: columns name,email,phone,dietary_requirements
export const csvImportGuests: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) { res.status(400).json({ error: 'Invalid eventId' }); return; }
  const { csv, column_map } = req.body ?? {};
  if (!csv || typeof csv !== 'string') {
    res.status(400).json({ error: 'csv string is required' });
    return;
  }
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
    return;
  }
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const map: Record<string, string> = column_map ?? {};
  const resolve = (field: string): number => {
    const override = map[field];
    return override ? headers.indexOf(override) : headers.indexOf(field);
  };
  const nameIdx = resolve('name');
  const emailIdx = resolve('email');

  if (nameIdx === -1 || emailIdx === -1) {
    res.status(400).json({ error: 'CSV must include name and email columns (or use column_map)' });
    return;
  }

  const db = getDatabase();
  const results: Array<{ row: number; status: string; error?: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const name = cols[nameIdx];
    const email = cols[emailIdx]?.toLowerCase();
    if (!name || !email || !email.includes('@')) {
      results.push({ row: i, status: 'error', error: 'Missing or invalid name/email' });
      continue;
    }
    try {
      await db.run(
        `INSERT INTO rsvps (event_id, name, email, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'invited', NOW(), NOW())
         ON CONFLICT (event_id, email) DO NOTHING`,
        [eventId, name, email],
      );
      results.push({ row: i, status: 'ok' });
    } catch (err) {
      results.push({ row: i, status: 'error', error: String((err as Error).message) });
    }
  }

  const success = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error');
  await logAudit(req.user!.id, 'csv_import_guests', { eventId, success, errors: errors.length });
  res.json({ success, errors });
};

// POST /api/events/:eventId/guest-groups/bulk-checkin — mark multiple RSVPs as checked in
export const bulkCheckIn: RequestHandler = async (req: AuthRequest, res: Response) => {
  const eventId = Number(req.params.eventId);
  if (!eventId) { res.status(400).json({ error: 'Invalid eventId' }); return; }
  const { rsvp_ids } = req.body ?? {};
  if (!Array.isArray(rsvp_ids) || rsvp_ids.length === 0) {
    res.status(400).json({ error: 'rsvp_ids array is required' });
    return;
  }
  const db = getDatabase();
  let updated = 0;
  for (const rsvpId of rsvp_ids) {
    const result = await db.run(
      `UPDATE rsvps
          SET checked_in = true, checked_in_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND event_id = $2 AND checked_in = false`,
      [Number(rsvpId), eventId],
    );
    if ((result as unknown as { rowCount?: number })?.rowCount) updated++;
  }
  await logAudit(req.user!.id, 'bulk_checkin', { eventId, updated });
  res.json({ updated });
};
