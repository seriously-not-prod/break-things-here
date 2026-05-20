# Architecture Decision: `guests` First-Class Table

**Issue:** #771  
**Date:** 2026-05-20  
**Status:** Accepted  
**Author:** SmitRAmoliya

---

## Context

TRD §4.2 (REQUIREMENTS_BASELINE.md) lists `guests` as one of the eleven core
PostgreSQL tables. Prior to this change the live schema contained no `guests`
table; instead, guest information (name, email, phone, dietary restrictions,
accessibility needs) was embedded directly in the `rsvps` table. A compatibility
shim existed as a SQL VIEW:

```sql
CREATE OR REPLACE VIEW guests AS SELECT * FROM rsvps;
```

This divergence between the TRD specification and the live schema created
ambiguity and blocked features that required an independent guest identity
(e.g. pre-populating a guest without an RSVP, multi-event guest cross-
referencing, and clean FK relationships from `rsvps`).

---

## Decision

**Add the `guests` table as a first-class table.**

A new `guests` table stores the identity and profile of each guest independently
from the RSVP response. The `rsvps` table gains a `guest_id` foreign key that
references `guests.id`, enabling a clean separation between:

- **Guest identity** (`guests`): who someone is — name, email, phone, dietary
  restrictions, accessibility needs.
- **RSVP response** (`rsvps`): how they responded to a specific event — status,
  check-in, meal choice, waitlist position, etc.

---

## Rationale

| Factor               | "Add table" (chosen)                                            | "Merge documented" (rejected)                             |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| TRD conformance      | Brings live schema into alignment with §4.2                     | Requires updating TRD to diverge from stated requirements |
| Guest identity reuse | Guest profile exists independently; can pre-invite without RSVP | Guest info tied to a single RSVP row                      |
| FK cleanliness       | `rsvps.guest_id → guests.id` — clear owner of identity          | No FK; name/email duplicated on every RSVP                |
| Cross-event guests   | Guest row created once; future RSVPs can reference it           | Separate identical rows per event                         |
| RLS simplicity       | event-scoped, same pattern as all other tables                  | n/a                                                       |
| Backfill effort      | One migration — no data loss, no orphaned RSVPs                 | No migration needed                                       |
| Short-term risk      | Low — additive change, existing RSVP paths unchanged            | Low — documentation only                                  |

The "merge documented" path would require shrinking the TRD's stated 11-table
schema and removing an explicit requirement. The "add table" path is additive,
fully backward-compatible (existing RSVP endpoints continue to work), and
correctly satisfies the specification.

---

## Implementation Summary

1. **Migration `v22-guests-table-771.sql`** (and matching runtime block in
   `database.ts`):
   - Drops the `guests` VIEW.
   - Creates the `guests` table with all profile columns, audit columns, and
     RLS policies.
   - Adds `guest_id` FK column to `rsvps`.
   - Backfills one `guests` row per existing RSVP (using the RSVP's own
     `name`, `email`, `phone`, `dietary_restriction`, `accessibility_needs`).
   - Sets `rsvps.guest_id` from the backfilled rows.
   - Verifies no orphaned RSVPs remain after the change.

2. **Controller `backend/src/controllers/guests-controller.ts`**:
   - `GET  /api/events/:eventId/guest-records` — list all guests for an event.
   - `GET  /api/events/:eventId/guest-records/:id` — get a single guest.
   - `POST /api/events/:eventId/guest-records` — create a guest (optionally
     — create a guest record (guest identity only; does not create an RSVP).
   - `PUT  /api/events/:eventId/guest-records/:id` — update guest profile.
   - `DELETE /api/events/:eventId/guest-records/:id` — delete guest (cascades
     guest_id FK in `rsvps` to NULL; does not delete the RSVP itself, so no
     orphaned RSVPs).

3. **Tests `backend/__tests__/guests.test.ts`**: full CRUD integration tests.

---

## Backward Compatibility

- The existing `/events/:eventId/guests` routes continue to call
  `rsvpsController` — these routes operate on the `rsvps` table and are
  unaffected.
- The `guest_group_members` join table continues to reference `rsvp_id` — no
  change required.
- The `rsvps.guest_id` FK is `ON DELETE SET NULL`: deleting a guest profile
  does not delete the RSVP, ensuring no orphaned RSVPs are introduced.

---

## Consequences

- Guest identity is now tracked as a first-class entity, fulfilling TRD §4.2.
- Future features (multi-event guest cross-referencing, pre-invite workflows,
  guest portal authentication) have a stable foundation.
- The `guests` VIEW is replaced by the real table; any query that previously
  ran `SELECT * FROM guests` will return data from the real table (same
  columns — since the view was `SELECT * FROM rsvps`, new queries should target
  either `guests` for identity fields or `rsvps` for RSVP fields directly).
