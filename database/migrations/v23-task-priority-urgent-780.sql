-- =============================================================
-- Migration: v23 Task Priority Urgent parity
-- Task: #780
-- =============================================================

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent'));

ALTER TABLE task_templates DROP CONSTRAINT IF EXISTS task_templates_priority_check;
ALTER TABLE task_templates ADD CONSTRAINT task_templates_priority_check
  CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent'));
