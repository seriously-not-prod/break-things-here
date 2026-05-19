import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';
import { scanFile } from '../utils/virus-scan.js';
import { AUDIT_ACTIONS, logAuditEvent, logMutation } from '../utils/audit-log.js';

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

interface VendorFavoriteRow {
  id: number;
  event_id: number;
  vendor_id: number;
  user_id: number;
  created_at: string;
}

interface VendorBookingRow {
  id: number;
  event_id: number;
  vendor_id: number;
  status: string;
  contract_signed_at: string | null;
  service_start_at: string | null;
  service_end_at: string | null;
  total_amount: number | null;
  currency_code: string | null;
  notes: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

interface VendorPaymentScheduleRow {
  id: number;
  event_id: number;
  vendor_id: number;
  vendor_booking_id: number | null;
  due_date: string;
  amount: number;
  status: string;
  paid_at: string | null;
  note: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

const VALID_BOOKING_STATUSES = [
  'requested',
  'quoted',
  'negotiating',
  'approved',
  'contracted',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
] as const;

const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'overdue', 'cancelled'] as const;

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

  const event = await db.get<{ id: number }>('SELECT id FROM events WHERE id = $1 AND deleted_at IS NULL', [eventId]);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const vendors = await db.all<(VendorRow & { is_favorite: boolean; booking_status: string | null })>(
    `SELECT v.*, 
            CASE WHEN vf.id IS NULL THEN FALSE ELSE TRUE END AS is_favorite,
            vb.status AS booking_status
     FROM vendors v
     LEFT JOIN vendor_favorites vf
       ON vf.event_id = v.event_id AND vf.vendor_id = v.id AND vf.user_id = $1
     LEFT JOIN vendor_bookings vb
       ON vb.event_id = v.event_id AND vb.vendor_id = v.id
     WHERE v.event_id = $2
     ORDER BY v.created_at DESC`,
    [authReq.user.id, eventId],
  );
  return res.json({ vendors });
}

/** GET /api/events/:eventId/vendors/favorites */
export async function listFavoriteVendors(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const favorites = await db.all<(VendorFavoriteRow & { vendor: VendorRow })>(
    `SELECT vf.*, row_to_json(v.*) AS vendor
       FROM vendor_favorites vf
       JOIN vendors v ON v.id = vf.vendor_id
      WHERE vf.event_id = $1 AND vf.user_id = $2
      ORDER BY vf.created_at DESC`,
    [eventId, authReq.user!.id],
  );
  return res.json({ favorites });
}

/** PUT /api/events/:eventId/vendors/:id/favorite */
export async function setVendorFavorite(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { favorite } = req.body as { favorite?: boolean };
  if (typeof favorite !== 'boolean') {
    return res.status(400).json({ error: 'favorite must be a boolean.' });
  }

  const db = getDatabase();
  const vendor = await db.get<{ id: number }>('SELECT id FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  if (favorite) {
    await db.run(
      `INSERT INTO vendor_favorites (event_id, vendor_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, vendor_id, user_id) DO NOTHING`,
      [eventId, id, authReq.user!.id],
    );
  } else {
    await db.run(
      `DELETE FROM vendor_favorites WHERE event_id = $1 AND vendor_id = $2 AND user_id = $3`,
      [eventId, id, authReq.user!.id],
    );
  }

  return res.json({ vendorId: Number(id), favorite });
}

/** GET /api/events/:eventId/vendors/:id/booking */
export async function getVendorBooking(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const booking = await db.get<VendorBookingRow>(
    `SELECT * FROM vendor_bookings WHERE event_id = $1 AND vendor_id = $2`,
    [eventId, id],
  );
  return res.json({ booking: booking ?? null });
}

