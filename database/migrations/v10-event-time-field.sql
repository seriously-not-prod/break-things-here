-- Migration v10: Add event_time field to events table
-- Story #664, Item 10 — P1-Event Time Field
-- Adds a required event time column (stored as TEXT in HH:MM format)
-- to support scheduling events at specific times of day.

ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TEXT;

-- Backfill existing rows with NULL (time not yet known for legacy events).
-- Application validation enforces non-null on new event creation.

-- Update event_templates to carry a default_event_time as well.
ALTER TABLE event_templates ADD COLUMN IF NOT EXISTS default_event_time TEXT;
