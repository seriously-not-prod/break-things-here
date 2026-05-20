# Architecture Decision: `guests` First-Class Table

**Issue:** #771
**Date:** 2026-05-20
**Status:** Accepted
**Author:** SmitRAmoliya

## Context

TRD section 4.2 listed `guests` as a core table, but the live schema previously
stored guest identity only in `rsvps` and exposed a compatibility view:

```sql
CREATE OR REPLACE VIEW guests AS SELECT * FROM rsvps;
```

That mismatch blocked a clean separation between guest profile identity and RSVP
response state.

## Decision

Add `guests` as a first-class table and link RSVP rows through `rsvps.guest_id`.

## Rationale

- Aligns implementation with TRD section 4.2 requirements.
- Keeps guest identity independent from RSVP state transitions.
- Enables strict FK ownership (`rsvps.guest_id -> guests.id`).
- Supports future guest-level workflows without duplicating identity columns per RSVP row.

## Implementation Summary

1. Added migration `database/migrations/v24-guests-table-771.sql`.
1. Replaced the legacy view with a real `guests` table.
1. Added `rsvps.guest_id` foreign key (`ON DELETE SET NULL`).
1. Backfilled one guest record per existing RSVP and linked each RSVP.
1. Added RLS policy `rls_guests_event_member` on `guests`.
1. Added guest-record CRUD controller and routes:
   - `GET /api/events/:eventId/guest-records`
   - `GET /api/events/:eventId/guest-records/:id`
   - `POST /api/events/:eventId/guest-records`
   - `PUT /api/events/:eventId/guest-records/:id`
   - `DELETE /api/events/:eventId/guest-records/:id`

## Safety Guarantees

- Migration is idempotent and safe to rerun.
- Backfill ends with a guard that fails if any RSVP remains with `guest_id IS NULL`.
- Deleting a guest does not delete RSVP rows; `guest_id` is nulled by FK behavior.
