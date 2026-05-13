-- BRD v2 Story #530 — Task #551
-- Finance model extensions for PostgreSQL parity
-- Tasks: #551 (PostgreSQL migration for finance model extensions)
-- Covers: financial reporting types, store suggestion engine schema, shopping item price tracking parity
-- Backward-compatible; uses IF NOT EXISTS / DO $$ guards throughout.

-- ─── 1. Extend scheduled_reports report_type check constraint ─────────────────
-- The init.sql check only lists 5 types; financial reporting parity (#602) adds 4 more.
-- PostgreSQL requires DROP + ADD to modify a check constraint.

ALTER TABLE scheduled_reports DROP CONSTRAINT IF EXISTS scheduled_reports_report_type_check;
ALTER TABLE scheduled_reports
  ADD CONSTRAINT scheduled_reports_report_type_check
  CHECK (report_type IN (
    'rsvp_summary',
    'budget_summary',
    'task_summary',
    'storage_summary',
    'full',
    'financial_detail',
    'expense_workflow',
    'vendor_spend',
    'price_comparison'
  ));

-- ─── 2. Store suggestion engine columns (#607) ────────────────────────────────
-- Location-awareness and ranking support for the suggestion engine.

ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6);
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS usage_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE store_suggestions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP;

-- Prevent negative usage counts.
DO $$
BEGIN
  ALTER TABLE store_suggestions
    ADD CONSTRAINT store_suggestions_usage_count_nonneg CHECK (usage_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_suggestions_usage
  ON store_suggestions(event_id, usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_store_suggestions_category
  ON store_suggestions(event_id, category);

-- ─── 3. Shopping items — ensure v6 columns are present (#552, #608) ──────────
-- Idempotent: v6 already adds these on environments that ran it; safe to re-run.

ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS source_store_name  TEXT;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS source_store_url   TEXT;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS compared_price_low  NUMERIC(10,2);
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS compared_price_high NUMERIC(10,2);
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS price_checked_at    TIMESTAMP;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Price ordering constraint (idempotent).
DO $$
BEGIN
  ALTER TABLE shopping_items
    ADD CONSTRAINT shopping_items_compared_price_order_check
    CHECK (
      compared_price_low  IS NULL OR
      compared_price_high IS NULL OR
      compared_price_low <= compared_price_high
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. Budget categories — ensure finance columns present ───────────────────
-- init.sql already adds these; guard for environments running only migrations.

ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS tax_rate          NUMERIC(5,2) DEFAULT 0;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS gratuity_rate     NUMERIC(5,2) DEFAULT 0;
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS contingency_rate  NUMERIC(5,2) DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE budget_categories
    ADD CONSTRAINT budget_categories_tax_rate_range_chk
    CHECK (tax_rate >= 0 AND tax_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE budget_categories
    ADD CONSTRAINT budget_categories_gratuity_rate_range_chk
    CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE budget_categories
    ADD CONSTRAINT budget_categories_contingency_rate_range_chk
    CHECK (contingency_rate >= 0 AND contingency_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 5. Expense workflow audit index (performance) ───────────────────────────

CREATE INDEX IF NOT EXISTS idx_expenses_approval_status
  ON expenses(event_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_expenses_reimbursement_status
  ON expenses(event_id, reimbursement_status);
