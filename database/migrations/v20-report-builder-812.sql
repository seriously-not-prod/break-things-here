-- v20: Custom report builder config (#812)
-- Adds builder_config column to scheduled_reports to store field/filter/groupBy/sort config,
-- and extends the report_type constraint to allow 'custom_builder'.

-- Extend the report_type check constraint to include 'custom_builder'
ALTER TABLE scheduled_reports
  DROP CONSTRAINT IF EXISTS scheduled_reports_report_type_check;

ALTER TABLE scheduled_reports
  ADD CONSTRAINT scheduled_reports_report_type_check
  CHECK (report_type IN (
    'rsvp_summary', 'budget_summary', 'task_summary', 'storage_summary', 'full',
    'financial_detail', 'expense_workflow', 'vendor_spend', 'price_comparison',
    'custom_builder'
  ));

-- Store the full builder configuration (domain, fields, filters, groupBy, sort)
ALTER TABLE scheduled_reports
  ADD COLUMN IF NOT EXISTS builder_config JSONB;

-- Extend frequency to support 'one_off' for "Run now / save without schedule"
ALTER TABLE scheduled_reports
  DROP CONSTRAINT IF EXISTS scheduled_reports_frequency_check;

ALTER TABLE scheduled_reports
  ADD CONSTRAINT scheduled_reports_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'monthly', 'one_off'));
