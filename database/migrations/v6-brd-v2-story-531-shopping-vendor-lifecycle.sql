-- BRD v2 Story #531
-- Tasks: #553, #554, #609, #610, #611
-- Purpose: Backward-safe PostgreSQL migration for shopping/vendor lifecycle gaps

-- Vendor favorites for per-user preferred vendors.
CREATE TABLE IF NOT EXISTS vendor_favorites (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_favorites_event_id ON vendor_favorites(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_vendor_id ON vendor_favorites(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_favorites_user_id ON vendor_favorites(user_id);

-- Vendor booking lifecycle with strict states.
CREATE TABLE IF NOT EXISTS vendor_bookings (
  id                 SERIAL PRIMARY KEY,
  event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id          INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'requested',
  contract_signed_at TIMESTAMP,
  service_start_at   TIMESTAMP,
  service_end_at     TIMESTAMP,
  total_amount       NUMERIC(10,2),
  currency_code      TEXT DEFAULT 'USD',
  notes              TEXT,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, vendor_id),
  CHECK(status IN ('requested','quoted','negotiating','approved','contracted','scheduled','in_progress','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_bookings_event_id ON vendor_bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bookings_vendor_id ON vendor_bookings(vendor_id);

-- Contract and payment schedule visibility for each vendor booking.
CREATE TABLE IF NOT EXISTS vendor_payment_schedules (
  id                SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  vendor_booking_id INTEGER REFERENCES vendor_bookings(id) ON DELETE SET NULL,
  due_date          DATE NOT NULL,
  amount            NUMERIC(10,2) NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  paid_at           TIMESTAMP,
  note              TEXT,
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK(status IN ('pending','paid','overdue','cancelled')),
  CHECK(amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_event_id ON vendor_payment_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payment_sched_vendor_id ON vendor_payment_schedules(vendor_id);

-- Shopping table safety extensions used by recommendation/comparison reporting.
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS source_store_name TEXT;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS source_store_url TEXT;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS compared_price_low NUMERIC(10,2);
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS compared_price_high NUMERIC(10,2);
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS price_checked_at TIMESTAMP;
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Soft constraints are added as named constraints and remain idempotent.
DO $$
BEGIN
  ALTER TABLE shopping_items
    ADD CONSTRAINT shopping_items_compared_price_order_check
    CHECK (
      compared_price_low IS NULL OR
      compared_price_high IS NULL OR
      compared_price_low <= compared_price_high
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
