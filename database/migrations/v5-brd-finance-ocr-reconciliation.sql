-- BRD 7.5 / Story #550 / Requirement #601
-- OCR receipt extraction and reconciliation audit support

CREATE TABLE IF NOT EXISTS expense_receipt_ocr (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  receipt_text TEXT NOT NULL,
  extracted_title TEXT,
  extracted_amount NUMERIC(10,2),
  extracted_vendor_name TEXT,
  extracted_date TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'extracted',
  error_code TEXT,
  error_message TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('extracted','applied','failed')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_event_id ON expense_receipt_ocr(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipt_ocr_expense_id ON expense_receipt_ocr(expense_id);

CREATE TABLE IF NOT EXISTS expense_reconciliation_logs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  ocr_id INTEGER NOT NULL REFERENCES expense_receipt_ocr(id) ON DELETE RESTRICT,
  before_data JSONB NOT NULL,
  extracted_data JSONB NOT NULL,
  applied_data JSONB NOT NULL,
  overrides_count INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (overrides_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_event_id ON expense_reconciliation_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_expense_reconciliation_logs_expense_id ON expense_reconciliation_logs(expense_id);