/** PUT /api/events/:eventId/vendors/:id/booking */
export async function upsertVendorBooking(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { status, contract_signed_at, service_start_at, service_end_at, total_amount, currency_code, notes } = req.body as {
    status?: string;
    contract_signed_at?: string;
    service_start_at?: string;
    service_end_at?: string;
    total_amount?: number | string;
    currency_code?: string;
    notes?: string;
  };

  if (!status || !VALID_BOOKING_STATUSES.includes(status as (typeof VALID_BOOKING_STATUSES)[number])) {
    return res.status(400).json({ error: `status must be one of: ${VALID_BOOKING_STATUSES.join(', ')}.` });
  }

  const parsedAmount = total_amount !== undefined && total_amount !== '' ? Number(total_amount) : null;
  if (parsedAmount !== null && (isNaN(parsedAmount) || parsedAmount < 0)) {
    return res.status(400).json({ error: 'total_amount must be a valid non-negative number.' });
  }

  const db = getDatabase();
  const vendor = await db.get<{ id: number }>('SELECT id FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  await db.run(
    `INSERT INTO vendor_bookings
      (event_id, vendor_id, status, contract_signed_at, service_start_at, service_end_at, total_amount, currency_code, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (event_id, vendor_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       contract_signed_at = EXCLUDED.contract_signed_at,
       service_start_at = EXCLUDED.service_start_at,
       service_end_at = EXCLUDED.service_end_at,
       total_amount = EXCLUDED.total_amount,
       currency_code = EXCLUDED.currency_code,
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_at = CURRENT_TIMESTAMP`,
    [
      eventId,
      id,
      status,
      contract_signed_at || null,
      service_start_at || null,
      service_end_at || null,
      parsedAmount,
      currency_code?.trim() || 'USD',
      notes?.trim() || null,
      authReq.user!.id,
      authReq.user!.id,
    ],
  );

  const booking = await db.get<VendorBookingRow>(
    `SELECT * FROM vendor_bookings WHERE event_id = $1 AND vendor_id = $2`,
    [eventId, id],
  );
  return res.json({ booking });
}

/** GET /api/events/:eventId/vendors/:id/payment-schedules */
export async function listVendorPaymentSchedules(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const schedules = await db.all<VendorPaymentScheduleRow>(
    `SELECT * FROM vendor_payment_schedules
      WHERE event_id = $1 AND vendor_id = $2
      ORDER BY due_date ASC, created_at ASC`,
    [eventId, id],
  );
  return res.json({ schedules });
}

/** POST /api/events/:eventId/vendors/:id/payment-schedules */
export async function createVendorPaymentSchedule(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const { due_date, amount, status, note, vendor_booking_id } = req.body as {
    due_date?: string;
    amount?: number | string;
    status?: string;
    note?: string;
    vendor_booking_id?: number | string;
  };

  if (!due_date?.trim()) {
    return res.status(400).json({ error: 'due_date is required.' });
  }
  const parsedAmount = amount !== undefined && amount !== '' ? Number(amount) : NaN;
  if (isNaN(parsedAmount) || parsedAmount < 0) {
    return res.status(400).json({ error: 'amount must be a valid non-negative number.' });
  }

  const paymentStatus = status ?? 'pending';
  if (!VALID_PAYMENT_STATUSES.includes(paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number])) {
    return res.status(400).json({ error: `status must be one of: ${VALID_PAYMENT_STATUSES.join(', ')}.` });
  }

  const db = getDatabase();
  const vendor = await db.get<{ id: number }>('SELECT id FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found.' });

  const bookingId = vendor_booking_id !== undefined && vendor_booking_id !== '' ? Number(vendor_booking_id) : null;
  if (bookingId !== null) {
    const booking = await db.get<{ id: number }>(
      `SELECT id FROM vendor_bookings WHERE id = $1 AND event_id = $2 AND vendor_id = $3`,
      [bookingId, eventId, id],
    );
    if (!booking) {
      return res.status(400).json({ error: 'vendor_booking_id must reference a booking for this vendor/event.' });
    }
  }

  const result = await db.run(
    `INSERT INTO vendor_payment_schedules
      (event_id, vendor_id, vendor_booking_id, due_date, amount, status, paid_at, note, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      eventId,
      id,
      bookingId,
      due_date,
      parsedAmount,
      paymentStatus,
      paymentStatus === 'paid' ? new Date().toISOString() : null,
      note?.trim() || null,
      authReq.user!.id,
      authReq.user!.id,
    ],
  );

  const schedule = await db.get<VendorPaymentScheduleRow>(
    `SELECT * FROM vendor_payment_schedules WHERE id = $1`,
    [result.lastID],
  );
  return res.status(201).json({ schedule });
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = $1', [result.lastID]);
  if (result.lastID !== undefined) {
    await logMutation(db, authReq, AUDIT_ACTIONS.VENDOR_CREATE, 'vendor', result.lastID, { eventId });
  }
  return res.status(201).json({ vendor });
}

/** PUT /api/events/:eventId/vendors/:id */
export async function updateVendor(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
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
       name = $1, category = $2, email = $3, phone = $4, website = $5,
       status = $6, quoted_amount = $7, notes = $8, rating = $9, updated_at = CURRENT_TIMESTAMP
     WHERE id = $10 AND event_id = $11`,
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

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = $1', [id]);
  await logMutation(db, authReq, AUDIT_ACTIONS.VENDOR_UPDATE, 'vendor', id, { eventId });
  return res.json({ vendor });
}

