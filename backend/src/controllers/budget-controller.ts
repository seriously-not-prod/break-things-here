/**
 * Budget Controller
 * Handles CRUD operations for budget categories and expenses
 * BRD section 3.4 / Issue #374
 */

import { Request, Response } from 'express';
import { getDatabase, type DatabaseAdapter } from '../db/database.js';
import { logActivity } from './activity-feed-controller.js';
import { createBudgetAlert } from './notifications-controller.js';
import { requireEventAccess } from '../utils/event-access.js';
import { convertAmount, isValidCurrencyCode, normalizeCurrencyCode } from '../utils/currency.js';
import { calculateBudgetPlanning, isValidBudgetRate } from '../utils/budget-planning.js';

/**
 * Resolve the FX-converted amount and rate for an expense, given its source
 * currency. When `currency_code` matches the event base, no conversion is
 * needed and `rate` is 1. When the rate is unavailable we still let the
 * expense save — `amount_base` stays null and the forecast surface shows a
 * "rate unavailable" warning rather than silently zeroing the value.
 */
async function resolveExpenseFxAmount(
  db: DatabaseAdapter,
  eventId: string | number,
  amount: number,
  expenseCurrency: string | null,
): Promise<{
  baseCurrency: string;
  baseAmount: number | null;
  rate: number | null;
  currency: string;
}> {
  const evRow = await db.get<{ currency_code: string }>(
    `SELECT COALESCE(currency_code, 'USD') AS currency_code FROM events WHERE id = $1`,
    [eventId],
  );
  const baseCurrency = normalizeCurrencyCode(evRow?.currency_code ?? 'USD');
  const currency = expenseCurrency ? normalizeCurrencyCode(expenseCurrency) : baseCurrency;
  if (currency === baseCurrency) {
    return { baseCurrency, baseAmount: amount, rate: 1, currency };
  }
  const conv = await convertAmount(db, amount, currency, baseCurrency);
  return {
    baseCurrency,
    baseAmount: conv ? conv.amount : null,
    rate: conv ? conv.rate : null,
    currency,
  };
}

interface AuthRequest extends Request {
  user?: { id: number; email: string; role_id: number };
}

interface BudgetCategoryRow {
  id: number;
  event_id: number;
  name: string;
  allocated_amount: number | string;
  color: string | null;
  created_at: string;
  spent: number | string;
  tax_rate: number | string;
  gratuity_rate: number | string;
  contingency_rate: number | string;
  selected_vendor_id?: number | null;
}

interface BudgetSummarySnapshot {
  totalAllocated: number;
  totalPlanned: number;
  totalSpent: number;
  remaining: number;
  plannedRemaining: number;
  percentUsed: number;
  plannedPercentUsed: number;
  categoryCount: number;
}

interface BudgetComparisonEventRow {
  id: number;
  title: string;
  date: string;
  location: string;
  capacity: number | null;
  event_type: string | null;
  tags: string | null;
  created_by: number;
}

interface ComparisonQueryFilters {
  eventType: string;
  location: string;
  minCapacity: number | null;
  maxCapacity: number | null;
}

