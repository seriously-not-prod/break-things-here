# RSVP Status Handling Analysis (Issue #770)

**Objective**: Understand the dual-column RSVP status design and prepare for collapsing to a single source of truth.

---

## 1. Database Schema

### Current State (init.sql + runtime migrations)

**`rsvps` table key columns:**

```sql
-- Legacy column (preserved for backward compatibility)
status TEXT CHECK(status IN ('Pending', 'Going', 'Maybe', 'Not Going', 'Declined')) DEFAULT 'Pending'

-- New canonical column (BRD v2 taxonomy #544, #584)
canonical_status TEXT  -- VALUES: pending, confirmed, declined, maybe, waitlist, cancelled, checked_in, no_show

-- Supporting columns for state derivation
waitlist_position INTEGER       -- NULL when not waitlisted
checked_in BOOLEAN DEFAULT FALSE
checked_in_at TIMESTAMP
```

**Index:**

- `idx_rsvps_canonical_status (event_id, canonical_status)` — enables fast grouping by canonical status for analytics

**Migration Source:** `backend/src/db/database.ts` (~line 2717) — runtime, not SQL file

- Adds column: `ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS canonical_status TEXT`
- Backfill logic: Maps legacy status + waitlist_position + checked_in to canonical enum
- No SQL migration file exists; all logic is in the Node.js startup sequence

---

## 2. RSVP Taxonomy Module

**File:** `backend/src/utils/rsvp-taxonomy.ts`

### Type Definitions

```typescript
// Canonical values — the BRD/FRD machine-readable enum
export type CanonicalRsvpStatus =
  | 'pending' // Not responded yet
  | 'confirmed' // Intent to attend
  | 'declined' // Will not attend
  | 'maybe' // Tentative/might attend
  | 'waitlist' // On the waitlist (seat not guaranteed)
  | 'cancelled' // Explicitly cancelled
  | 'checked_in' // Has checked in at event
  | 'no_show'; // Was invited but did not show

// Legacy values still in rsvps.status for backward compatibility
export type LegacyRsvpStatus = 'Pending' | 'Going' | 'Maybe' | 'Not Going' | 'Declined';
```

### Input Aliases

**Accepted inbound values** (user-submitted, CSV import, etc.):

```typescript
RSVP_STATUS_INPUT_ALIASES: {
  'Pending': ['Pending', 'No Response', 'no_response', 'Invited'],
  'Going': ['Going', 'Confirmed', 'Yes', 'Accepted'],
  'Maybe': ['Maybe', 'Tentative'],
  'Not Going': ['Not Going', 'not_going', 'Cancelled', 'Canceled'],
  'Declined': ['Declined', 'Rejected', 'No'],
}
```

### Key Functions

#### `toCanonicalStatus(legacy, context): CanonicalRsvpStatus`

- **Purpose:** Derive canonical status from legacy status + runtime context
- **Inputs:**
  - `legacy`: string (from `rsvps.status` column)
  - `context.waitlisted`: boolean (derived from `waitlist_position !== null`)
  - `context.checkedIn`: boolean (from `checked_in` column)
- **Logic Priority:** waitlisted > checkedIn > legacy mapping
- **Fallback:** Unknown values → `'pending'`

**Mapping Example:**

```
'Going' + waitlisted=true  → 'waitlist'
'Going' + checkedIn=true   → 'checked_in'
'Going' + neither          → 'confirmed'
'Not Going'                → 'declined'
'Maybe'                    → 'maybe'
(null or unknown)          → 'pending'
```

#### `toLegacyStatus(canonical): LegacyRsvpStatus`

- **Purpose:** Reverse map canonical back to legacy for storage/display
- **Note:** Waitlist and checked_in guests round-trip as `'Going'` (part of legacy contract)
- **Used for:** Display in exports, CSV output, backward-compat reads

#### `normalizeLegacyRsvpStatusInput(value): LegacyRsvpStatus | null`

