-- BRD v2 Story #530
-- Tasks: #549, #599, #600
-- Expense approval + reimbursement workflow schema migration

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursement_requested_at TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMP;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approval_status_check;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_reimbursement_status_check;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_reimbursement_status_check
  CHECK (reimbursement_status IN ('not_requested','requested','reimbursed','rejected'));

CREATE TABLE IF NOT EXISTS expense_workflow_events (
  id            SERIAL PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id    INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_state    TEXT,
  to_state      TEXT,
  note          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_event_id ON expense_workflow_events(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_workflow_events_expense_id ON expense_workflow_events(expense_id);
