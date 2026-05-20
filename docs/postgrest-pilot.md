# PostgREST Pilot Surface — Definition after RLS Validation

Issues: #421, #473, #775

**Status:** Closed for runtime rollout — PostgREST container removed from active docker stack by task #775.

## Decision Record (Task #775)

- Decision: **Remove** PostgREST from the default Docker Compose runtime for the current release cycle.
- Why: The frontend and backend currently use the Express `/api` surface only; keeping an unused PostgREST container caused architecture confusion.
- Runtime change: `postgrest` service removed from `docker-compose.yml`.
- Port impact: Host port `3001` is now unassigned/freed in the default stack.
- Contract clarification: Express remains the active API contract, as reflected in TRD section 4.1.

---

## Overview

Once the PostgreSQL row-level security pilot on `events` and `event_members` is validated in production, this document defines the candidate PostgREST surface that could replace or supplement the Express API for event-scoped reads.

PostgREST auto-generates a REST API directly from PostgreSQL schema and enforces RLS policies on every query using the requesting user's identity. This removes the possibility of controller-layer access drift.

---

## Prerequisites

The PostgREST pilot must NOT begin until:

- [ ] RLS policies on `events` and `event_members` are deployed and validated in production
- [ ] RLS integration tests (#474) are passing in CI
- [ ] Schema drift between `init.sql` and runtime is resolved (#475)
- [ ] At least one production traffic cycle has been observed with RLS enabled and no unauthorized data leakage

---

## Candidate Pilot Endpoints

The following read-only endpoints are low-risk candidates because:

1. They are already backed by RLS policies
2. They are read-only (GET) — no write path risk during the pilot
3. They correspond to tables with well-defined ownership rules

| PostgREST Endpoint                        | Replaces Express Route                | RLS Policy                               |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `GET /rest/events`                        | `GET /api/events`                     | `rls_events_owner` + `rls_events_member` |
| `GET /rest/events?id=eq.:id`              | `GET /api/events/:id`                 | same                                     |
| `GET /rest/event_members?event_id=eq.:id` | part of `GET /api/events/:id/members` | `rls_event_members_self`                 |

---

## Identity Binding

PostgREST must set the PostgreSQL session variable `app.current_user_id` to the authenticated user's ID before executing any query. This is equivalent to what the Express `withUserContext` method does.

Recommended approach:

1. Issue a **PostgREST JWT** from the Express auth layer (signed with the same key or a PostgREST-specific key)
2. Configure PostgREST to extract the `sub` claim and call `SET LOCAL app.current_user_id = sub` via a pre-request hook
3. Alternatively, use the `jwt.claims.user_id` PostgREST hook with a `pre-request` stored procedure

```sql
-- Pre-request hook: set the session variable from the JWT claim
CREATE OR REPLACE FUNCTION public.set_user_id_from_jwt() RETURNS void AS $$
BEGIN
  PERFORM set_config(
    'app.current_user_id',
    nullif(current_setting('request.jwt.claims', true), '')::json->>'sub',
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Rollout Boundary

| Scope                                  | Included in pilot | Rationale                                        |
| -------------------------------------- | ----------------- | ------------------------------------------------ |
| Read-only event list / detail          | YES               | Low risk, RLS validated                          |
| Read-only event membership             | YES               | Scoped by user_id                                |
| Event write (create / update / delete) | NO                | Keep in Express until pilot matures              |
| RSVPs, tasks, budget, vendors          | NO                | RLS policies not yet applied to these tables     |
| Admin endpoints                        | NO                | Bypass RLS by design; not suitable for PostgREST |

---

## Risks

| Risk                                             | Mitigation                                                     |
| ------------------------------------------------ | -------------------------------------------------------------- |
| RLS bypass via function with SECURITY DEFINER    | Audit all DB functions; avoid SECURITY DEFINER in pilot tables |
| PostgREST version compatibility                  | Pin PostgREST version; test against staging DB first           |
| N+1 queries from client over-fetching            | Define PostgREST views with embedded selects; set row limits   |
| Dual API surface confusion (Express + PostgREST) | Document clearly; route PostgREST under `/rest/` prefix        |

---

## Next Steps

1. Confirm RLS pilot is stable in production (zero unauthorized-access incidents over 1–2 weeks)
2. Stand up PostgREST in staging, connected to the same DB with the `app.current_user_id` hook
3. Write smoke tests comparing Express and PostgREST responses for the same user context
4. Gradually shift read traffic from Express to PostgREST for the candidate endpoints
5. Evaluate expanding RLS to additional tables (RSVPs, tasks) before expanding PostgREST surface
