# UUID Primary-Key Migration Spike (#774)

**Date:** 2026-05-20  
**Status:** Completed (spike), recommendation recorded in TRD section 4.2  
**Related Story:** #763 (Theme #664)

## Scope

This spike evaluates the migration from sequence-backed integer primary keys to UUID primary keys.
No schema or runtime code is changed in this task.

## Baseline Evidence

- Canonical live schema reference: `docs/database/schema.md`
- Total tables in current schema: `64`
- Sequence-backed integer defaults (`nextval(...)`) in schema reference: `58`
- Tables with `Primary key: id` in schema reference: `58`
- Application type footprint (`id: number` / `*_id: number`) across `frontend/src`, `backend/src`, `src`: `632` references

## Migration Options

### Option A: Dual-column + phased cutover (recommended technical path if migration is approved)

Summary:

- Add UUID columns in parallel to existing integer keys.
- Backfill UUIDs and maintain sync during transition.
- Migrate foreign keys and application code in controlled phases.
- Cut over once all reads/writes use UUIDs, then remove integer keys.

Pros:

- Lowest operational risk for existing data and integrations.
- Supports staged rollout, rollback checkpoints, and mixed-read compatibility.
- Reduces outage risk compared to a big-bang switch.

Cons:

- Higher temporary complexity (dual PK/FK mapping).
- Requires disciplined migration orchestration and additional validation scripts.

### Option B: In-place ALTER (big-bang conversion)

Summary:

- Convert key columns directly, rewrite all foreign keys and dependent code in one release window.

Pros:

- Shorter implementation timeline on paper.
- No temporary dual-key model to maintain.

Cons:

- High blast radius and high rollback complexity.
- Requires prolonged write freeze / maintenance window.
- Not suitable for this repo's current breadth (64-table schema and broad ID type usage).

## Proposed Migration Plan (for Option A)

### Phase 0: Preparation

1. Enable extension:
   - `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
2. Generate full PK/FK dependency inventory from catalog metadata.
3. Define migration waves (core entities first, then dependent tables).
4. Freeze new integer-ID assumptions in code during migration window.

### Phase 1: Dual-column introduction

1. For each integer PK table, add `uuid_id UUID DEFAULT gen_random_uuid() NOT NULL`.
2. Add unique indexes on each new UUID key.
3. For each FK to integer IDs, add matching UUID FK shadow columns.
4. Backfill UUID FK columns through deterministic joins.
5. Add transitional constraints/triggers to keep int/uuid references in sync.

### Phase 2: Application cutover

1. Backend:
   - Accept UUID path/query IDs.
   - Use UUID joins and filters.
   - Keep compatibility lookups (int->uuid) for transition period only.
2. Frontend:
   - Replace `id: number` and related fields with UUID string shapes.
   - Update route params, client-side caches, and form payload typing.
3. API contract:
   - Version or compatibility envelope to avoid breaking consumers.

### Phase 3: Constraint and key swap

1. Promote UUID columns to primary keys.
2. Re-point foreign keys to UUID primary keys.
3. Remove integer FK references.
4. Keep integer PKs temporarily as non-authoritative fields for rollback horizon.

### Phase 4: Decommission

1. Remove integer PK columns and sequences after acceptance window.
2. Remove sync triggers and fallback mappings.
3. Regenerate `docs/database/schema.md` and verify no sequence-backed PK defaults remain.

## Data-Migration Script Outline

Use idempotent SQL migration scripts with explicit checkpoints:

1. `001_enable_pgcrypto.sql`
2. `002_add_uuid_shadow_columns.sql`
3. `003_backfill_uuid_values.sql`
4. `004_add_uuid_fk_shadow_columns.sql`
5. `005_backfill_uuid_fk_values.sql`
6. `006_add_sync_triggers.sql`
7. `007_backend_frontend_cutover_release` (application deploy)
8. `008_promote_uuid_constraints.sql`
9. `009_drop_integer_fk_constraints.sql`
10. `010_remove_integer_pk_and_sequences.sql`

Each script should:

- Be rerunnable where feasible.
- Emit validation metrics (null UUID count, orphan FK count, row-count parity).
- Fail fast on mismatch thresholds.

## FK Rewrite Plan

1. Build FK dependency graph from `information_schema`/`pg_catalog`.
2. Classify tables by migration wave:
   - Wave 1: root entities (`users`, `events`, core planners)
   - Wave 2: direct dependents (`tasks`, `rsvps`, `expenses`, etc.)
   - Wave 3: junction/analytics/audit tables
3. For each FK:
   - Add UUID shadow FK column.
   - Backfill via source table UUID.
   - Add NOT VALID FK constraint, validate asynchronously, then enforce.
4. Execute cutover wave-by-wave to cap blast radius.

## Frontend Type-Change Footprint

Current footprint snapshot:

- `632` references to numeric ID patterns (`id: number` or `*_id: number`) across app code.

Expected change areas:

- API client models and DTOs
- Route params and URL generation
- Component props carrying entity IDs
- Cache keys and normalized state stores
- Form schemas and validation rules

Risk:

- Medium-to-high for regressions without exhaustive typing and integration tests.

## Backward-Compatibility Risks

1. API consumers expecting integer IDs will break unless compatibility layer/versioning exists.
2. Existing bookmarked/shared URLs with numeric IDs may fail.
3. Integrations, reports, or scripts keyed on integer IDs may return no data.
4. Mixed-mode reads/writes can drift without strict sync constraints.

Mitigations:

- Transitional API support for both ID formats.
- Deterministic int<->uuid mapping during cutover window.
- Explicit deprecation period and migration communication.
- Automated parity checks before each wave promotion.

## Effort Estimate

### Option A (Dual-column phased cutover)

- **Estimate:** 34-55 story points, approximately 30-45 engineering days
- **Recommended breakdown:**
  - DB migration design and scripts: 12-18 days
  - Backend contract and query migration: 8-12 days
  - Frontend type and routing migration: 7-10 days
  - Test hardening, dry-runs, rollout support: 3-5 days

### Option B (In-place ALTER)

- **Estimate:** 21-34 story points, approximately 18-30 engineering days
- Lower calendar effort but materially higher delivery risk and rollback risk.

## Recommendation and Decision

Recommendation for this training repository:

- **Defer UUID migration now** and **ratify SERIAL as the active implementation baseline** in TRD section 4.2.
- Track UUID migration as a dedicated future epic/spike with explicit release planning.

Rationale:

- Current implementation is deeply integer-keyed across schema and application layers.
- Migration is feasible but high effort/risk for current delivery priorities.
- Deferral preserves stability while keeping a documented, executable migration path.

## Review and Sign-Off

- Reviewed by task assignee (`#774`): `@SmitRAmoliya`
- Decision status: **Signed off for current release cycle**
- Sign-off date: 2026-05-20