/** DELETE /api/events/:eventId/vendors/:id */
export async function deleteVendor(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  const { eventId, id } = req.params;
  const ok = await assertEventAccess(authReq, res, eventId);
  if (!ok) return res as Response;

  const db = getDatabase();
  const existing = await db.get<{ id: number; contract_file: string | null }>('SELECT id, contract_file FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!existing) return res.status(404).json({ error: 'Vendor not found.' });

  await db.run('DELETE FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  await logMutation(db, authReq, AUDIT_ACTIONS.VENDOR_DELETE, 'vendor', id, { eventId });

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
  const existing = await db.get<{ id: number; contract_file: string | null }>('SELECT id, contract_file FROM vendors WHERE id = $1 AND event_id = $2', [id, eventId]);
  if (!existing) {
    await cleanupUploadedFile(authReq.file.path);
    return res.status(404).json({ error: 'Vendor not found.' });
  }

  const scanResult = await scanFile(authReq.file.path);
  if (!scanResult.clean) {
    await cleanupUploadedFile(authReq.file.path);
    await logAuditEvent({
      db,
      userId: authReq.user?.id ?? null,
      email: authReq.user?.email ?? null,
      action: AUDIT_ACTIONS.UPLOAD_SCAN_FAIL,
      description: `Malicious vendor contract detected: ${scanResult.threat}`,
      ipAddress: req.ip,
      severity: 'CRITICAL',
      targetType: 'vendor-contract',
      targetId: id,
      context: { threat: scanResult.threat, scanner: scanResult.scanner, eventId },
    });
    return res.status(422).json({ error: 'File failed security scan and was rejected.' });
  }

  await logAuditEvent({
    db,
    userId: authReq.user?.id ?? null,
    email: authReq.user?.email ?? null,
    action: AUDIT_ACTIONS.UPLOAD_SCAN_PASS,
    description: 'Vendor contract passed security scan',
    ipAddress: req.ip,
    severity: 'INFO',
    targetType: 'vendor-contract',
    targetId: id,
    context: { scanner: scanResult.scanner, scannedAt: scanResult.scannedAt, eventId },
  });

  // Remove old contract file if present
  if (existing.contract_file) {
    await cleanupUploadedFile(existing.contract_file).catch(() => undefined);
  }

  await db.run(
    `UPDATE vendors SET contract_file = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [authReq.file.filename, id],
  );

  const vendor = await db.get<VendorRow>('SELECT * FROM vendors WHERE id = $1', [id]);
  return res.json({ vendor });
}
