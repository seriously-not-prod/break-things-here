# RSVP Status Visual Reference

## Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RSVP Row State                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐        ┌──────────────────────┐           │
│  │ Legacy Column       │        │ Canonical Column     │           │
│  │ (Display/Input)     │        │ (Machine Readable)   │           │
│  ├─────────────────────┤        ├──────────────────────┤           │
│  │ status: 'Going'     │───────→│ canonical_status:    │           │
│  │                     │        │   'confirmed'        │           │
│  │ Values:             │        │                      │           │
│  │ • Pending          │        │ Values:              │           │
│  │ • Going            │        │ • pending            │           │
│  │ • Maybe            │        │ • confirmed          │           │
│  │ • Not Going        │        │ • declined           │           │
│  │ • Declined         │        │ • maybe              │           │
│  │                     │        │ • waitlist           │           │
│  │ Source: User input  │        │ • cancelled          │           │
│  │                     │        │ • checked_in         │           │
│  │                     │        │ • no_show            │           │
│  │                     │        │                      │           │
│  │                     │        │ Source: Derived from │           │
│  │                     │        │ status + context     │           │
│  └─────────────────────┘        └──────────────────────┘           │
│                                                                      │
│  Supporting Columns:                                               │
│  ┌─────────────────────────────────────────────────────┐          │
│  │ waitlist_position: NULL or INTEGER                 │          │
│  │ checked_in: BOOLEAN                                │          │
│  │ checked_in_at: TIMESTAMP                           │          │
│  └─────────────────────────────────────────────────────┘          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Legend:
  ──→  Derivation flow during toCanonicalStatus()
```

## Derivation Logic: toCanonicalStatus()

```
┌─ Input: Legacy Status + Context ─────────────────────────────────┐
│                                                                  │
│  Parameters:                                                     │
│   • legacy: string (from rsvps.status)                          │
│   • context.waitlisted: boolean (waitlist_position IS NOT NULL) │
│   • context.checkedIn: boolean (checked_in = TRUE)             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌─ Priority Decision Tree ─────────────────────────────────────────┐
│                                                                  │
│  1. IF waitlisted → RETURN 'waitlist'                           │
│     (regardless of status or checked_in)                        │
│                                                                  │
│  2. ELSE IF checkedIn → RETURN 'checked_in'                     │
│     (overrides status mapping)                                  │
│                                                                  │
│  3. ELSE map legacy status:                                     │
│     • 'Going' | 'Yes' | 'Confirmed' | 'Accepted'               │
│       → 'confirmed'                                             │
│     • 'Not Going' | 'Declined' | 'No' | 'Rejected'             │
│       → 'declined'                                              │
│     • 'Maybe' | 'Tentative' → 'maybe'                          │
│     • 'Cancelled' | 'Canceled' → 'cancelled'                   │
│     • 'Pending' | 'Invited' | 'Sent' | (empty/null)            │
│       → 'pending'                                               │
│                                                                  │
│  4. DEFAULT → 'pending'                                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Write Operations by Controller