interface SimilarBudgetEvent {
  id: number;
  title: string;
  date: string;
  location: string;
  capacity: number | null;
  eventType: string | null;
  matchScore: number;
  matchReasons: string[];
  summary: BudgetSummarySnapshot;
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function enrichBudgetCategory(
  category: BudgetCategoryRow,
): BudgetCategoryRow & ReturnType<typeof calculateBudgetPlanning> {
  const allocatedAmount = toNumber(category.allocated_amount);
  const taxRate = toNumber(category.tax_rate);
  const gratuityRate = toNumber(category.gratuity_rate);
  const contingencyRate = toNumber(category.contingency_rate);

  return {
    ...category,
    allocated_amount: allocatedAmount,
    spent: toNumber(category.spent),
    tax_rate: taxRate,
    gratuity_rate: gratuityRate,
    contingency_rate: contingencyRate,
    ...calculateBudgetPlanning(allocatedAmount, {
      taxRate,
      gratuityRate,
      contingencyRate,
    }),
  };
}

function roundBudgetValue(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildBudgetSummary(categories: BudgetCategoryRow[]): BudgetSummarySnapshot {
  const enrichedCategories = categories.map(enrichBudgetCategory);
  const totalAllocated = roundBudgetValue(
    enrichedCategories.reduce((sum, category) => sum + toNumber(category.allocated_amount), 0),
  );
  const totalPlanned = roundBudgetValue(
    enrichedCategories.reduce((sum, category) => sum + category.plannedTotal, 0),
  );
  const totalSpent = roundBudgetValue(
    enrichedCategories.reduce((sum, category) => sum + toNumber(category.spent), 0),
  );
  const remaining = roundBudgetValue(totalAllocated - totalSpent);
  const plannedRemaining = roundBudgetValue(totalPlanned - totalSpent);
  const percentUsed =
    totalAllocated > 0 ? Math.min(100, Math.round((totalSpent / totalAllocated) * 100)) : 0;
  const plannedPercentUsed =
    totalPlanned > 0 ? Math.min(100, Math.round((totalSpent / totalPlanned) * 100)) : 0;

  return {
    totalAllocated,
    totalPlanned,
    totalSpent,
    remaining,
    plannedRemaining,
    percentUsed,
    plannedPercentUsed,
    categoryCount: enrichedCategories.length,
  };
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function parseTags(tags: string | null | undefined): string[] {
  return (tags ?? '')
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

function getDayDifference(left: string, right: string): number | null {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return null;
  }
  return Math.abs(leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24);
}

function scoreSimilarBudgetEvent(
  currentEvent: BudgetComparisonEventRow,
  candidate: BudgetComparisonEventRow,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const currentEventType = normalizeText(currentEvent.event_type);
  const candidateEventType = normalizeText(candidate.event_type);
  if (currentEventType && currentEventType === candidateEventType) {
    score += 3;
    reasons.push('Same event type');
  }

  const currentLocation = normalizeText(currentEvent.location);
  const candidateLocation = normalizeText(candidate.location);
  if (currentLocation && currentLocation === candidateLocation) {
    score += 2;
    reasons.push('Same location');
  }

  if (currentEvent.capacity && candidate.capacity) {
    const allowedVariance = Math.max(currentEvent.capacity * 0.25, 25);
    if (Math.abs(currentEvent.capacity - candidate.capacity) <= allowedVariance) {
      score += 1;
      reasons.push('Similar capacity');
    }
  }

  const currentTags = parseTags(currentEvent.tags);
  const candidateTags = new Set(parseTags(candidate.tags));
  const sharedTags = currentTags.filter((tag) => candidateTags.has(tag)).slice(0, 3);
  if (sharedTags.length > 0) {
    score += 2;
    reasons.push(`Shared tags: ${sharedTags.join(', ')}`);
  }

  const dayDifference = getDayDifference(currentEvent.date, candidate.date);
  if (dayDifference !== null && dayDifference <= 120) {
    score += 1;
    reasons.push('Scheduled within 120 days');
  }

  if (score < 3) {
    return { score: 0, reasons: [] };
  }

  return { score, reasons };
}

async function loadBudgetCategoriesForEvents(
  db: DatabaseAdapter,
  eventIds: number[],
): Promise<Map<number, BudgetCategoryRow[]>> {
  if (eventIds.length === 0) {
    return new Map<number, BudgetCategoryRow[]>();
  }

  const placeholders = eventIds.map(() => '?').join(', ');
  const categories = await db.all<BudgetCategoryRow>(
    `SELECT bc.id,
            bc.event_id,
            bc.name,
            bc.allocated_amount,
            bc.color,
            bc.created_at,
            COALESCE(bc.tax_rate, 0)::numeric AS tax_rate,
            COALESCE(bc.gratuity_rate, 0)::numeric AS gratuity_rate,
            COALESCE(bc.contingency_rate, 0)::numeric AS contingency_rate,
            COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
      WHERE bc.event_id IN (${placeholders})
      GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
               bc.tax_rate, bc.gratuity_rate, bc.contingency_rate
      ORDER BY bc.event_id ASC, bc.name ASC`,
    eventIds,
  );

  const categoriesByEvent = new Map<number, BudgetCategoryRow[]>();
  for (const category of categories) {
    const existing = categoriesByEvent.get(category.event_id) ?? [];
    existing.push(category);
    categoriesByEvent.set(category.event_id, existing);
  }

  return categoriesByEvent;
}

// ─── Internal helper ─────────────────────────────────────────────────────────

/**
 * After any expense write, check if the category has hit the 90% budget threshold.
 * If so, fire a notification to the event owner. Errors are swallowed so they
 * never disrupt the primary request.
 */
async function checkAndFireBudgetAlert(
  db: ReturnType<typeof getDatabase>,
  categoryId: number,
  eventId: number,
): Promise<void> {
  try {
    const row = await db.get<{
      name: string;
      allocated: string;
      spent: string;
      owner_id: number;
    }>(
      `SELECT bc.name,
              bc.allocated_amount::numeric              AS allocated,
              COALESCE(SUM(ex.amount), 0)::numeric      AS spent,
              ev.created_by                             AS owner_id
       FROM budget_categories bc
       JOIN events ev ON ev.id = bc.event_id
       LEFT JOIN expenses ex ON ex.category_id = bc.id
       WHERE bc.id = $1 AND bc.event_id = $2
       GROUP BY bc.id, bc.name, bc.allocated_amount, ev.created_by`,
      [categoryId, eventId],
    );

    if (!row) return;

    const allocated = Number(row.allocated);
    if (allocated <= 0) return;

    const pct = Math.round((Number(row.spent) / allocated) * 100);
    if (pct >= 90) {
      await createBudgetAlert(eventId, row.owner_id, row.name, pct);
    }
  } catch (err) {
    console.error('checkAndFireBudgetAlert failed:', err);
  }
}

// ─── Budget Categories ────────────────────────────────────────────────────────

/**
 * GET /events/:eventId/budget/categories
 * Returns all budget categories for an event with aggregated spent amount.
 */
export async function listCategories(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const categories = await db.all<BudgetCategoryRow>(
      `SELECT bc.id,
              bc.event_id,
              bc.name,
              bc.allocated_amount,
              bc.color,
              bc.created_at,
              COALESCE(bc.tax_rate, 0)::numeric AS tax_rate,
              COALESCE(bc.gratuity_rate, 0)::numeric AS gratuity_rate,
              COALESCE(bc.contingency_rate, 0)::numeric AS contingency_rate,
              bc.selected_vendor_id,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
       WHERE bc.event_id = $1
       GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
                bc.tax_rate, bc.gratuity_rate, bc.contingency_rate, bc.selected_vendor_id
       ORDER BY bc.name ASC`,
      [eventId],
    );

    res.json({
      categories: categories.map(enrichBudgetCategory),
    });
  } catch (error) {
    console.error('Error listing budget categories:', error);
    res.status(500).json({ error: 'Failed to fetch budget categories' });
  }
}

export async function compareSimilarEvents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    const currentEvent = await db.get<BudgetComparisonEventRow>(
      `SELECT id, title, date, location, capacity, event_type, tags, created_by
         FROM events
        WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    if (!currentEvent) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const comparisonFilters: ComparisonQueryFilters = {
      eventType: normalizeText(currentEvent.event_type),
      location: normalizeText(currentEvent.location),
      minCapacity:
        currentEvent.capacity !== null
          ? Math.max(1, Math.floor(currentEvent.capacity * 0.5))
          : null,
      maxCapacity: currentEvent.capacity !== null ? Math.ceil(currentEvent.capacity * 1.5) : null,
    };

    const hasAdminPrefilter = Boolean(
      comparisonFilters.eventType ||
      comparisonFilters.location ||
      (comparisonFilters.minCapacity !== null && comparisonFilters.maxCapacity !== null),
    );
    const adminFilterSql = hasAdminPrefilter
      ? `AND ((? <> '' AND lower(COALESCE(event_type, '')) = ?)
             OR (? <> '' AND lower(location) = ?)
             OR (?::integer IS NOT NULL AND ?::integer IS NOT NULL AND capacity BETWEEN ? AND ?))`
      : '';

    const candidateEvents =
      req.user.role_id >= 3
        ? await db.all<BudgetComparisonEventRow>(
            `SELECT id, title, date, location, capacity, event_type, tags, created_by
             FROM events
            WHERE id <> $1
              AND deleted_at IS NULL
              ${adminFilterSql}
            ORDER BY date DESC, id DESC
            LIMIT 250`,
            hasAdminPrefilter
              ? [
                  eventId,
                  comparisonFilters.eventType,
                  comparisonFilters.eventType,
                  comparisonFilters.location,
                  comparisonFilters.location,
                  comparisonFilters.minCapacity,
                  comparisonFilters.maxCapacity,
                  comparisonFilters.minCapacity,
                  comparisonFilters.maxCapacity,
                ]
              : [eventId],
          )
        : await db.all<BudgetComparisonEventRow>(
            `SELECT DISTINCT e.id, e.title, e.date, e.location, e.capacity, e.event_type, e.tags, e.created_by
             FROM events e
             LEFT JOIN event_members em
               ON em.event_id = e.id
              AND em.user_id = $1
            WHERE e.id <> $2
              AND e.deleted_at IS NULL
              AND (e.created_by = $3 OR em.user_id IS NOT NULL)`,
            [req.user.id, eventId, req.user.id],
          );

    const scoredCandidates = candidateEvents
      .map((candidate) => ({
        candidate,
        ...scoreSimilarBudgetEvent(currentEvent, candidate),
      }))
      .filter((entry) => entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.candidate.date.localeCompare(right.candidate.date),
      )
      .slice(0, 5);

    const eventIdsToLoad = [
      currentEvent.id,
      ...scoredCandidates.map((entry) => entry.candidate.id),
    ];
    const categoriesByEvent = await loadBudgetCategoriesForEvents(db, eventIdsToLoad);
    const currentSummary = buildBudgetSummary(categoriesByEvent.get(currentEvent.id) ?? []);

    const similarEvents: SimilarBudgetEvent[] = scoredCandidates
      .map(({ candidate, score, reasons }) => {
        const summary = buildBudgetSummary(categoriesByEvent.get(candidate.id) ?? []);
        if (summary.categoryCount === 0) {
          return null;
        }

        return {
          id: candidate.id,
          title: candidate.title,
          date: candidate.date,
          location: candidate.location,
          capacity: candidate.capacity,
          eventType: candidate.event_type,
          matchScore: score,
          matchReasons: reasons,
          summary,
        };
      })
      .filter((entry): entry is SimilarBudgetEvent => entry !== null);

    const comparisonCount = similarEvents.length;
    const averageAllocated =
      comparisonCount > 0
        ? roundBudgetValue(
            similarEvents.reduce((sum, item) => sum + item.summary.totalAllocated, 0) /
              comparisonCount,
          )
        : 0;
    const averagePlanned =
      comparisonCount > 0
        ? roundBudgetValue(
            similarEvents.reduce((sum, item) => sum + item.summary.totalPlanned, 0) /
              comparisonCount,
          )
        : 0;
    const averageSpent =
      comparisonCount > 0
        ? roundBudgetValue(
            similarEvents.reduce((sum, item) => sum + item.summary.totalSpent, 0) / comparisonCount,
          )
        : 0;
    const averagePlannedPercentUsed =
      comparisonCount > 0
        ? Math.round(
            similarEvents.reduce((sum, item) => sum + item.summary.plannedPercentUsed, 0) /
              comparisonCount,
          )
        : 0;

    res.json({
      currentEvent: {
        id: currentEvent.id,
        title: currentEvent.title,
        date: currentEvent.date,
        location: currentEvent.location,
        capacity: currentEvent.capacity,
        eventType: currentEvent.event_type,
        summary: currentSummary,
      },
      comparison: similarEvents,
      overview: {
        averageAllocated,
        averagePlanned,
        averageSpent,
        averagePlannedPercentUsed,
      },
    });
  } catch (error) {
    console.error('Error comparing similar budget events:', error);
    res.status(500).json({ error: 'Failed to compare budget data across similar events' });
  }
}

/**
 * POST /events/:eventId/budget/categories
 * Body: { name, allocated_amount, color }
 */
export async function createCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate } =
      req.body as {
        name?: unknown;
        allocated_amount?: unknown;
        color?: unknown;
        tax_rate?: unknown;
        gratuity_rate?: unknown;
        contingency_rate?: unknown;
      };

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const parsedAmount = Number(allocated_amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'allocated_amount must be a non-negative number' });
      return;
    }
    const safeColor = typeof color === 'string' ? color.trim() : null;
    const parsedTaxRate = tax_rate === undefined ? 0 : Number(tax_rate);
    const parsedGratuityRate = gratuity_rate === undefined ? 0 : Number(gratuity_rate);
    const parsedContingencyRate = contingency_rate === undefined ? 0 : Number(contingency_rate);

    if (!isValidBudgetRate(parsedTaxRate)) {
      res.status(400).json({ error: 'tax_rate must be between 0 and 100' });
      return;
    }
    if (!isValidBudgetRate(parsedGratuityRate)) {
      res.status(400).json({ error: 'gratuity_rate must be between 0 and 100' });
      return;
    }
    if (!isValidBudgetRate(parsedContingencyRate)) {
      res.status(400).json({ error: 'contingency_rate must be between 0 and 100' });
      return;
    }

    const result = await db.run(
      `INSERT INTO budget_categories (event_id, name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        eventId,
        name.trim(),
        parsedAmount,
        safeColor,
        parsedTaxRate,
        parsedGratuityRate,
        parsedContingencyRate,
      ],
    );

    const category = await db.get<BudgetCategoryRow>(
      `SELECT bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
              COALESCE(bc.tax_rate, 0)::numeric AS tax_rate,
              COALESCE(bc.gratuity_rate, 0)::numeric AS gratuity_rate,
              COALESCE(bc.contingency_rate, 0)::numeric AS contingency_rate,
              0 AS spent
       FROM budget_categories bc WHERE bc.id = $1`,
      [result.lastID],
    );

    if (!category) {
      res.status(500).json({ error: 'Failed to load created budget category' });
      return;
    }

    res.status(201).json({
      category: enrichBudgetCategory(category),
    });
  } catch (error) {
    console.error('Error creating budget category:', error);
    res.status(500).json({ error: 'Failed to create budget category' });
  }
}