- **Purpose:** Normalize user input (web form, API, CSV) to a stored legacy value
- **Accepts:** Any alias from `RSVP_STATUS_INPUT_ALIASES`
- **Returns:** Normalized legacy value or null if invalid
- **Used by:** All RSVP create/update endpoints

---

## 3. Backend Controllers Writing RSVP Status

### A. `rsvps-controller.ts` — Main RSVP CRUD

#### `createRsvp(req, res)` — POST /api/events/:eventId/rsvps

```typescript
// Input flow:
1. normalizeLegacyRsvpStatusInput(req.body.status)  // 'Yes' → 'Going'
2. INSERT INTO rsvps (status = normalized_legacy_value, ...)
3. If queued: addToWaitlist(db, rsvpId, eventId)
4. recomputeCanonicalStatus(rsvpId, 'waitlist' if queued else undefined)
```

**Key: Writes both columns**

- `status`: Normalized legacy value from user input
- `canonical_status`: Computed from status + context (or force override if waitlist)

#### `updateRsvp(req, res)` — PATCH /api/events/:eventId/rsvps/:id

```typescript
1. If body.status: normalizeLegacyRsvpStatusInput() → validate
2. UPDATE rsvps SET status = normalized_legacy, ...
3. recomputeCanonicalStatus(id)  // Recompute without override
```

**Key: Always recalculates** — no direct canonical updates

#### `checkInGuest(req, res)` — PATCH /api/events/:eventId/rsvps/:id/checkin

```typescript
UPDATE rsvps SET
  checked_in = TRUE,
  checked_in_at = CURRENT_TIMESTAMP,
  canonical_status = 'checked_in',   // ← HARDCODED DIRECT WRITE
  late_arrival = $1,
  arrival_delay_minutes = $2,
  updated_at = CURRENT_TIMESTAMP
WHERE id = $3
```

**Risk: Hardcoded assignment** — bypasses `recomputeCanonicalStatus()`

#### `importCsv(req, res)` — POST /api/events/:eventId/rsvps/import

```typescript
for each row in CSV:
  normalizedStatus = normalizeLegacyRsvpStatusInput(row.status_field)
  INSERT rsvps (status = normalizedStatus, ...)
  recomputeCanonicalStatus(lastID)
```

### B. `qr-checkin-controller.ts` — Check-In & Attendance

#### `scanQr(req, res)` — POST /api/events/:eventId/checkin/scan

```typescript
// Inside transaction:
const previousCanonicalStatus = rsvp.canonical_status  // SAVE FOR UNDO
UPDATE rsvps SET
  checked_in = TRUE,
  checked_in_at = CURRENT_TIMESTAMP,
  canonical_status = 'checked_in',   // ← HARDCODED DIRECT WRITE
  late_arrival = $1,
  arrival_delay_minutes = $2,
  updated_at = CURRENT_TIMESTAMP
WHERE id = $3

INSERT INTO attendance_events (
  ..., action = 'checked_in', metadata = {previous_canonical_status: savedStatus}
)
```

