/**
 * Task reminder + escalation background job (#793).
 *
 * Two responsibilities:
 *   1. **Reminders** — sends a notification at configurable offsets before a
 *      task's due date (env: TASK_REMINDER_OFFSETS_HOURS, defaults "24,2").
 *   2. **Escalation** — when a task has been overdue for >24 h, escalates to
 *      the event organizer (or the user specified in task_escalation_rules).
 *
 * Both paths respect the user's notification preferences via the dispatch
 * guard and use the batched-notification helper for in-app messages plus
 * the mailer for email.
 *
 * De-duplication: a `task_reminder_log` table tracks (task_id, kind, offset)
 * so the same reminder/escalation is never sent twice.
 */
import { getDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';
import { sendMail } from '../utils/mailer.js';
import {
  isChannelEnabled,
  type NotificationCategory,
} from '../services/notifications/dispatch-guard.js';
import { createBatchedNotification } from '../controllers/notifications-controller.js';

// ── Configuration ────────────────────────────────────────────────────────────

/** Comma-separated hours before due date at which to send reminders. */
function getReminderOffsets(): number[] {
  const raw = process.env.TASK_REMINDER_OFFSETS_HOURS ?? '24,2';
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

/** Hours a task must be overdue before escalation fires. */
function getEscalationThresholdHours(): number {
  const raw = process.env.TASK_ESCALATION_THRESHOLD_HOURS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 24;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskRow {
  id: number;
  title: string;
  event_id: number;
  due_date: string;
  assigned_user_id: number | null;
  status: string;
}

interface AssigneeRow {
  user_id: number;
  email: string;
}

interface EscalationRule {
  escalate_to_user_id: number | null;
  threshold_hours: number;
}

// ── De-duplication helpers ───────────────────────────────────────────────────

async function ensureReminderLogTable(): Promise<void> {
  const db = getDatabase();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_reminder_log (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL,
      kind       TEXT    NOT NULL CHECK (kind IN ('reminder', 'escalation')),
      offset_h   INTEGER NOT NULL DEFAULT 0,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, kind, offset_h)
    )
  `);
}

async function alreadySent(taskId: number, kind: string, offsetH: number): Promise<boolean> {
  const db = getDatabase();
  const row = await db.get<{ id: number }>(
    `SELECT id FROM task_reminder_log WHERE task_id = $1 AND kind = $2 AND offset_h = $3`,
    [taskId, kind, offsetH],
  );
  return row !== undefined;
}

async function markSent(taskId: number, kind: string, offsetH: number): Promise<void> {
  const db = getDatabase();
  await db.run(
    `INSERT INTO task_reminder_log (task_id, kind, offset_h)
     VALUES ($1, $2, $3)
     ON CONFLICT (task_id, kind, offset_h) DO NOTHING`,
    [taskId, kind, offsetH],
  );
}

// ── Notification dispatch ────────────────────────────────────────────────────

async function notifyUser(
  userId: number,
  email: string | undefined,
  category: NotificationCategory,
  title: string,
  body: string,
  link: string,
  batchKey: string,
): Promise<void> {
  // In-app notification (respects preferences internally)
  await createBatchedNotification(userId, category, title, body, link, batchKey);

  // Email — only if the channel is enabled for this user + category
  if (email && (await isChannelEnabled(userId, 'email', category))) {
    await sendMail({
      to: email,
      subject: title,
      text: body,
      html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
    });
  }
}

// ── Core: send reminders ─────────────────────────────────────────────────────

/**
 * Find tasks with upcoming due dates and send reminders at the configured
 * offsets. Skips completed tasks and already-sent reminders.
 */
export async function sendTaskReminders(): Promise<void> {
  await ensureReminderLogTable();

  const db = getDatabase();
  const offsets = getReminderOffsets();
  const now = Date.now();

  for (const offsetH of offsets) {
    const windowEnd = new Date(now + offsetH * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    const tasks = await db.all<TaskRow>(
      `SELECT id, title, event_id, due_date, assigned_user_id, status
       FROM   tasks
       WHERE  due_date IS NOT NULL
         AND  due_date <= $1
         AND  due_date > $2
         AND  status != 'Complete'`,
      [windowEnd, nowIso],
    );

    for (const task of tasks) {
      if (await alreadySent(task.id, 'reminder', offsetH)) continue;

      // Collect all assignees (multi-assignee support via task_assignees)
      const assignees = await db.all<AssigneeRow>(
        `SELECT ta.user_id, u.email
         FROM   task_assignees ta
         JOIN   users u ON u.id = ta.user_id
         WHERE  ta.task_id = $1`,
        [task.id],
      );

      // Fall back to legacy assigned_user_id if no multi-assignee rows
      if (assignees.length === 0 && task.assigned_user_id) {
        const user = await db.get<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [
          task.assigned_user_id,
        ]);
        if (user) {
          assignees.push({ user_id: task.assigned_user_id, email: user.email });
        }
      }

      for (const assignee of assignees) {
        const body = `Task "${task.title}" is due in ${offsetH} hour${offsetH !== 1 ? 's' : ''}. Please review and complete it on time.`;
        await notifyUser(
          assignee.user_id,
          assignee.email,
          'task_due',
          `Reminder: "${task.title}" due in ${offsetH}h`,
          body,
          `/events/${task.event_id}/tasks/${task.id}`,
          `task-reminder-${task.id}-${offsetH}h`,
        );
      }

      await markSent(task.id, 'reminder', offsetH);
      logger.info(
        `[TaskReminders] Sent ${offsetH}h reminder for task ${task.id} ("${task.title}")`,
      );
    }
  }
}

// ── Core: escalate overdue tasks ─────────────────────────────────────────────

/**
 * Find tasks overdue by more than the escalation threshold and notify the
 * event organizer (or the user specified in task_escalation_rules).
 */
export async function escalateOverdueTasks(): Promise<void> {
  await ensureReminderLogTable();

  const db = getDatabase();
  const defaultThresholdH = getEscalationThresholdHours();
  const cutoff = new Date(Date.now() - defaultThresholdH * 60 * 60 * 1000).toISOString();

  const overdueTasks = await db.all<
    TaskRow & { event_created_by: number; organizer_email: string }
  >(
    `SELECT t.id, t.title, t.event_id, t.due_date, t.assigned_user_id, t.status,
            e.created_by AS event_created_by,
            u.email      AS organizer_email
     FROM   tasks t
     JOIN   events e ON e.id = t.event_id
     JOIN   users  u ON u.id = e.created_by
     WHERE  t.due_date IS NOT NULL
       AND  t.due_date < $1
       AND  t.status != 'Complete'
       AND  e.deleted_at IS NULL`,
    [cutoff],
  );

  for (const task of overdueTasks) {
    const rule = await db.get<EscalationRule>(
      `SELECT escalate_to_user_id, threshold_hours
       FROM   task_escalation_rules
       WHERE  event_id = $1
         AND  status = $2
         AND  active = TRUE
       ORDER BY threshold_hours ASC
       LIMIT 1`,
      [task.event_id, task.status],
    );

    // Apply rule-specific threshold if tighter than the default
    if (rule) {
      const ruleCutoff = new Date(Date.now() - rule.threshold_hours * 60 * 60 * 1000).toISOString();
      if (task.due_date >= ruleCutoff) continue;
    }

    const escalationOffset = rule?.threshold_hours ?? defaultThresholdH;
    if (await alreadySent(task.id, 'escalation', escalationOffset)) continue;

    // Determine who to escalate to
    let escalateToUserId = task.event_created_by;
    let escalateToEmail = task.organizer_email;

    if (rule?.escalate_to_user_id) {
      const customUser = await db.get<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [
        rule.escalate_to_user_id,
      ]);
      if (customUser) {
        escalateToUserId = rule.escalate_to_user_id;
        escalateToEmail = customUser.email;
      }
    }

    const overdueHours = Math.round(
      (Date.now() - new Date(task.due_date).getTime()) / (60 * 60 * 1000),
    );
    const body = `Task "${task.title}" is overdue by ${overdueHours} hour${overdueHours !== 1 ? 's' : ''}. Please take action or reassign it.`;

    await notifyUser(
      escalateToUserId,
      escalateToEmail,
      'task_overdue',
      `Escalation: "${task.title}" overdue`,
      body,
      `/events/${task.event_id}/tasks/${task.id}`,
      `task-escalation-${task.id}`,
    );

    await markSent(task.id, 'escalation', escalationOffset);
    logger.info(
      `[TaskReminders] Escalated overdue task ${task.id} ("${task.title}") to user ${escalateToUserId}`,
    );
  }
}

// ── Combined entry point — called by the scheduler ───────────────────────────

/**
 * Run both reminder and escalation passes. Exported for the job scheduler
 * and for direct invocation in tests.
 */
export async function runTaskReminderJob(): Promise<void> {
  try {
    await sendTaskReminders();
  } catch (err) {
    logger.error('[TaskReminders] Reminder pass failed', { error: String(err) });
  }
  try {
    await escalateOverdueTasks();
  } catch (err) {
    logger.error('[TaskReminders] Escalation pass failed', { error: String(err) });
  }
}
