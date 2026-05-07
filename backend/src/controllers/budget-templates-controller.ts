/**
 * Budget Templates Controller (#438)
 * Handles CRUD for reusable budget templates and applying them to events.
 */

import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { requireEventAccess } from '../utils/event-access.js';

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface BudgetTemplate {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string;
}

interface BudgetTemplateItem {
  id: number;
  template_id: number;
  name: string;
  allocated_amount: number;
  color: string;
  created_at: string;
}

// ─── List Templates ────────────────────────────────────────────────────────────

/** GET /api/budget-templates */
export async function listTemplates(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const db = getDatabase();
  const templates = await db.all<BudgetTemplate>(
    `SELECT bt.*, COUNT(bti.id)::int AS item_count
     FROM budget_templates bt
     LEFT JOIN budget_template_items bti ON bti.template_id = bt.id
     GROUP BY bt.id
     ORDER BY bt.created_at DESC`,
  );
  return res.json({ templates });
}

// ─── Get Single Template ───────────────────────────────────────────────────────

/** GET /api/budget-templates/:id */
export async function getTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { id } = req.params;
  const db = getDatabase();

  const template = await db.get<BudgetTemplate>(
    `SELECT * FROM budget_templates WHERE id = ?`,
    [id],
  );
  if (!template) return res.status(404).json({ error: 'Budget template not found.' });

  const items = await db.all<BudgetTemplateItem>(
    `SELECT * FROM budget_template_items WHERE template_id = ? ORDER BY id ASC`,
    [id],
  );
  return res.json({ template, items });
}

// ─── Create Template ──────────────────────────────────────────────────────────

/** POST /api/budget-templates */
export async function createTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { name, description, items } = req.body as {
    name?: string;
    description?: string;
    items?: Array<{ name: string; allocated_amount: number; color?: string }>;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Template name is required.' });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one template item is required.' });
  }
  for (const item of items) {
    if (!item.name?.trim()) return res.status(400).json({ error: 'Each item must have a name.' });
    if (item.allocated_amount < 0) {
      return res.status(400).json({ error: 'Allocated amounts must be non-negative.' });
    }
  }

  const db = getDatabase();

  const result = await db.run(
    `INSERT INTO budget_templates (name, description, created_by) VALUES (?, ?, ?) RETURNING id`,
    [name.trim(), description?.trim() ?? null, authReq.user.id],
  );
  const templateId = result.lastID!;

  for (const item of items) {
    await db.run(
      `INSERT INTO budget_template_items (template_id, name, allocated_amount, color)
       VALUES (?, ?, ?, ?)`,
      [templateId, item.name.trim(), item.allocated_amount, item.color ?? '#6366f1'],
    );
  }

  const template = await db.get<BudgetTemplate>(
    `SELECT * FROM budget_templates WHERE id = ?`,
    [templateId],
  );
  const savedItems = await db.all<BudgetTemplateItem>(
    `SELECT * FROM budget_template_items WHERE template_id = ? ORDER BY id ASC`,
    [templateId],
  );

  return res.status(201).json({ template, items: savedItems });
}

// ─── Delete Template ──────────────────────────────────────────────────────────

/** DELETE /api/budget-templates/:id */
export async function deleteTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { id } = req.params;
  const db = getDatabase();

  const template = await db.get<{ id: number; created_by: number | null }>(
    `SELECT id, created_by FROM budget_templates WHERE id = ?`,
    [id],
  );
  if (!template) return res.status(404).json({ error: 'Budget template not found.' });

  // Restrict deletion to the creator or admin (role_id <= 2)
  const isCreator = template.created_by === authReq.user.id;
  const isAdmin = authReq.user.role_id <= 2;
  if (!isCreator && !isAdmin) {
    return res.status(403).json({ error: 'Not authorised to delete this budget template.' });
  }

  await db.run(`DELETE FROM budget_templates WHERE id = ?`, [id]);
  return res.json({ message: 'Budget template deleted.' });
}

// ─── Apply Template to Event ──────────────────────────────────────────────────

/**
 * POST /api/events/:eventId/budget/apply-template
 * Creates budget categories from a template for the given event.
 * Returns the newly created categories.
 */
export async function applyTemplate(req: Request, res: Response): Promise<Response> {
  const authReq = req as AuthRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Authentication required.' });

  const { eventId } = req.params;
  const { template_id } = req.body as { template_id?: number };

  if (!template_id) return res.status(400).json({ error: 'template_id is required.' });

  const event = await requireEventAccess(authReq, res, eventId, { allowMembers: false });
  if (!event) return res as Response;

  const db = getDatabase();

  const template = await db.get<{ id: number }>(
    `SELECT id FROM budget_templates WHERE id = ?`,
    [template_id],
  );
  if (!template) return res.status(404).json({ error: 'Budget template not found.' });

  const templateItems = await db.all<BudgetTemplateItem>(
    `SELECT * FROM budget_template_items WHERE template_id = ? ORDER BY id ASC`,
    [template_id],
  );
  if (templateItems.length === 0) {
    return res.status(400).json({ error: 'Template has no items to apply.' });
  }

  const created = [];
  for (const item of templateItems) {
    const result = await db.run(
      `INSERT INTO budget_categories (event_id, name, allocated_amount, color)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [eventId, item.name, item.allocated_amount, item.color ?? '#6366f1'],
    );
    const category = await db.get(
      `SELECT *, 0 AS spent FROM budget_categories WHERE id = ?`,
      [result.lastID],
    );
    if (category) created.push(category);
  }

  return res.status(201).json({ categories: created });
}