**Critical Feature: Saves prior status in audit row** for restoration on undo (#PR-644)

#### `undoCheckin(req, res)` — POST /api/events/:eventId/checkin/:rsvpId/undo

```typescript
// Inside transaction:
1. SELECT canonical_status FROM rsvps WHERE id = rsvpId
2. SELECT metadata FROM attendance_events WHERE rsvp_id = rsvpId AND action = 'checked_in'
3. restoreTo = metadata.previous_canonical_status || 'confirmed'  // Fallback
4. UPDATE rsvps SET canonical_status = restoreTo, checked_in = FALSE, ...
5. INSERT attendance_events(action = 'undo_checkin', metadata = {restored_canonical_status: restoreTo})
```

**Key Behavior: Restores exact prior state** from audit trail

#### `markNoShow(req, res)` — POST /api/events/:eventId/checkin/mark-no-show

```typescript
UPDATE rsvps SET
  canonical_status = 'no_show',      // ← HARDCODED DIRECT WRITE
  updated_at = CURRENT_TIMESTAMP
WHERE event_id = $1 AND id IN (...) AND checked_in = FALSE
```

### C. `waitlist-controller.ts` — Waitlist Promotion

#### `runPromotion(eventId): PromotionResult`

```typescript
for each row in ORDER BY waitlist_position ASC:
  UPDATE rsvps SET
    waitlist_position = NULL,        // Remove from waitlist
    promoted_at = CURRENT_TIMESTAMP,
    status = 'Going',                // ← Sets legacy status
    updated_at = CURRENT_TIMESTAMP
  WHERE id = $1
```

**Problem: Does NOT explicitly update `canonical_status`**

- Relies on derived recalculation elsewhere (or reads stale value)
- After promotion, `canonical_status` should change from 'waitlist' → 'confirmed'
- But the UPDATE doesn't trigger recomputation

---

## 4. Frontend Types

**File:** `frontend/src/services/guest-service.ts`

### Type Definitions

```typescript
// Legacy type for display/forms
export type RsvpStatus = 'Pending' | 'Going' | 'Maybe' | 'Not Going' | 'Declined';

// Canonical type — mirrors backend enum exactly
export type CanonicalRsvpStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'maybe'
  | 'waitlist'
  | 'cancelled'
  | 'checked_in'
  | 'no_show';

// Main RSVP guest record
export interface RsvpGuest {
  id: number;
  event_id: number;
  name: string;
  email: string;
  // ... 25+ additional fields ...
  status: RsvpStatus; // Display value
  canonical_status: CanonicalRsvpStatus | null; // Machine-readable state
  checked_in: boolean;
  checked_in_at: string | null;
  late_arrival: boolean | null;
  arrival_delay_minutes: number | null;
  // ... more fields ...
}

// Input type for create/update
export interface RsvpGuestInput {
  status?: RsvpStatus; // Only legacy input accepted from frontend
  // ... other input fields ...
}
```

### Frontend API Functions

```typescript
export async function scanQrToken(eventId: number | string, token: string): Promise<QrScanResult>;
// POST /api/events/:eventId/checkin/scan

export async function undoCheckIn(eventId: number | string, rsvpId: number | string): Promise<void>;
// POST /api/events/:eventId/checkin/:rsvpId/undo

export async function markNoShow(eventId: number | string, rsvpIds: number[]): Promise<void>;
// POST /api/events/:eventId/checkin/mark-no-show
```

---

## 5. Migrations

### Runtime Migration (backend/src/db/database.ts)

**Location:** Lines 2717-2826

```typescript
// Add canonical_status column
await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS canonical_status TEXT`);

// Create index for analytics queries
await db.exec(
  `CREATE INDEX IF NOT EXISTS idx_rsvps_canonical_status ON rsvps(event_id, canonical_status)`,
);

