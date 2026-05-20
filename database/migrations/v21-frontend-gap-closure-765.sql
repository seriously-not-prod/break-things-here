-- Story #765 (Frontend Feature Gap Closure)
-- Additive columns required by the new UI affordances. Each statement is
-- IF-NOT-EXISTS / DO $$ EXCEPTION-safe so the migration can be re-run.

-- #797 — Vendor compare "Pick this vendor" stamps the chosen vendor on a budget category.
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS selected_vendor_id INTEGER;

DO $$
BEGIN
  ALTER TABLE budget_categories
    ADD CONSTRAINT budget_categories_selected_vendor_fk
    FOREIGN KEY (selected_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_budget_categories_selected_vendor
  ON budget_categories(selected_vendor_id)
  WHERE selected_vendor_id IS NOT NULL;

-- #802 — Per-event overspend threshold (percent, default 80%). Applies to all
-- categories of the event; per-category override is out of scope.
ALTER TABLE events ADD COLUMN IF NOT EXISTS overspend_threshold_percent NUMERIC(5,2) DEFAULT 80;

DO $$
BEGIN
  ALTER TABLE events
    ADD CONSTRAINT events_overspend_threshold_range_chk
    CHECK (overspend_threshold_percent IS NULL OR (overspend_threshold_percent > 0 AND overspend_threshold_percent <= 200));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