```
┌─────────────────────────────────┐
│    rsvps-controller.ts          │
├─────────────────────────────────┤
│                                 │
│ CREATE: [Normalize + Compute]   │
│  Input: 'Yes'                   │
│    ↓ normalizeLegacyRsvpStatusInput()
│  'Going'                        │
│    ↓ INSERT into status column  │
│  status = 'Going'               │
│    ↓ recomputeCanonicalStatus() │
│  canonical = 'confirmed'        │
│                                 │
│ UPDATE: [Recompute only]        │
│  status = normalized input      │
│  recomputeCanonicalStatus()     │
│    (no override)                │
│                                 │
│ CHECK-IN: [Hardcoded direct]    │
│  ⚠️ canonical_status = 'checked_in'
│    (BYPASSES recompute)         │
│                                 │
│ IMPORT: [Normalize + Compute]   │
│  CSV row: status value          │
│  For each row:                  │
│    normalizeLegacyRsvpStatusInput()
│    INSERT                       │
│    recomputeCanonicalStatus()   │
│                                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  qr-checkin-controller.ts       │
├─────────────────────────────────┤
│                                 │
│ SCAN: [Hardcoded direct]        │
│  Save: previous_canonical_status │
│  Set: canonical = 'checked_in'  │
│  ⚠️ DIRECT UPDATE (no recompute)│
│  Audit: Store in metadata       │
│                                 │
│ UNDO: [Restore from audit]      │
│  Lookup: attendance_events      │
│  Restore: canonical from metadata
│  Fallback: 'confirmed' if missing
│                                 │
│ MARK-NO-SHOW: [Hardcoded]       │
│  ⚠️ canonical_status = 'no_show'│
│    (DIRECT UPDATE)              │
│                                 │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  waitlist-controller.ts         │
├─────────────────────────────────┤
│                                 │
│ PROMOTE: [Status only]          │
│  status = 'Going'               │
│  waitlist_position = NULL       │
│  ⚠️ Canonical NOT updated       │
│    (old value: 'waitlist')      │
│  Problem: Stale row until next  │
│  UPDATE triggers recalculation  │
│                                 │
└─────────────────────────────────┘
```

## State Machine: RSVP Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                    RSVP State Transitions                        │
└──────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────┐
    │ INITIAL SUBMISSION                                 │
    │ status = normalized input                          │
    │ canonical = derived from status                    │
    └────────────┬────────────────────────────────────────┘
                 │
        ┌────────┴─────────┬─────────────────┬──────────────┐
        │                  │                 │              │
        ↓                  ↓                 ↓              ↓
    ┌────────────┐  ┌─────────────┐  ┌────────────┐  ┌──────────┐
    │ CONFIRMED  │  │ DECLINED    │  │ MAYBE      │  │ PENDING  │
    │ canonical: │  │ canonical:  │  │ canonical: │  │ canonical│
    │ confirmed  │  │ declined    │  │ maybe      │  │ pending  │
    │            │  │             │  │            │  │          │
    │ status:    │  │ status:     │  │ status:    │  │ status:  │
    │ Going      │  │ Not Going   │  │ Maybe      │  │ Pending  │
    └─────┬──────┘  └─────────────┘  └────────────┘  └──────────┘
          │
          │ (if capacity exceeded)
          ↓
    ┌──────────────┐
    │ WAITLISTED   │
    │ canonical:   │
    │ waitlist     │ ← Must re-derive if exceeds capacity
    │ (forced)     │
    │              │
    │ status: Going│ ← Stays as 'Going' (legacy contract)
    │ waitlist_pos:│ ← Non-null value
    │ 0, 1, 2, ... │
    └──────┬───────┘
           │
           │ (runPromotion)
           │
           ↓
    ┌──────────────┐
    │ PROMOTED     │ ← canonical becomes 'confirmed' (after recompute)
    │ canonical:   │   or stays 'waitlist' (if not recomputed)
    │ (recalc)     │
    │ waitlist_pos:│ ← Set to NULL
    │ NULL         │
    │ status: Going│
    └──────┬───────┘
           │
           │ (check-in at event)
           ↓
    ┌──────────────┐
    │ CHECKED-IN   │
    │ canonical:   │
    │ checked_in   │ ← Direct write (bypasses recompute)
    │ (hardcoded)  │
    │ checked_in:  │
    │ TRUE         │
    ...checked_in_at: Now
    └──────┬───────┘
           │
           │ (undoCheckin - CRITICAL)
           │ Restores from audit: previous_canonical_status
           │
           ↓
    └─ RESTORED STATE (waitlist or confirmed)

If event hasn't started:
    ┌──────────────┐
    │ NO-SHOW      │ ← Direct write 'no_show' (before check-in)
    │ canonical:   │
    │ no_show      │ ← Mark as not attending (may not have scanned)
    │ (hardcoded)  │
    │ checked_in:  │
    │ FALSE        │
    └──────────────┘