/**
 * PUT /events/:eventId/budget/categories/:id
 * Body: { name, allocated_amount, color }
 */
export async function updateCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { name, allocated_amount, color, tax_rate, gratuity_rate, contingency_rate } =
      req.body as {
        name?: unknown;
        allocated_amount?: unknown;
        color?: unknown;
        tax_rate?: unknown;
        gratuity_rate?: unknown;
        contingency_rate?: unknown;
      };

    const existing = await db.get<
      Pick<BudgetCategoryRow, 'id' | 'tax_rate' | 'gratuity_rate' | 'contingency_rate'>
    >(
      `SELECT id,
              COALESCE(tax_rate, 0)::numeric AS tax_rate,
              COALESCE(gratuity_rate, 0)::numeric AS gratuity_rate,
              COALESCE(contingency_rate, 0)::numeric AS contingency_rate
         FROM budget_categories
        WHERE id = $1 AND event_id = $2`,
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Budget category not found' });
      return;
    }

    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const parsedAmount = Number(allocated_amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'allocated_amount must be a non-negative number' });
      return;
    }
    const safeColor = typeof color === 'string' ? color.trim() : null;
    const parsedTaxRate = tax_rate === undefined ? toNumber(existing.tax_rate) : Number(tax_rate);
    const parsedGratuityRate =
      gratuity_rate === undefined ? toNumber(existing.gratuity_rate) : Number(gratuity_rate);
    const parsedContingencyRate =
      contingency_rate === undefined
        ? toNumber(existing.contingency_rate)
        : Number(contingency_rate);

    if (!isValidBudgetRate(parsedTaxRate)) {
      res.status(400).json({ error: 'tax_rate must be between 0 and 100' });
      return;
    }
    if (!isValidBudgetRate(parsedGratuityRate)) {
      res.status(400).json({ error: 'gratuity_rate must be between 0 and 100' });
      return;
    }
    if (!isValidBudgetRate(parsedContingencyRate)) {
      res.status(400).json({ error: 'contingency_rate must be between 0 and 100' });
      return;
    }

    await db.run(
      `UPDATE budget_categories
          SET name = $1,
              allocated_amount = $2,
              color = $3,
              tax_rate = $4,
              gratuity_rate = $5,
              contingency_rate = $6
        WHERE id = $7`,
      [
        name.trim(),
        parsedAmount,
        safeColor,
        parsedTaxRate,
        parsedGratuityRate,
        parsedContingencyRate,
        id,
      ],
    );

    const category = await db.get<BudgetCategoryRow>(
      `SELECT bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
              COALESCE(bc.tax_rate, 0)::numeric AS tax_rate,
              COALESCE(bc.gratuity_rate, 0)::numeric AS gratuity_rate,
              COALESCE(bc.contingency_rate, 0)::numeric AS contingency_rate,
              bc.selected_vendor_id,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
       WHERE bc.id = $1
       GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
                bc.tax_rate, bc.gratuity_rate, bc.contingency_rate, bc.selected_vendor_id`,
      [id],
    );

    if (!category) {
      res.status(500).json({ error: 'Failed to load updated budget category' });
      return;
    }

    res.json({
      category: enrichBudgetCategory(category),
    });
  } catch (error) {
    console.error('Error updating budget category:', error);
    res.status(500).json({ error: 'Failed to update budget category' });
  }
}