// Backfill: Derive canonical from legacy + context
await db.exec(`
  UPDATE rsvps SET canonical_status = CASE
    WHEN canonical_status IS NOT NULL THEN canonical_status
    WHEN waitlist_position IS NOT NULL THEN 'waitlist'
    WHEN checked_in = TRUE THEN 'checked_in'
    WHEN LOWER(status) IN ('going','yes','confirmed','accepted') THEN 'confirmed'
    WHEN LOWER(status) IN ('not going','declined','no','rejected') THEN 'declined'
    WHEN LOWER(status) IN ('maybe','tentative') THEN 'maybe'
    WHEN LOWER(status) IN ('cancelled','canceled') THEN 'cancelled'
    WHEN LOWER(status) IN ('pending','invited','sent') THEN 'pending'
    ELSE 'pending'
  END
  WHERE canonical_status IS NULL OR canonical_status = ''
`);
```

### SQL Migrations

**No `/database/migrations/*.sql` files contain `canonical_status`** — all logic is in the Node.js runtime initialization.

---

## 6. Existing Tests

**File:** `backend/__tests__/pr-644-regressions.test.ts`

### Test Coverage for canonical_status

#### CRITICAL #4 — `undoCheckin` Restores Prior Status

Test: "restores a waitlist guest to waitlist"

```typescript
const rsvpId = await seedRsvp(eventId, { canonical_status: 'waitlist' });
const token = await seedToken(rsvpId);
await scanQr(...);
await undoCheckin(...);
expect(SELECT canonical_status WHERE id = rsvpId).toBe('waitlist');
```

Test: "restores a confirmed guest to confirmed"

```typescript
const rsvpId = await seedRsvp(eventId, { canonical_status: 'confirmed' });
await scanQr(...);
await undoCheckin(...);
expect(SELECT canonical_status WHERE id = rsvpId).toBe('confirmed');
```

#### HIGH #1 — Attendance Statistics

Test: "returns correct totals across multiple statuses"

```typescript
await seedRsvp(eventId, { canonical_status: 'confirmed', checked_in: true });
await seedRsvp(eventId, { canonical_status: 'declined' });
await seedRsvp(eventId, { canonical_status: 'waitlist' });
const stats = await computeAttendanceStats(eventId);
expect(stats.confirmed).toBe(2);
expect(stats.waitlist).toBe(1);
```

### Test Schema

```sql
CREATE TABLE rsvps (
  -- ... [other columns] ...
  status TEXT DEFAULT 'Pending',
  canonical_status TEXT,
  waitlist_position INTEGER,
  checked_in BOOLEAN DEFAULT FALSE,
  -- ... [other columns] ...
);
```

---

## 7. Exports & Reporting

**File:** `backend/src/controllers/guest-export-controller.ts`

### Export Columns

Both `status` and `canonical_status` are exported:

```typescript
const EXPORT_COLUMNS = [
  { key: 'name', label: 'Name', type: 'String' },
  { key: 'email', label: 'Email', type: 'String' },
  { key: 'status', label: 'Status', type: 'String' }, // ← Legacy
  { key: 'canonical_status', label: 'Canonical Status', type: 'String' }, // ← Canonical
  { key: 'guests', label: 'Guest Count', type: 'Number' },
  // ... 25+ more fields ...
];
```

### CSV Export

```typescript
// In rsvps-controller.exportRsvpsCsv():
SELECT name, email, phone, status, canonical_status, guests, notes, ...
```

**Includes both columns** — provides audit trail showing both legacy and canonical states.

---

## 8. Current Use Pattern: How It Works

### Data Flow: New RSVP Submission

```
User Input (web/API/CSV)
    ↓
normalizeLegacyRsvpStatusInput('Yes') → 'Going'
    ↓
INSERT INTO rsvps (status = 'Going', ...) RETURNING id
    ↓
if queued:
  addToWaitlist(db, id, eventId)
  recomputeCanonicalStatus(id, override='waitlist')
else:
  recomputeCanonicalStatus(id)
    ↓
toCanonicalStatus('Going', {waitlisted: true/false, checkedIn: false})
    → 'confirmed' or 'waitlist'
    ↓
UPDATE rsvps SET canonical_status = 'confirmed'
    ↓
ROW STATE:
  status = 'Going'          ← Legacy column
  canonical_status = 'confirmed'  ← Canonical column
```

### Data Flow: Check-In

```
QR scan or manual check-in
    ↓
UPDATE rsvps SET
  checked_in = TRUE,
  canonical_status = 'checked_in'
  ← HARDCODED, bypasses recomputeCanonicalStatus()
    ↓
Save previous canonical_status in attendance_events audit row
    ↓
ROW STATE:
  status = 'Going'               ← Unchanged
  canonical_status = 'checked_in'   ← Direct write
  checked_in = TRUE
```

### When canonical_status is RECALCULATED

- **Update RSVP:** Always calls `recomputeCanonicalStatus()`
- **Import CSV:** After each row insert/update
- **Backfill on migration:** At startup

### When canonical_status is HARDCODED (bypassing recomputation)

- **Check-in (checkInGuest):** `canonical_status = 'checked_in'` direct
- **QR check-in (scanQr):** `canonical_status = 'checked_in'` direct
- **Mark no-show:** `canonical_status = 'no_show'` direct
- **Create with waitlist override:** `canonical_status = 'waitlist'` override param
- **Waitlist promotion:** No explicit update — may read stale value

---

## 9. Key Findings: Gaps & Inconsistencies

### ⚠️ Issue 1: Hardcoded Status Writes

Three places directly write canonical_status without going through `recomputeCanonicalStatus()`:

1. **checkInGuest()** — `canonical_status = 'checked_in'`
2. **scanQr()** — `canonical_status = 'checked_in'`
3. **markNoShow()** — `canonical_status = 'no_show'`

**Impact:** Bypasses validation logic in `toCanonicalStatus()`. If rules change, these hardcoded paths aren't updated.

### ⚠️ Issue 2: Waitlist Promotion

**runPromotion()** updates `status = 'Going'` and `waitlist_position = NULL` but does NOT update `canonical_status`.

**Current behavior:** After promotion, canonical_status may be stale ('waitlist') until next update that triggers recalculation.

**Expected behavior:** Promotion should set `canonical_status = 'confirmed'`.

### ⚠️ Issue 3: Undo Check-In Fallback

**undoCheckin()** restores from audit metadata:

```typescript
restoreTo = metadata.previous_canonical_status || 'confirmed'; // Fallback
```

If audit row is missing or metadata is null, defaults to 'confirmed' — may not be correct for waitlisted guests.

### ✅ Issue 4 (Fixed): Undo Idempotence

PR #644 fixed critical issue by saving `previous_canonical_status` in QR scan audit row, enabling precise restoration in `undoCheckin()`. Tests cover both waitlist and confirmed cases.

---

## 10. For Issue #770: Path to Single Source of Truth

### Option A: Make `canonical_status` Primary (Recommended)

**Changes needed:**

1. Move all writes to use centralized `setRsvpCanonicalStatus(id, canonical)` function
2. Eliminate hardcoded direct writes in check-in/mark-no-show
3. Make `status` a view/derived column (or deprecate entirely)
4. Ensure waitlist promotion explicitly calls status update

**Benefit:** One system of record, consistent business logic

### Option B: Keep Dual Columns, Centralize Logic

**Changes needed:**

1. Always call `recomputeCanonicalStatus()` after any state change (never direct writes)
2. Ensure `toCanonicalStatus()` handles all edge cases
3. Remove hardcoded assignments

**Benefit:** Backward compatibility with legacy imports, easier migration

### Questions to Resolve

1. Should `status` be kept for backward compatibility with exports/integrations?
2. Are there legacy systems reading `status` directly that need migration?
3. Should waitlist promotion automatically trigger canonical recalculation?
4. What's the fallback behavior for undo operations when audit trail is incomplete?

---

## 11. Appendix: All Places Referencing canonical_status

### Writes

- rsvps-controller.ts: `recomputeCanonicalStatus()` x2
- rsvps-controller.ts: `checkInGuest()` hardcoded
- qr-checkin-controller.ts: `scanQr()` hardcoded
- qr-checkin-controller.ts: `undoCheckin()` restore from audit
- qr-checkin-controller.ts: `markNoShow()` hardcoded
- database.ts: Backfill on migration

### Reads

- guest-export-controller.ts: Export columns
- guest-service.ts (frontend): Type definition
- rsvps-controller.ts: CSV export SELECT
- All tests in pr-644-regressions.test.ts

### Indices

- `idx_rsvps_canonical_status` on `(event_id, canonical_status)`