```

## Data Flow: New RSVP → Checked In → Undo

```
  ┌─────────────────────────────────────────────────────────────┐
  │ USER ACTION: Submit new RSVP form                           │
  │ Input: { name: "Alice", status: "Yes", guests: 2 }         │
  └────────────────┬────────────────────────────────────────────┘
                   │
                   ↓ POST /api/events/:id/rsvps
           ┌───────────────────────────────────┐
           │ createRsvp(req, res)              │
           │ normalizeLegacyRsvpStatusInput()  │
           │ 'Yes' → 'Going'                   │
           └────────────────┬──────────────────┘
                            │
                            ↓
           ┌─────────────────────────────────────────────┐
           │ INSERT INTO rsvps:                          │
           │   id: 123                                   │
           │   status: 'Going'    ← Legacy column        │
           │   guests: 2                                 │
           │   waitlist_position: NULL (capacity OK)    │
           │   checked_in: FALSE                         │
           └─────────────────┬───────────────────────────┘
                             │
                             ↓
           ┌──────────────────────────────────────────────┐
      ┌────┤ recomputeCanonicalStatus(123)               │
      │    │ toCanonicalStatus('Going', {                │
      │    │   waitlisted: false,                        │
      │    │   checkedIn: false                          │
      │    │ })                                          │
      │    │ → 'confirmed'                               │
      │    └────┬─────────────────────────────────────────┘
      │         │
      │         ↓
      │    ┌────────────────────────┐
      │    │ UPDATE rsvps SET       │
      │    │ canonical_status =     │
      │    │ 'confirmed'            │
      │    └────────────┬───────────┘
      │                 │
      │                 ↓
      └────────────────────  [RSVP CREATED]
                   │         ┌─────────────────────┐
                   │         │ rsvps row:          │
                   │         │ id: 123             │
                   │         │ status: 'Going'     │
                   │         │ canonical_status:   │
                   │         │   'confirmed'       │
                   │         │ checked_in: FALSE   │
                   │         │ waitlist_pos: NULL  │
                   │         └─────────────────────┘
                   │
      [LATER...]   │
                   ↓ POST /api/events/:id/checkin/scan
           ┌───────────────────────────────────────┐
           │ scanQr(req, res)                      │
           │ token: 'abc123...'                    │
           │ Look up rsvp_id: 123                  │
           │ Load current rsvp                     │
           └────────────────┬──────────────────────┘
                            │
                            ↓
           ┌──────────────────────────────────────────┐
           │ previousCanonicalStatus = 'confirmed'    │← SAVE
           │                                          │
           │ UPDATE rsvps SET:                        │
           │   checked_in = TRUE                      │
           │   canonical_status = 'checked_in' ← DIR │
           │   checked_in_at = NOW()                  │
           │   late_arrival = false                   │
           │   ...                                    │
           │ WHERE id = 123                           │
           └─────────────────┬────────────────────────┘
                             │
                             ↓
           ┌───────────────────────────────────────────┐
           │ INSERT INTO attendance_events:            │
           │   action: 'checked_in'                    │
           │   metadata: {                             │
           │     previous_canonical_status:            │
           │       'confirmed' ← KEY FOR UNDO         │
           │   }                                       │
           │                                           │
           │ Broadcast SSE: 'checkin' event           │
           └─────────────────┬────────────────────────┘
                             │
                             ↓ Response 201
      [RSVP CHECKED IN]       │
                   ┌─────────────────────────┐
                   │ rsvps row:              │
                   │ id: 123                 │
                   │ status: 'Going' ← Same  │
                   │ canonical_status:       │
                   │   'checked_in' ← Direct │
                   │ checked_in: TRUE        │
                   │ checked_in_at: NOW()    │
                   └─────────────────────────┘
                   │
      [USER CLICKS UNDO...]   │
                              ↓ POST /api/events/:id/checkin/:rsvpId/undo
           ┌─────────────────────────────────────────────┐
           │ undoCheckin(req, res)                       │
           │ rsvpId: 123                                 │
           │                                             │
           │ Load from DB:                               │
           │   rsvp.canonical_status = 'checked_in'      │
           │                                             │
           │ Look up attendance_events:                  │
           │   Find record with action='checked_in'      │
           │   Extract: metadata.previous_canonical...  │
           │   restoreTo = 'confirmed'                   │
           └────────────────┬─────────────────────────────┘
                            │
                            ↓ Inside transaction
           ┌────────────────────────────────────────┐
           │ UPDATE rsvps SET                       │
           │   canonical_status = 'confirmed'       │← RESTORE
           │   checked_in = FALSE                   │
           │   checked_in_at = NULL                 │
           │   ...                                  │
           │ WHERE id = 123                         │
           └─────────────────┬──────────────────────┘
                             │
                             ↓
           ┌───────────────────────────────────────────┐
           │ INSERT INTO attendance_events:            │
           │   action: 'undo_checkin'                  │
           │   metadata: {                             │
           │     restored_canonical_status:            │
           │       'confirmed'                         │
           │   }                                       │
           │                                           │
           │ Broadcast SSE: 'undo_checkin' event      │
           └─────────────────┬────────────────────────┘
                             │
                             ↓ Response 200
      [RSVP UNDO COMPLETE]    │
                   ┌─────────────────────────────┐
                   │ rsvps row restored:         │
                   │ id: 123                     │
                   │ status: 'Going'             │
                   │ canonical_status:           │
                   │   'confirmed' ← RESTORED    │
                   │ checked_in: FALSE           │
                   │ checked_in_at: NULL         │
                   └─────────────────────────────┘