/**
 * DELETE /events/:eventId/budget/categories/:id
 */
export async function deleteCategory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const existing = await db.get(
      'SELECT id FROM budget_categories WHERE id = $1 AND event_id = $2',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Budget category not found' });
      return;
    }

    await db.run('DELETE FROM expenses WHERE category_id = $1', [id]);
    await db.run('DELETE FROM budget_categories WHERE id = $1', [id]);

    res.status(204).end();
  } catch (error) {
    console.error('Error deleting budget category:', error);
    res.status(500).json({ error: 'Failed to delete budget category' });
  }
}

/**
 * GET /events/:eventId/budget/overspend-threshold — #802
 * Returns the per-event overspend alert threshold (percent of allocated).
 */
export async function getOverspendThreshold(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const row = await db.get<{ overspend_threshold_percent: number | string | null }>(
      `SELECT overspend_threshold_percent FROM events WHERE id = $1`,
      [eventId],
    );
    const value = row?.overspend_threshold_percent;
    const percent = value === null || value === undefined ? 80 : Number(value);
    res.json({ threshold_percent: Number.isFinite(percent) ? percent : 80 });
  } catch (error) {
    console.error('Error reading overspend threshold:', error);
    res.status(500).json({ error: 'Failed to read overspend threshold' });
  }
}

/**
 * PATCH /events/:eventId/budget/overspend-threshold — #802
 * Updates the per-event overspend alert threshold (percent of allocated).
 */
export async function setOverspendThreshold(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;
    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { threshold_percent } = req.body as { threshold_percent?: number | string };
    const parsed = Number(threshold_percent);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 200) {
      res.status(400).json({ error: 'threshold_percent must be > 0 and <= 200' });
      return;
    }

    await db.run(`UPDATE events SET overspend_threshold_percent = $1 WHERE id = $2`, [
      parsed,
      eventId,
    ]);

    res.json({ threshold_percent: parsed });
  } catch (error) {
    console.error('Error updating overspend threshold:', error);
    res.status(500).json({ error: 'Failed to update overspend threshold' });
  }
}

/**
 * PATCH /events/:eventId/budget/categories/:id/selected-vendor — #797
 * Stamps (or clears) the vendor "picked" via the compare dialog onto a budget category.
 */
export async function setSelectedVendor(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const { vendor_id } = req.body as { vendor_id?: number | null };
    const parsed = vendor_id === null || vendor_id === undefined ? null : Number(vendor_id);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) {
      res.status(400).json({ error: 'vendor_id must be a positive integer or null' });
      return;
    }

    const existing = await db.get<{ id: number }>(
      'SELECT id FROM budget_categories WHERE id = $1 AND event_id = $2',
      [id, eventId],
    );
    if (!existing) {
      res.status(404).json({ error: 'Budget category not found' });
      return;
    }

    if (parsed !== null) {
      const vendorOk = await db.get<{ id: number }>(
        'SELECT id FROM vendors WHERE id = $1 AND event_id = $2',
        [parsed, eventId],
      );
      if (!vendorOk) {
        res.status(400).json({ error: 'Vendor does not belong to this event' });
        return;
      }
    }

    await db.run('UPDATE budget_categories SET selected_vendor_id = $1 WHERE id = $2', [
      parsed,
      id,
    ]);

    const category = await db.get<BudgetCategoryRow>(
      `SELECT bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
              COALESCE(bc.tax_rate, 0)::numeric AS tax_rate,
              COALESCE(bc.gratuity_rate, 0)::numeric AS gratuity_rate,
              COALESCE(bc.contingency_rate, 0)::numeric AS contingency_rate,
              bc.selected_vendor_id,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM budget_categories bc
       LEFT JOIN expenses e ON e.category_id = bc.id
       WHERE bc.id = $1
       GROUP BY bc.id, bc.event_id, bc.name, bc.allocated_amount, bc.color, bc.created_at,
                bc.tax_rate, bc.gratuity_rate, bc.contingency_rate, bc.selected_vendor_id`,
      [id],
    );

    if (!category) {
      res.status(500).json({ error: 'Failed to load updated budget category' });
      return;
    }

    res.json({ category: enrichBudgetCategory(category) });
  } catch (error) {
    console.error('Error updating selected vendor:', error);
    res.status(500).json({ error: 'Failed to update selected vendor' });
  }
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

/**
 * GET /events/:eventId/expenses
 * Returns all expenses for an event with category name joined.
 */
