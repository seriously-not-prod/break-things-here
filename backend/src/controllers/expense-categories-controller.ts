import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

/** GET /api/expense-categories */
export async function listCategories(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const rows = await db.all('SELECT * FROM expense_categories ORDER BY name ASC', []);
  return res.json({ categories: rows });
}

/** POST /api/expense-categories */
export async function createCategory(req: Request, res: Response): Promise<Response> {
  const { name, description, color } = req.body as {
    name?: string;
    description?: string;
    color?: string;
  };

  if (!name?.trim()) return res.status(400).json({ error: 'Category name is required.' });

  const db = getDatabase();
  const existing = await db.get('SELECT id FROM expense_categories WHERE name = ?', [name.trim()]);
  if (existing) return res.status(409).json({ error: 'Category name already exists.' });

  const result = await db.run(
    `INSERT INTO expense_categories (name, description, color)
     VALUES (?, ?, ?)
     RETURNING id`,
    [name.trim(), description?.trim() || null, color?.trim() || '#6366f1'],
  );
  const category = await db.get('SELECT * FROM expense_categories WHERE id = ?', [result.lastID]);
  return res.status(201).json({ category });
}

/** PATCH /api/expense-categories/:id */
export async function updateCategory(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const category = await db.get('SELECT * FROM expense_categories WHERE id = ?', [id]);
  if (!category) return res.status(404).json({ error: 'Category not found.' });

  const { name, description, color } = req.body as Record<string, string>;
  const fields: string[] = [];
  const params: (string | null)[] = [];

  if (name !== undefined) {
    const trimmedName = name.trim();
    const duplicate = await db.get('SELECT id FROM expense_categories WHERE name = ? AND id != ?', [trimmedName, id]);
    if (duplicate) return res.status(409).json({ error: 'Category name already exists.' });
    fields.push('name = ?'); params.push(trimmedName);
  }
  if (description !== undefined) { fields.push('description = ?'); params.push(description.trim() || null); }
  if (color !== undefined) { fields.push('color = ?'); params.push(color.trim() || null); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  await db.run(`UPDATE expense_categories SET ${fields.join(', ')} WHERE id = ?`, params);
  const updated = await db.get('SELECT * FROM expense_categories WHERE id = ?', [id]);
  return res.json({ category: updated });
}

/** DELETE /api/expense-categories/:id */
export async function deleteCategory(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  const category = await db.get('SELECT id FROM expense_categories WHERE id = ?', [id]);
  if (!category) return res.status(404).json({ error: 'Category not found.' });

  await db.run('DELETE FROM expense_categories WHERE id = ?', [id]);
  return res.json({ message: 'Category deleted.' });
}
