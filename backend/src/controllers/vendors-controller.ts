import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
  file?: Express.Multer.File;
}

interface VendorRow {
  id: number;
  event_id: number;
  name: string;
  category: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  quoted_amount: number | null;
  contract_file: string | null;
  notes: string | null;
  rating: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

const VENDOR_CONTRACTS_DIR = path.resolve('uploads/vendor-contracts');
const VENDOR_CONTRACTS_DIR_PREFIX = VENDOR_CONTRACTS_DIR + path.sep;

function assertSafePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (resolved !== VENDOR_CONTRACTS_DIR && !resolved.startsWith(VENDOR_CONTRACTS_DIR_PREFIX)) {
    throw new Error('Path traversal attempt blocked');
  }
  return resolved;
}

async function cleanupUploadedFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  const fileName = path.basename(filePath);
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    console.error('Skipped cleanup for invalid uploaded filename');
    return;
  }
  try {
    await fs.unlink(assertSafePath(path.join(VENDOR_CONTRACTS_DIR, fileName)));
  } catch (error) {
    console.error('Failed to cleanup uploaded contract file:', error);
  }
}

async function assertEventAccess(req: AuthRequest, res: Response, eventId: string): Promise<boolean> {
  const event = await requireEventAccess(req, res, eventId, {
    allowMembers: true,
    forbiddenMessage: 'Not authorised to manage vendors for this event.',
  });
  return Boolean(event);
}

/** GET /api/events/:eventId/vendors */
export async function listVendors(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const db = getDatabase();

  const event = await db.get<{ id: number }>('SELECT id FROM events WHERE id = ? AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const vendors = await db.all<VendorRow>(
    `SELECT * FROM vendors WHERE event_id = ? ORDER BY created_at DESC`,
    [eventId],
  );
  return res.json({ vendors });
}

/** POST /api/events/:eventId/vendors */
export async function createVendor(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { name, category, email, phone, website, status, quoted_amount, notes, rating } = req.body as {
    name?: string;
    category?: string;
    email?: string;
    phone?: string;
    website?: string;
    status?: string;
    quoted_amount?: number | string;
    notes?: string;
    rating?: number | string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Vendor name is required.' });
  if (!category?.trim()) return res.status(400).json({ error: 'Vendor category is required.' });

  const validStatuses = ['Contacted', 'Quote Received', 'Booked', 'Confirmed', 'Cancelled'];
  const vendorStatus = status ?? 'Contacted';
  if (!validStatuses.includes(vendorStatus)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}.` });
  }

  const parsedRating = rating !== undefined && rating !== '' ? Number(rating) : null;
  if (parsedRating !== null && (parsedRating < 1 || parsedRating > 5 || !Number.isInteger(parsedRating))) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
  }

  const parsedAmount = quoted_amount !== undefined && quoted_amount !== '' ? Number(quoted_amount) : null;
  if (parsedAmount !== null && isNaN(parsedAmount)) {
    return res.status(400).json({ error: 'Quoted amount must be a valid number.' });
  }

  const db = getDatabase();
  const result = await db.run(
    `INSERT INTO vendors (event_id, name, category, email, phone, website, status, quoted_amount, notes, rating, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      eventId,
      name.trim(),
      category.trim(),
      email?.trim() || null,
      phone?.trim() || null,
      website?.trim() || null,
      vendorStatus,
      parsedAmount,
      notes?.trim() || null,
      parsedRating,
      authReq.user!.id,
    ],
  );

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = ?', [result.lastID]);
  return res.status(201).json({ vendor });
}

/** PUT /api/events/:eventId/vendors/:id */
export async function updateVendor(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Vendor not found.' });

  const { name, category, email, phone, website, status, quoted_amount, notes, rating } = req.body as {
    name?: string;
    category?: string;
    email?: string;
    phone?: string;
    website?: string;
    status?: string;
    quoted_amount?: number | string;
    notes?: string;
    rating?: number | string;
  };

  const validStatuses = ['Contacted', 'Quote Received', 'Booked', 'Confirmed', 'Cancelled'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}.` });
  }

  const parsedRating = rating !== undefined && rating !== '' ? Number(rating) : existing.rating;
  if (parsedRating !== null && parsedRating !== undefined && (parsedRating < 1 || parsedRating > 5 || !Number.isInteger(parsedRating))) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
  }

  const parsedAmount = quoted_amount !== undefined && quoted_amount !== '' ? Number(quoted_amount) : existing.quoted_amount;

  await db.run(
    `UPDATE vendors SET
       name = ?, category = ?, email = ?, phone = ?, website = ?,
       status = ?, quoted_amount = ?, notes = ?, rating = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND event_id = ?`,
    [
      name?.trim() ?? existing.name,
      category?.trim() ?? existing.category,
      email !== undefined ? (email.trim() || null) : existing.email,
      phone !== undefined ? (phone.trim() || null) : existing.phone,
      website !== undefined ? (website.trim() || null) : existing.website,
      status ?? existing.status,
      parsedAmount,
      notes !== undefined ? (notes.trim() || null) : existing.notes,
      parsedRating ?? null,
      id,
      eventId,
    ],
  );

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = ?', [id]);
  return res.json({ vendor });
}

/** DELETE /api/events/:eventId/vendors/:id */
export async function deleteVendor(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; contract_file: string | null }>('SELECT id, contract_file FROM vendors WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Vendor not found.' });

  await db.run('DELETE FROM vendors WHERE id = ? AND event_id = ?', [id, eventId]);

  if (existing.contract_file) {
    await cleanupUploadedFile(existing.contract_file).catch(() => undefined);
  }

  return res.status(204).send('');
}

/** POST /api/events/:eventId/vendors/:id/contract */
export async function uploadContract(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) {
    await cleanupUploadedFile(authReq.file?.path);
    return res as Response;
  }

  if (!authReq.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const db = getDatabase();
  const existing = await db.get<{ id: number; contract_file: string | null }>('SELECT id, contract_file FROM vendors WHERE id = ? AND event_id = ?', [id, eventId]);
  if (!existing) {
    await cleanupUploadedFile(authReq.file.path);
    return res.status(404).json({ error: 'Vendor not found.' });
  }

  // Remove old contract file if present
  if (existing.contract_file) {
    await cleanupUploadedFile(existing.contract_file).catch(() => undefined);
  }

  await db.run(
    `UPDATE vendors SET contract_file = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [authReq.file.filename, id],
  );

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = ?', [id]);
  return res.json({ vendor });
}
