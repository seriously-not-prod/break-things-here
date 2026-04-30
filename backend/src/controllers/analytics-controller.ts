import { Request, Response } from 'express';
import { getDatabase } from '../db/database.js';

// ============================================================
// GET /api/analytics/overview   — Admin KPI dashboard (#242)
// ============================================================

/**
 * Returns platform-wide KPIs:
 *   - Events by status
 *   - RSVP counts (total + by status)
 *   - Active users in the last 30 days
 *   - Overdue tasks (past due_date, not complete)
 *   - Total budget vs total spend across all events
 */
export async function getOverview(_req: Request, res: Response): Promise<Response> {
  const db = getDatabase();

  // Events by status
  const eventsByStatus = await db.all(
    `SELECT status, COUNT(*) AS count
     FROM events
     WHERE deleted_at IS NULL
     GROUP BY status
     ORDER BY status`,
  );

  // Total event count
  const totalEventsRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM events WHERE deleted_at IS NULL`,
  );
  const totalEvents = Number(totalEventsRow?.count ?? 0);

  // RSVP counts by status
  const rsvpsByStatus = await db.all(
    `SELECT status, COUNT(*) AS count
     FROM rsvps
     GROUP BY status
     ORDER BY status`,
  );

  const totalRsvpsRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM rsvps`,
  );
  const totalRsvps = Number(totalRsvpsRow?.count ?? 0);

  // Active users in the last 30 days (last_login within 30d)
  const activeUsersRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE deleted_at IS NULL
       AND last_login >= CURRENT_TIMESTAMP - INTERVAL '30 days'`,
  );
  const activeUsers30d = Number(activeUsersRow?.count ?? 0);

  // Overdue tasks: due_date < now AND status NOT IN ('Complete','Completed')
  const overdueTasksRow = await db.get<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM tasks
     WHERE due_date IS NOT NULL
       AND due_date < CURRENT_DATE
       AND status NOT IN ('Complete', 'Completed')`,
  );
  const overdueTasks = Number(overdueTasksRow?.count ?? 0);

  // Budget utilisation across all events
  const budgetRow = await db.get<{ total_budget: number; total_spent: number }>(
    `SELECT
       COALESCE(SUM(eb.total_budget), 0) AS total_budget,
       COALESCE(SUM(e.total_spent), 0)   AS total_spent
     FROM event_budgets eb
     LEFT JOIN (
       SELECT event_id, SUM(amount) AS total_spent FROM expenses GROUP BY event_id
     ) e ON e.event_id = eb.event_id`,
  );
  const totalBudget = Number(budgetRow?.total_budget ?? 0);
  const totalSpent = Number(budgetRow?.total_spent ?? 0);

  return res.json({
    overview: {
      total_events: totalEvents,
      events_by_status: eventsByStatus,
      total_rsvps: totalRsvps,
      rsvps_by_status: rsvpsByStatus,
      active_users_30d: activeUsers30d,
      overdue_tasks: overdueTasks,
      budget: {
        total_budget: totalBudget,
        total_spent: totalSpent,
        utilisation_pct: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
      },
    },
  });
}

// ============================================================
// GET /api/events/:id/report   — Per-event report (#243)
// ============================================================

/**
 * Returns a complete per-event report:
 *   - Event metadata
 *   - RSVP breakdown by status + guest count
 *   - Task completion percentage by status
 *   - Budget spend summary + expense list
 */
export async function getEventReport(req: Request, res: Response): Promise<Response> {
  const db = getDatabase();
  const { id } = req.params;

  // Event metadata
  const event = await db.get(
    `SELECT e.id, e.title, e.description, e.location, e.event_date, e.status, e.capacity,
            u.display_name AS creator_name
     FROM events e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.id = ? AND e.deleted_at IS NULL`,
    [id],
  );
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  // RSVP breakdown
  const rsvpBreakdown = await db.all(
    `SELECT status,
            COUNT(*) AS count,
            COALESCE(SUM(guests), 0) AS total_guests
     FROM rsvps
     WHERE event_id = ?
     GROUP BY status
     ORDER BY status`,
    [id],
  );

  const totalRsvpRow = await db.get<{ count: number; total_guests: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(guests), 0) AS total_guests
     FROM rsvps WHERE event_id = ?`,
    [id],
  );

  // Task completion breakdown
  const taskBreakdown = await db.all(
    `SELECT status, COUNT(*) AS count
     FROM tasks
     WHERE event_id = ?
     GROUP BY status
     ORDER BY status`,
    [id],
  );

  const totalTasksRow = await db.get<{ total: number; completed: number }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status IN ('Complete', 'Completed') THEN 1 ELSE 0 END) AS completed
     FROM tasks WHERE event_id = ?`,
    [id],
  );
  const totalTasks = Number(totalTasksRow?.total ?? 0);
  const completedTasks = Number(totalTasksRow?.completed ?? 0);
  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Budget summary
  const budget = await db.get(
    `SELECT total_budget, currency, notes FROM event_budgets WHERE event_id = ?`,
    [id],
  );

  const spendRow = await db.get<{ total_spent: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total_spent FROM expenses WHERE event_id = ?`,
    [id],
  );
  const totalSpent = Number(spendRow?.total_spent ?? 0);
  const totalBudget = Number(budget?.total_budget ?? 0);

  // Expense list grouped by category
  const expensesByCategory = await db.all(
    `SELECT
       COALESCE(ec.name, 'Uncategorised') AS category,
       COUNT(ex.id) AS count,
       SUM(ex.amount) AS amount
     FROM expenses ex
     LEFT JOIN expense_categories ec ON ec.id = ex.category_id
     WHERE ex.event_id = ?
     GROUP BY ec.id, ec.name
     ORDER BY amount DESC`,
    [id],
  );

  return res.json({
    report: {
      event,
      generated_at: new Date().toISOString(),
      rsvps: {
        total: Number(totalRsvpRow?.count ?? 0),
        total_guests: Number(totalRsvpRow?.total_guests ?? 0),
        breakdown: rsvpBreakdown,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        completion_pct: completionPct,
        breakdown: taskBreakdown,
      },
      budget: {
        set: !!budget,
        total_budget: totalBudget,
        currency: budget?.currency ?? 'USD',
        total_spent: totalSpent,
        remaining: totalBudget - totalSpent,
        utilisation_pct: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
        expenses_by_category: expensesByCategory,
      },
    },
  });
}