```

## Critical Issue: Audit Trail for Undo

```
⚠️  CRITICAL FIX (#PR-644): Save canonical state in QR scan audit

Normal flow (GOOD):
  1. scanQr: previousCanonicalStatus = rsvp.canonical_status
  2. scanQr: INSERT attendance_events metadata = {previous_canonical_status}
  3. undoCheckin: SELECT metadata FROM attendance_events
  4. undoCheckin: restoreTo = metadata.previous_canonical_status
  5. undoCheckin: UPDATE rsvps SET canonical_status = restoreTo
  → RESULT: Correct restoration ✅

Fallback (RISKY):
  If attendance_events record is missing or metadata is null:
  3. undoCheckin: restoreTo = metadata.previous_canonical_status || 'confirmed'
  → Default to 'confirmed' (may be wrong for waitlisted guests)
  → RESULT: Potential incorrect state ⚠️

Test Coverage:
  ✅ Waitlist guest restores to 'waitlist'
  ✅ Confirmed guest restores to 'confirmed'
```

## Export Schema

```
CSV/Excel Export Columns (guest-export-controller.ts):

Row Index │ Excel Column │ Source         │ Example Value
──────────┼──────────────┼────────────────┼──────────────
 1        │ Name         │ rsvps.name     │ Alice
 2        │ Email        │ rsvps.email    │ alice@test.com
 3        │ Status       │ rsvps.status   │ Going ← Legacy
 4        │ Canonical... │ rsvps.canon... │ confirmed ← Canonical
 5        │ Guests       │ rsvps.guests   │ 2
...

Purpose:
  • Both columns exported for audit trail
  • Legacy column for backward compatibility
  • Canonical for analytics/reporting
  • CSV import normalizes canonical → legacy on re-import
```

## Hardcoded Writes Summary

```
⚠️ Direct canonical_status Updates (Bypass recomputeCanonicalStatus)

Controller              │ Function        │ Canonical Value │ Issue
────────────────────────┼─────────────────┼─────────────────┼─────────────
rsvps-controller        │ checkInGuest()  │ 'checked_in'    │ Hardcoded
qr-checkin-controller   │ scanQr()        │ 'checked_in'    │ Hardcoded
qr-checkin-controller   │ markNoShow()    │ 'no_show'       │ Hardcoded
rsvps-controller        │ createRsvp()    │ 'waitlist'      │ Override param
────────────────────────┴─────────────────┴─────────────────┴─────────────

Recommendation:
  Centralize into single function:
  setRsvpCanonicalStatus(rsvpId, value, context?)
  - Validates against CanonicalRsvpStatus type
  - Logs change
  - Broadcasts SSE event
  - Could add hooks for business logic
```