export async function listExpenses(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    const isApprover = req.user.role_id >= 3 || req.user.id === event.created_by;
    const expenses = await db.all<ExpenseWorkflowRow>(
      `SELECT e.*,
              bc.name AS category_name,
              COALESCE(e.approval_status, 'pending') AS approval_status,
              COALESCE(e.reimbursement_status, 'not_requested') AS reimbursement_status
       FROM expenses e
       LEFT JOIN budget_categories bc ON bc.id = e.category_id
       WHERE e.event_id = $1
       ORDER BY e.created_at DESC`,
      [eventId],
    );

    const workflowSummary = await db.get<ExpenseWorkflowSummaryRow>(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'pending')::int AS approval_pending,
              COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'approved')::int AS approval_approved,
              COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'rejected')::int AS approval_rejected,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'not_requested')::int AS reimbursement_not_requested,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'requested')::int AS reimbursement_requested,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'reimbursed')::int AS reimbursement_reimbursed,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'rejected')::int AS reimbursement_rejected,
              COALESCE(SUM(amount) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'requested'), 0)::float AS reimbursement_requested_amount
         FROM expenses
        WHERE event_id = $1`,
      [eventId],
    );

    res.json({
      expenses: expenses.map((expense) =>
        toExpenseResponse(expense, isApprover, req.user?.id ?? null),
      ),
      workflowSummary: {
        approval: {
          pending: workflowSummary?.approval_pending ?? 0,
          approved: workflowSummary?.approval_approved ?? 0,
          rejected: workflowSummary?.approval_rejected ?? 0,
        },
        reimbursement: {
          notRequested: workflowSummary?.reimbursement_not_requested ?? 0,
          requested: workflowSummary?.reimbursement_requested ?? 0,
          reimbursed: workflowSummary?.reimbursement_reimbursed ?? 0,
          rejected: workflowSummary?.reimbursement_rejected ?? 0,
        },
        reimbursementRequestedAmount: roundBudgetValue(
          workflowSummary?.reimbursement_requested_amount ?? 0,
        ),
      },
    });
  } catch (error) {
    console.error('Error listing expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
}

const VALID_PAYMENT_STATUSES = ['pending', 'paid', 'overdue'] as const;
type PaymentStatus = (typeof VALID_PAYMENT_STATUSES)[number];
const VALID_APPROVAL_DECISIONS = ['approved', 'rejected'] as const;
type ApprovalDecision = (typeof VALID_APPROVAL_DECISIONS)[number];
const VALID_REIMBURSEMENT_DECISIONS = ['reimbursed', 'rejected'] as const;
type ReimbursementDecision = (typeof VALID_REIMBURSEMENT_DECISIONS)[number];

interface ExpenseWorkflowRow {
  id: number;
  event_id: number;
  category_id: number | null;
  category_name: string | null;
  title: string;
  amount: number | string;
  payment_status: string;
  vendor_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: number | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  approval_note: string | null;
  approved_by: number | null;
  approved_at: string | null;
  reimbursement_status: 'not_requested' | 'requested' | 'reimbursed' | 'rejected';
  reimbursement_requested_by: number | null;
  reimbursement_requested_at: string | null;
  reimbursed_by: number | null;
  reimbursed_at: string | null;
}

interface ExpenseWorkflowSummaryRow {
  approval_pending: number;
  approval_approved: number;
  approval_rejected: number;
  reimbursement_not_requested: number;
  reimbursement_requested: number;
  reimbursement_reimbursed: number;
  reimbursement_rejected: number;
  reimbursement_requested_amount: number;
}

interface ExpenseOcrRow {
  id: number;
  event_id: number;
  expense_id: number;
  receipt_text: string;
  extracted_title: string | null;
  extracted_amount: number | string | null;
  extracted_vendor_name: string | null;
  extracted_date: string | null;
  confidence: number | string;
  status: 'extracted' | 'applied' | 'failed';
  error_code: string | null;
  error_message: string | null;
  created_by: number;
  applied_by: number | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OcrExtractionResult {
  title: string | null;
  amount: number | null;
  vendorName: string | null;
  receiptDate: string | null;
  confidence: number;
}

function findHighestAmount(text: string): number | null {
  const amountMatches = text.match(/\b\d{1,6}(?:\.\d{2})\b/g);
  if (!amountMatches || amountMatches.length === 0) {
    return null;
  }
  const values = amountMatches
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function extractReceiptData(receiptText: string): OcrExtractionResult {
  const normalized = receiptText.replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const vendorLine =
    lines.find((line) => /[a-z]/i.test(line) && !/receipt|invoice|total/i.test(line)) ??
    lines[0] ??
    null;

  const title = vendorLine ? `Receipt - ${vendorLine}` : null;
  const dateMatch = normalized.match(/\b(20\d{2}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
  const totalMatch = normalized.match(
    /(?:grand\s+total|amount\s+due|total)\D{0,20}(\d{1,6}(?:\.\d{2})?)/i,
  );
  const extractedAmount =
    totalMatch && totalMatch[1] ? Number(totalMatch[1]) : findHighestAmount(normalized);

  let score = 0;
  if (vendorLine) score += 0.3;
  if (dateMatch?.[1]) score += 0.2;
  if (Number.isFinite(extractedAmount ?? NaN)) score += 0.5;

  return {
    title,
    amount: Number.isFinite(extractedAmount ?? NaN) ? Number(extractedAmount) : null,
    vendorName: vendorLine,
    receiptDate: dateMatch?.[1] ?? null,
    confidence: roundBudgetValue(Math.min(1, score)),
  };
}

function isExpenseApprover(user: AuthRequest['user'], event: { created_by: number }): boolean {
  if (!user) return false;
  return user.role_id >= 3 || user.id === event.created_by;
}

function toExpenseResponse(
  expense: ExpenseWorkflowRow,
  isApprover: boolean,
  currentUserId: number | null,
): ExpenseWorkflowRow & {
  can_approve: boolean;
  can_request_reimbursement: boolean;
  can_resolve_reimbursement: boolean;
} {
  return {
    ...expense,
    amount: roundBudgetValue(toNumber(expense.amount)),
    can_approve: isApprover && expense.approval_status === 'pending',
    can_request_reimbursement:
      expense.approval_status === 'approved' &&
      (expense.reimbursement_status === 'not_requested' ||
        expense.reimbursement_status === 'rejected') &&
      currentUserId !== null,
    can_resolve_reimbursement: isApprover && expense.reimbursement_status === 'requested',
  };
}

async function getExpenseForEvent(
  db: DatabaseAdapter,
  eventId: string,
  expenseId: string,
): Promise<ExpenseWorkflowRow | null> {
  const row = await db.get<ExpenseWorkflowRow>(
    `SELECT e.*,
            bc.name AS category_name,
            COALESCE(e.approval_status, 'pending') AS approval_status,
            COALESCE(e.reimbursement_status, 'not_requested') AS reimbursement_status
       FROM expenses e
       LEFT JOIN budget_categories bc ON bc.id = e.category_id
      WHERE e.id = $1 AND e.event_id = $2`,
    [expenseId, eventId],
  );
  return row ?? null;
}

async function logExpenseWorkflowEvent(
  db: DatabaseAdapter,
  eventId: string,
  expenseId: string,
  action: string,
  actorUserId: number,
  fromState: string,
  toState: string,
  note: string | null,
): Promise<void> {
  await db.run(
    `INSERT INTO expense_workflow_events
       (event_id, expense_id, action, actor_user_id, from_state, to_state, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [eventId, expenseId, action, actorUserId, fromState, toState, note],
  );
}

/**
 * POST /events/:eventId/expenses
 * Body: { title, amount, category_id, payment_status, vendor_name, notes }
 */
export async function createExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    const { title, amount, category_id, payment_status, vendor_name, notes, currency_code } =
      req.body as {
        title?: unknown;
        amount?: unknown;
        category_id?: unknown;
        payment_status?: unknown;
        vendor_name?: unknown;
        notes?: unknown;
        currency_code?: unknown;
      };

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'amount must be a non-negative number' });
      return;
    }
    const parsedCategoryId = Number(category_id);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      res.status(400).json({ error: 'category_id must be a valid integer' });
      return;
    }
    if (
      currency_code !== undefined &&
      currency_code !== null &&
      !isValidCurrencyCode(currency_code)
    ) {
      res.status(400).json({ error: 'currency_code must be a valid ISO 4217 code.' });
      return;
    }

    const status: PaymentStatus = VALID_PAYMENT_STATUSES.includes(payment_status as PaymentStatus)
      ? (payment_status as PaymentStatus)
      : 'pending';
    const approver = isExpenseApprover(req.user, event);
    const approvalStatus = approver ? 'approved' : 'pending';
    const approvedBy = approver ? req.user.id : null;
    const approvedAt = approver ? new Date().toISOString() : null;

    const safeVendor = typeof vendor_name === 'string' ? vendor_name.trim() : null;
    const safeNotes = typeof notes === 'string' ? notes.trim() : null;
    const fx = await resolveExpenseFxAmount(
      db,
      eventId,
      parsedAmount,
      typeof currency_code === 'string' ? currency_code : null,
    );

    const result = await db.run(
      `INSERT INTO expenses (event_id, category_id, title, amount, payment_status, vendor_name, notes,
                              currency_code, amount_base, exchange_rate, created_by, updated_by,
                              approval_status, approved_by, approved_at, reimbursement_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [
        eventId,
        parsedCategoryId,
        title.trim(),
        parsedAmount,
        status,
        safeVendor,
        safeNotes,
        fx.currency,
        fx.baseAmount,
        fx.rate,
        req.user.id,
        req.user.id,
        approvalStatus,
        approvedBy,
        approvedAt,
        'not_requested',
      ],
    );

    const expense = await getExpenseForEvent(db, String(eventId), String(result.lastID));
    if (!expense) {
      res.status(500).json({ error: 'Failed to load created expense.' });
      return;
    }

    await logExpenseWorkflowEvent(
      db,
      String(eventId),
      String(expense.id),
      'expense_created',
      req.user.id,
      'draft',
      approvalStatus,
      null,
    );

    // Fire budget alert if category reaches >= 90% utilisation
    await checkAndFireBudgetAlert(db, parsedCategoryId, Number(eventId));

    await logActivity(
      eventId,
      req.user?.id ?? null,
      'expense_added',
      `Expense added: ${title.trim()} — $${parsedAmount.toFixed(2)}`,
      `/events/${eventId}`,
    );

    res.status(201).json({ expense: toExpenseResponse(expense, approver, req.user.id) });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
}

/**
 * PUT /events/:eventId/expenses/:id
 */
export async function updateExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;
    const approver = isExpenseApprover(req.user, event);

    const { title, amount, category_id, payment_status, vendor_name, notes, currency_code } =
      req.body as {
        title?: unknown;
        amount?: unknown;
        category_id?: unknown;
        payment_status?: unknown;
        vendor_name?: unknown;
        notes?: unknown;
        currency_code?: unknown;
      };

    const existing = await getExpenseForEvent(db, String(eventId), String(id));
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    if (!approver && existing.approval_status !== 'pending') {
      res
        .status(403)
        .json({ error: 'Approved or rejected expenses can only be edited by approvers.' });
      return;
    }

    if (typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      res.status(400).json({ error: 'amount must be a non-negative number' });
      return;
    }
    const parsedCategoryId = Number(category_id);
    if (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      res.status(400).json({ error: 'category_id must be a valid integer' });
      return;
    }
    if (
      currency_code !== undefined &&
      currency_code !== null &&
      !isValidCurrencyCode(currency_code)
    ) {
      res.status(400).json({ error: 'currency_code must be a valid ISO 4217 code.' });
      return;
    }

    const status: PaymentStatus = VALID_PAYMENT_STATUSES.includes(payment_status as PaymentStatus)
      ? (payment_status as PaymentStatus)
      : 'pending';

    const safeVendor = typeof vendor_name === 'string' ? vendor_name.trim() : null;
    const safeNotes = typeof notes === 'string' ? notes.trim() : null;
    const fx = await resolveExpenseFxAmount(
      db,
      eventId,
      parsedAmount,
      typeof currency_code === 'string' ? currency_code : null,
    );

    await db.run(
      `UPDATE expenses SET title = $1, amount = $2, category_id = $3, payment_status = $4,
              vendor_name = $5, notes = $6, currency_code = $7, amount_base = $8, exchange_rate = $9, updated_by = $10
        WHERE id = $11`,
      [
        title.trim(),
        parsedAmount,
        parsedCategoryId,
        status,
        safeVendor,
        safeNotes,
        fx.currency,
        fx.baseAmount,
        fx.rate,
        req.user.id,
        id,
      ],
    );

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(500).json({ error: 'Failed to load updated expense.' });
      return;
    }

    // Fire budget alert if category reaches >= 90% utilisation
    await checkAndFireBudgetAlert(db, parsedCategoryId, Number(eventId));

    res.json({ expense: toExpenseResponse(expense, approver, req.user.id) });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
}

/**
 * PATCH /events/:eventId/expenses/:id/approval
 * Body: { decision: 'approved' | 'rejected', note?: string }
 */
export async function reviewExpenseApproval(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    if (!isExpenseApprover(req.user, event)) {
      res.status(403).json({ error: 'Only event owner or admins can approve expenses.' });
      return;
    }

    const { decision, note } = req.body as { decision?: unknown; note?: unknown };
    if (
      typeof decision !== 'string' ||
      !VALID_APPROVAL_DECISIONS.includes(decision as ApprovalDecision)
    ) {
      res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
      return;
    }

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    const safeNote = typeof note === 'string' ? note.trim() : null;
    const reviewedAt = new Date().toISOString();
    const nextReimbursementStatus =
      decision === 'rejected' && expense.reimbursement_status === 'requested'
        ? 'rejected'
        : expense.reimbursement_status;

    await db.run(
      `UPDATE expenses
          SET approval_status = $1,
              approval_note = $2,
              approved_by = $3,
              approved_at = $4,
              reimbursement_status = $5,
              updated_by = $6
        WHERE id = $7 AND event_id = $8`,
      [
        decision,
        safeNote,
        req.user.id,
        reviewedAt,
        nextReimbursementStatus,
        req.user.id,
        id,
        eventId,
      ],
    );

    await logExpenseWorkflowEvent(
      db,
      String(eventId),
      String(id),
      'approval_reviewed',
      req.user.id,
      expense.approval_status,
      decision,
      safeNote,
    );

    const updated = await getExpenseForEvent(db, String(eventId), String(id));
    if (!updated) {
      res.status(500).json({ error: 'Failed to load updated expense.' });
      return;
    }

    res.json({ expense: toExpenseResponse(updated, true, req.user.id) });
  } catch (error) {
    console.error('Error reviewing expense approval:', error);
    res.status(500).json({ error: 'Failed to review expense approval.' });
  }
}

/**
 * POST /events/:eventId/expenses/:id/reimbursement-request
 */
export async function requestExpenseReimbursement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    if (expense.approval_status !== 'approved') {
      res
        .status(409)
        .json({ error: 'Expense must be approved before reimbursement can be requested.' });
      return;
    }
    if (
      expense.reimbursement_status === 'requested' ||
      expense.reimbursement_status === 'reimbursed'
    ) {
      res
        .status(409)
        .json({ error: 'Reimbursement is already in progress or completed for this expense.' });
      return;
    }

    const requestedAt = new Date().toISOString();
    await db.run(
      `UPDATE expenses
          SET reimbursement_status = 'requested',
              reimbursement_requested_by = $1,
              reimbursement_requested_at = $2,
              updated_by = $3
        WHERE id = $4 AND event_id = $5`,
      [req.user.id, requestedAt, req.user.id, id, eventId],
    );

    await logExpenseWorkflowEvent(
      db,
      String(eventId),
      String(id),
      'reimbursement_requested',
      req.user.id,
      expense.reimbursement_status,
      'requested',
      null,
    );

    const updated = await getExpenseForEvent(db, String(eventId), String(id));
    if (!updated) {
      res.status(500).json({ error: 'Failed to load updated expense.' });
      return;
    }

    const approver = isExpenseApprover(req.user, event);
    res.json({ expense: toExpenseResponse(updated, approver, req.user.id) });
  } catch (error) {
    console.error('Error requesting reimbursement:', error);
    res.status(500).json({ error: 'Failed to request reimbursement.' });
  }
}

/**
 * PATCH /events/:eventId/expenses/:id/reimbursement
 * Body: { decision: 'reimbursed' | 'rejected', note?: string }
 */
export async function resolveExpenseReimbursement(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;
    if (!isExpenseApprover(req.user, event)) {
      res.status(403).json({ error: 'Only event owner or admins can resolve reimbursements.' });
      return;
    }

    const { decision, note } = req.body as { decision?: unknown; note?: unknown };
    if (
      typeof decision !== 'string' ||
      !VALID_REIMBURSEMENT_DECISIONS.includes(decision as ReimbursementDecision)
    ) {
      res.status(400).json({ error: 'decision must be "reimbursed" or "rejected".' });
      return;
    }

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    if (expense.approval_status !== 'approved') {
      res.status(409).json({ error: 'Only approved expenses can be reimbursed.' });
      return;
    }
    if (expense.reimbursement_status !== 'requested') {
      res.status(409).json({ error: 'Expense is not awaiting reimbursement review.' });
      return;
    }

    const safeNote = typeof note === 'string' ? note.trim() : null;
    const resolvedAt = new Date().toISOString();
    const nextPaymentStatus = decision === 'reimbursed' ? 'paid' : expense.payment_status;
    const reimbursedBy = decision === 'reimbursed' ? req.user.id : null;
    const reimbursedAt = decision === 'reimbursed' ? resolvedAt : null;

    await db.run(
      `UPDATE expenses
          SET reimbursement_status = $1,
              reimbursed_by = $2,
              reimbursed_at = $3,
              payment_status = $4,
              approval_note = COALESCE($5, approval_note),
              updated_by = $6
        WHERE id = $7 AND event_id = $8`,
      [decision, reimbursedBy, reimbursedAt, nextPaymentStatus, safeNote, req.user.id, id, eventId],
    );

    await logExpenseWorkflowEvent(
      db,
      String(eventId),
      String(id),
      'reimbursement_resolved',
      req.user.id,
      expense.reimbursement_status,
      decision,
      safeNote,
    );

    const updated = await getExpenseForEvent(db, String(eventId), String(id));
    if (!updated) {
      res.status(500).json({ error: 'Failed to load updated expense.' });
      return;
    }

    res.json({ expense: toExpenseResponse(updated, true, req.user.id) });
  } catch (error) {
    console.error('Error resolving reimbursement:', error);
    res.status(500).json({ error: 'Failed to resolve reimbursement.' });
  }
}

/**
 * GET /events/:eventId/expenses/workflow-summary
 */
export async function getExpenseWorkflowSummary(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event) return;

    const row = await db.get<ExpenseWorkflowSummaryRow>(
      `SELECT COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'pending')::int AS approval_pending,
              COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'approved')::int AS approval_approved,
              COUNT(*) FILTER (WHERE COALESCE(approval_status, 'pending') = 'rejected')::int AS approval_rejected,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'not_requested')::int AS reimbursement_not_requested,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'requested')::int AS reimbursement_requested,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'reimbursed')::int AS reimbursement_reimbursed,
              COUNT(*) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'rejected')::int AS reimbursement_rejected,
              COALESCE(SUM(amount) FILTER (WHERE COALESCE(reimbursement_status, 'not_requested') = 'requested'), 0)::float AS reimbursement_requested_amount
         FROM expenses
        WHERE event_id = $1`,
      [eventId],
    );

    res.json({
      summary: {
        approval: {
          pending: row?.approval_pending ?? 0,
          approved: row?.approval_approved ?? 0,
          rejected: row?.approval_rejected ?? 0,
        },
        reimbursement: {
          notRequested: row?.reimbursement_not_requested ?? 0,
          requested: row?.reimbursement_requested ?? 0,
          reimbursed: row?.reimbursement_reimbursed ?? 0,
          rejected: row?.reimbursement_rejected ?? 0,
        },
        reimbursementRequestedAmount: roundBudgetValue(row?.reimbursement_requested_amount ?? 0),
      },
    });
  } catch (error) {
    console.error('Error loading expense workflow summary:', error);
    res.status(500).json({ error: 'Failed to fetch expense workflow summary.' });
  }
}

/**
 * POST /events/:eventId/expenses/:id/ocr/extract
 * Body: { receipt_text: string }
 */
export async function extractExpenseReceiptOcr(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(404).json({ code: 'EXPENSE_NOT_FOUND', error: 'Expense not found.' });
      return;
    }

    const { receipt_text } = req.body as { receipt_text?: unknown };
    if (typeof receipt_text !== 'string' || receipt_text.trim().length < 5) {
      res.status(400).json({
        code: 'INVALID_RECEIPT_TEXT',
        error: 'receipt_text is required and must be at least 5 characters long.',
      });
      return;
    }

    const extracted = extractReceiptData(receipt_text);
    if (!extracted.title && !extracted.amount && !extracted.vendorName) {
      const failed = await db.run(
        `INSERT INTO expense_receipt_ocr
          (event_id, expense_id, receipt_text, confidence, status, error_code, error_message, created_by)
         VALUES ($1, $2, $3, $4, 'failed', 'EXTRACTION_FAILED', 'Unable to identify receipt fields.', $5) RETURNING id`,
        [eventId, id, receipt_text.trim(), 0, req.user.id],
      );
      res.status(422).json({
        code: 'EXTRACTION_FAILED',
        error: 'Unable to identify receipt fields.',
        ocr: {
          id: failed.lastID,
          status: 'failed',
        },
      });
      return;
    }

    const result = await db.run(
      `INSERT INTO expense_receipt_ocr
        (event_id, expense_id, receipt_text, extracted_title, extracted_amount, extracted_vendor_name,
         extracted_date, confidence, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'extracted', $9) RETURNING id`,
      [
        eventId,
        id,
        receipt_text.trim(),
        extracted.title,
        extracted.amount,
        extracted.vendorName,
        extracted.receiptDate,
        extracted.confidence,
        req.user.id,
      ],
    );

    const ocr = await db.get<ExpenseOcrRow>(
      `SELECT * FROM expense_receipt_ocr WHERE id = $1 AND event_id = $2`,
      [result.lastID, eventId],
    );

    await logActivity(
      eventId,
      req.user.id,
      'expense_ocr_extracted',
      `OCR extraction completed for expense ${expense.title}`,
      `/events/${eventId}`,
    );

    res.status(201).json({
      ocr,
      extracted: {
        title: extracted.title,
        amount: extracted.amount,
        vendor_name: extracted.vendorName,
        receipt_date: extracted.receiptDate,
        confidence: extracted.confidence,
      },
      can_apply: isExpenseApprover(req.user, event),
    });
  } catch (error) {
    console.error('Error extracting OCR receipt data:', error);
    res
      .status(500)
      .json({ code: 'OCR_EXTRACTION_ERROR', error: 'Failed to extract OCR receipt data.' });
  }
}

/**
 * POST /events/:eventId/expenses/:id/ocr/:ocrId/apply
 * Body: { title?, amount?, vendor_name?, notes?, override_reason? }
 */
export async function applyExpenseReceiptOcr(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id, ocrId } = req.params;
    const event = await requireEventAccess(req, res, eventId, { allowMembers: true });
    if (!event || !req.user) return;
    if (!isExpenseApprover(req.user, event)) {
      res
        .status(403)
        .json({ code: 'FORBIDDEN', error: 'Only event owner or admins can apply OCR mappings.' });
      return;
    }

    const expense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!expense) {
      res.status(404).json({ code: 'EXPENSE_NOT_FOUND', error: 'Expense not found.' });
      return;
    }

    const ocr = await db.get<ExpenseOcrRow>(
      `SELECT *
         FROM expense_receipt_ocr
        WHERE id = $1 AND event_id = $2 AND expense_id = $3`,
      [ocrId, eventId, id],
    );
    if (!ocr) {
      res
        .status(404)
        .json({ code: 'OCR_RESULT_NOT_FOUND', error: 'OCR result not found for this expense.' });
      return;
    }
    if (ocr.status === 'failed') {
      res
        .status(409)
        .json({ code: 'OCR_RESULT_INVALID', error: 'Failed OCR results cannot be applied.' });
      return;
    }

    const payload = req.body as {
      title?: unknown;
      amount?: unknown;
      vendor_name?: unknown;
      notes?: unknown;
      override_reason?: unknown;
    };

    const nextTitle =
      typeof payload.title === 'string'
        ? payload.title.trim()
        : (ocr.extracted_title ?? expense.title);
    const nextVendor =
      typeof payload.vendor_name === 'string'
        ? payload.vendor_name.trim()
        : (ocr.extracted_vendor_name ?? expense.vendor_name ?? '');
    const nextNotes =
      typeof payload.notes === 'string' ? payload.notes.trim() : (expense.notes ?? '');
    const amountCandidate =
      payload.amount !== undefined
        ? Number(payload.amount)
        : toNumber(ocr.extracted_amount ?? expense.amount);

    if (!nextTitle) {
      res
        .status(400)
        .json({ code: 'INVALID_TITLE', error: 'title cannot be empty after OCR mapping.' });
      return;
    }
    if (!Number.isFinite(amountCandidate) || amountCandidate < 0) {
      res
        .status(400)
        .json({ code: 'INVALID_AMOUNT', error: 'amount must be a non-negative number.' });
      return;
    }

    const extractedSnapshot = {
      title: ocr.extracted_title,
      amount: ocr.extracted_amount === null ? null : toNumber(ocr.extracted_amount),
      vendor_name: ocr.extracted_vendor_name,
    };
    const appliedSnapshot = {
      title: nextTitle,
      amount: amountCandidate,
      vendor_name: nextVendor || null,
      notes: nextNotes || null,
    };

    const overrides: string[] = [];
    if ((extractedSnapshot.title ?? null) !== appliedSnapshot.title) overrides.push('title');
    if ((extractedSnapshot.amount ?? null) !== appliedSnapshot.amount) overrides.push('amount');
    if ((extractedSnapshot.vendor_name ?? null) !== (appliedSnapshot.vendor_name ?? null))
      overrides.push('vendor_name');

    await db.run(
      `UPDATE expenses
          SET title = $1,
              amount = $2,
              vendor_name = $3,
              notes = $4,
              updated_by = $5
        WHERE id = $6 AND event_id = $7`,
      [
        nextTitle,
        amountCandidate,
        appliedSnapshot.vendor_name,
        appliedSnapshot.notes,
        req.user.id,
        id,
        eventId,
      ],
    );

    await db.run(
      `UPDATE expense_receipt_ocr
          SET status = 'applied',
              applied_by = $1,
              applied_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND event_id = $3`,
      [req.user.id, ocrId, eventId],
    );

    const safeOverrideReason =
      typeof payload.override_reason === 'string' ? payload.override_reason.trim() : null;
    await db.run(
      `INSERT INTO expense_reconciliation_logs
        (event_id, expense_id, ocr_id, before_data, extracted_data, applied_data, overrides_count, override_reason, created_by, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10)`,
      [
        eventId,
        id,
        ocrId,
        JSON.stringify({
          title: expense.title,
          amount: toNumber(expense.amount),
          vendor_name: expense.vendor_name,
          notes: expense.notes,
        }),
        JSON.stringify(extractedSnapshot),
        JSON.stringify(appliedSnapshot),
        overrides.length,
        safeOverrideReason,
        req.user.id,
        req.user.id,
      ],
    );

    await logExpenseWorkflowEvent(
      db,
      String(eventId),
      String(id),
      'ocr_applied',
      req.user.id,
      'extracted',
      'applied',
      safeOverrideReason,
    );

    await logActivity(
      eventId,
      req.user.id,
      'expense_ocr_applied',
      `OCR mapping applied for expense ${expense.title}`,
      `/events/${eventId}`,
    );

    const updatedExpense = await getExpenseForEvent(db, String(eventId), String(id));
    if (!updatedExpense) {
      res
        .status(500)
        .json({
          code: 'EXPENSE_LOAD_FAILED',
          error: 'Failed to load updated expense after OCR apply.',
        });
      return;
    }

    res.json({
      expense: toExpenseResponse(updatedExpense, true, req.user.id),
      reconciliation: {
        ocr_id: Number(ocrId),
        overrides,
        overrides_count: overrides.length,
      },
    });
  } catch (error) {
    console.error('Error applying OCR receipt mapping:', error);
    res.status(500).json({ code: 'OCR_APPLY_ERROR', error: 'Failed to apply OCR mapping.' });
  }
}

/**
 * DELETE /events/:eventId/expenses/:id
 */
export async function deleteExpense(req: AuthRequest, res: Response): Promise<void> {
  try {
    const db = getDatabase();
    const { eventId, id } = req.params;

    const event = await requireEventAccess(req, res, eventId, { ownerOnly: true });
    if (!event) return;

    const existing = await db.get('SELECT id FROM expenses WHERE id = $1 AND event_id = $2', [
      id,
      eventId,
    ]);
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    await db.run('DELETE FROM expenses WHERE id = $1', [id]);
    res.status(204).end();
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
}

/**
 * GET /api/events/:eventId/budget/expenses/export
 * Exports all expenses for an event as CSV (#668).
 */
export async function exportExpensesAsCsv(req: AuthRequest, res: Response): Promise<void> {
  const { eventId } = req.params;
  const db = getDatabase();

  const expenses = await db.all(
    `SELECT e.id, e.title, e.amount, e.currency, e.status, e.submitted_by,
            c.name AS category, e.created_at, e.updated_at
     FROM budget_expenses e
     LEFT JOIN budget_categories c ON c.id = e.category_id
     WHERE e.event_id = $1 AND e.deleted_at IS NULL
     ORDER BY e.created_at DESC`,
    [eventId],
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-event-${eventId}.csv"`);

  const headers = [
    'id',
    'title',
    'amount',
    'currency',
    'category',
    'status',
    'submitted_by',
    'created_at',
  ];
  res.write(headers.join(',') + '\n');

  for (const row of expenses as Record<string, unknown>[]) {
    const line = headers
      .map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const s = String(val).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      })
      .join(',');
    res.write(line + '\n');
  }

  res.end();
}

/**
 * GET /api/events/:eventId/budget/fx-status
 * Returns staleness warning if exchange rates are older than 24 hours (#668).
 */
export async function getFxStatus(req: AuthRequest, res: Response): Promise<Response> {
  const db = getDatabase();
  const rate = await db.get<{ updated_at: string }>(
    `SELECT MAX(updated_at) AS updated_at FROM exchange_rates`,
  );

  const lastUpdated = rate?.updated_at ? new Date(rate.updated_at) : null;
  const staleThresholdMs = 24 * 60 * 60 * 1000;
  const isStale = !lastUpdated || Date.now() - lastUpdated.getTime() > staleThresholdMs;

  return res.json({
    lastUpdated: lastUpdated?.toISOString() ?? null,
    isStale,
    message: isStale
      ? 'Exchange rates are stale (older than 24 hours). Displayed amounts may be inaccurate.'
      : 'Exchange rates are current.',
  });
}
