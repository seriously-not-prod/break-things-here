# Advanced AI Recommendations — Phase Plan

**Document Version:** 1.0
**Created:** 2026-05-27
**Story:** [#967 — Define Phase Plan for Advanced AI Recommendations and ML Insights](https://github.com/seriously-not-prod/break-things-here/issues/967)
**Parent Theme:** [#945 — AI Assistance Expansion](https://github.com/seriously-not-prod/break-things-here/issues/945)
**Stack:** Vite + React Router + Express + PostgreSQL (authoritative — no migration)

---

## 1. Purpose

This document defines a structured, phased rollout plan for advanced AI recommendation capabilities in the Festival & Event Planner application. It translates out-of-scope MVP items from the AI requirement baseline into concrete post-MVP phases with explicit entry/exit criteria, dependency mapping, and governance constraints.

The document satisfies the acceptance criteria of Story #967:

- Out-of-scope AI items from requirements are captured in a phased roadmap.
- Entry/exit criteria are defined for each phase.
- Dependencies on data quality, observability, and safety are explicit.
- MVP boundary remains intact while future AI scope is visible.

### Related Documentation

| Document                                                                                | Purpose                                                                    |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/ai-capability.md](ai-capability.md)                                               | Current AI endpoint contracts and provider configuration                   |
| [docs/requirements/ai-requirement-baseline.md](requirements/ai-requirement-baseline.md) | Authoritative AI requirement set with traceability matrix                  |
| [docs/requirements/REQUIREMENTS_BASELINE.md](requirements/REQUIREMENTS_BASELINE.md)     | Full application requirement baseline (§6.3 defines out-of-scope AI items) |

---

## 2. MVP Boundary (Completed — Issues #945–#966)

The following capabilities constitute the delivered MVP. They must **not** be reopened or altered by this phase plan.

| Capability                                                 | Issues           | Status       |
| ---------------------------------------------------------- | ---------------- | ------------ |
| AI Planning Assistant UI (floating chat widget)            | #908, #945       | ✅ Delivered |
| Context-aware suggestions (event / task / rsvp / general)  | #908, #946       | ✅ Delivered |
| Azure OpenAI primary provider + OpenAI fallback            | #908, #925, #926 | ✅ Delivered |
| Per-user rate limiting (20 req/hour, PostgreSQL-backed)    | #908             | ✅ Delivered |
| Prompt injection sanitisation (server-side)                | #908             | ✅ Delivered |
| Authenticated access enforcement (`authenticateToken`)     | #908             | ✅ Delivered |
| Grounded workflow support (live event/task/RSVP context)   | #946, #947       | ✅ Delivered |
| Enhanced AI safety controls and threat categorisation      | #956             | ✅ Delivered |
| AI data privacy and PII minimisation middleware            | #957             | ✅ Delivered |
| AI RBAC enforcement (`ai.access` permission)               | #963             | ✅ Delivered |
| Structured AI output schemas and runtime validation        | #964             | ✅ Delivered |
| AI requirement baseline and traceability matrix            | #948             | ✅ Delivered |
| AI observability logging (`ai_safety_events`, audit trail) | #947, #956       | ✅ Delivered |

**Stack constraint (permanent):** All future phases must remain within the current Vite + React Router + Express + PostgreSQL architecture. No framework migration is permitted.

---

## 3. Out-of-Scope Items Deferred to Future Phases

The following capabilities were explicitly excluded from the MVP. They are the primary subject of this phase plan.

| Deferred Capability                                             | Original Requirement Reference  | Target Phase |
| --------------------------------------------------------------- | ------------------------------- | ------------ |
| AI-powered event recommendations engine                         | REQUIREMENTS_BASELINE.md §6.3   | Phase 1      |
| Advanced analytics with machine learning insights               | REQUIREMENTS_BASELINE.md §6.3   | Phase 2      |
| AI-generated invitations and marketing copy                     | REQUIREMENTS_BASELINE.md §6.3   | Phase 1      |
| Auto-assignment or auto-scheduling based on AI output           | REQUIREMENTS_BASELINE.md §6.3   | Phase 3      |
| Third-party AI agent orchestration (LangChain, Semantic Kernel) | ai-requirement-baseline.md §2.2 | Phase 3      |
| Unsolicited/behavioural recommendation engine                   | ai-requirement-baseline.md §6.1 | Phase 2      |

---

## 4. Recommendation Categories and Use Cases

### 4.1 Contextual Recommendations (Phase 1)

Prompt-driven, user-initiated recommendations that extend the existing grounded workflow to cover additional domains.

| Use Case                        | Context | Description                                                                      |
| ------------------------------- | ------- | -------------------------------------------------------------------------------- |
| Event content recommendations   | `event` | Suggest session topics, speaker ideas, and agenda items based on event metadata  |
| Invitation and marketing copy   | `event` | Draft invitation text, promotional descriptions, and social media snippets       |
| Venue and logistics suggestions | `event` | Recommend venue configuration, catering options based on capacity and event type |
| Task prioritisation hints       | `task`  | Suggest task ordering and critical path items given current event timeline       |
| RSVP follow-up messaging        | `rsvp`  | Draft targeted follow-up messages for pending or declined RSVPs                  |

### 4.2 Data-Driven Recommendations (Phase 2)

Recommendations derived from aggregated application data patterns. Require data quality baseline and observability infrastructure.

| Use Case                    | Context | Description                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------ |
| Capacity optimisation       | `event` | Recommend capacity adjustments based on historical RSVP acceptance rates |
| Peak-time scheduling        | `event` | Suggest event timing based on historical attendance patterns             |
| Audience segmentation hints | `rsvp`  | Group RSVPs by engagement pattern and recommend communication strategies |
| Task completion analytics   | `task`  | Surface bottlenecks from historical task velocity data                   |

### 4.3 Automated Recommendation Surfaces (Phase 3)

System-initiated, background recommendations. Require human-in-the-loop confirmation gates before any action is applied.

| Use Case                | Context   | Description                                                                                      |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| Auto-draft task lists   | `task`    | Pre-populate a draft task list for new events from event type templates                          |
| Smart RSVP reminders    | `rsvp`    | Trigger draft reminder messages at configurable thresholds (requires explicit send confirmation) |
| Budget allocation hints | `general` | Suggest budget breakdowns based on event type, capacity, and historical cost data                |

> **Human-in-the-loop invariant:** No recommendation phase may auto-apply AI output without explicit user confirmation. This constraint is permanent and is not relaxed in any phase.

---

## 5. Phased Rollout Plan

### Phase 0 — Foundation (Completed)

**Status:** ✅ Delivered (Issues #945–#966)

Delivers the core AI infrastructure that all future phases depend on.

**Delivered capabilities:**

- Interactive AI Planning Assistant with context-aware suggestions
- Grounded workflow engine (event, task, RSVP contexts with live DB data)
- AI safety controls, prompt injection prevention, PII minimisation
- RBAC enforcement, rate limiting, authenticated access
- Structured output schemas, observability logging, audit trail

**Exit criteria (all met):**

- All AI-REQ-001 through AI-REQ-012 are either Implemented or Partial with known gap tasks
- `ai_safety_events` and `ai_audit_log` tables are populated in production
- Per-user rate limiting is verified under load

---

### Phase 1 — Extended Contextual Recommendations

**Target scope:** Invitation/marketing copy generation; extended event, task, and RSVP recommendation contexts.

**Entry criteria:**

- Phase 0 exit criteria are met.
- `ai_safety_events` observability baseline is established (≥30 days of event data).
- AI RBAC policy (`ai.access`) is verified in production for all target roles.
- Data quality baseline for `events`, `tasks`, and `rsvps` tables is documented.

**Work items (to be created as sub-issues of #967):**

| ID        | Description                                                                  | Effort |
| --------- | ---------------------------------------------------------------------------- | ------ |
| 967-P1-01 | Extend `POST /api/ai/grounded` to support `invitation` workflow type         | S      |
| 967-P1-02 | Add `marketing-copy` context to AI context selector                          | S      |
| 967-P1-03 | Implement venue/logistics recommendation prompt template                     | S      |
| 967-P1-04 | Add RSVP follow-up draft workflow                                            | M      |
| 967-P1-05 | Frontend: display structured invitation output with copy-to-clipboard action | S      |
| 967-P1-06 | Unit tests for new workflow types                                            | M      |
| 967-P1-07 | Update `docs/ai-capability.md` with Phase 1 endpoints                        | S      |

**Technical architecture:**

- New workflow types are additive extensions to the existing `POST /api/ai/grounded` endpoint
- New prompt templates follow the existing `SYSTEM_PROMPTS` pattern in `ai-controller.ts`
- No new AI provider dependency; Azure OpenAI remains the sole provider
- Structured output schemas extended in `backend/src/lib/ai-schemas.ts`

**Exit criteria:**

- All Phase 1 work items merged and CI-passing on `develop`
- `docs/ai-capability.md` reflects new endpoint contracts
- Unit test coverage for new workflow types ≥ 80%
- No new CodeQL alerts introduced
- AI safety controls and PII minimisation middleware applied to all new endpoints

**Risks:**

| Risk                                         | Likelihood | Mitigation                                                                                    |
| -------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| LLM hallucination in marketing copy          | Medium     | Output content safety validation (`validateAiOutput`); user must review before use            |
| Rate limit exhaustion from extended contexts | Low        | Existing 20 req/hour limit applies; monitor `ai_rate_limits` table                            |
| Prompt length exceeds provider token limit   | Low        | Enforce 2000-char prompt cap; truncate grounding context if combined size exceeds 4000 tokens |

---

### Phase 2 — Data-Driven Analytics and Pattern-Based Recommendations

**Target scope:** Aggregate data analysis; capacity optimisation; historical attendance patterns; task velocity analytics.

**Entry criteria:**

- Phase 1 exit criteria are met.
- ≥ 6 months of production event, task, and RSVP data available for analysis.
- Database read-replica or analytics materialized views provisioned (to avoid OLTP impact).
- Data quality audit completed: `events`, `tasks`, `rsvps`, `guests` tables validated for completeness.
- Privacy impact assessment completed and approved (GDPR/data minimisation review).

**Work items (to be created as sub-issues once Phase 1 exits):**

| ID    | Description                                                                    | Effort |
| ----- | ------------------------------------------------------------------------------ | ------ |
| P2-01 | Design analytics data model (materialized views or read-replica schema)        | L      |
| P2-02 | Implement capacity utilisation analytics aggregate query                       | M      |
| P2-03 | Add `capacity-analysis` workflow type to grounded AI endpoint                  | M      |
| P2-04 | Implement historical RSVP acceptance rate query for scheduling recommendations | M      |
| P2-05 | Add task velocity analytics aggregate                                          | M      |
| P2-06 | Frontend: analytics recommendation panel (read-only, no auto-apply)            | L      |
| P2-07 | Privacy impact assessment documentation                                        | M      |
| P2-08 | Observability: AI analytics request metrics dashboard                          | M      |

**Technical architecture:**

- Analytics queries target read-replica or materialised views to prevent OLTP write-path contention
- New `analytics` context added to grounded workflow engine
- Grounding payload capped at 8000 tokens to avoid provider context limits
- All aggregate data is anonymised before injection into prompts (PII minimisation middleware enforced)
- Results are presented as read-only suggestions; no auto-write path exists

**Exit criteria:**

- Analytics queries verified against ≥ 3 months of fixture data
- P95 AI analytics request latency ≤ 5 seconds
- Privacy impact assessment approved and stored in `docs/security/`
- Unit and integration tests cover aggregate query correctness
- No PII fields appear in prompt payloads (verified by `ai-privacy` middleware test suite)

**Technical debt considerations:**

- Materialized view refresh strategy must be defined (scheduled vs on-demand)
- Analytics aggregate complexity should be bounded to prevent runaway query costs
- If analytics load grows beyond PostgreSQL capabilities, migration path to a dedicated analytics store must be planned (outside current stack scope)

**Risks:**

| Risk                                                    | Likelihood | Mitigation                                                                                |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Insufficient data volume for meaningful recommendations | High       | Document minimum data threshold; surface "insufficient data" message if threshold not met |
| PII leakage through aggregate payloads                  | Medium     | AI privacy middleware enforces field exclusion list; add analytics-specific PII audit     |
| Query performance degradation                           | Medium     | Read-replica isolation; query time budget enforced in middleware (reject if > 3s)         |
| GDPR compliance gaps                                    | Low        | Privacy impact assessment gating entry; legal review required before Phase 2 starts       |

---

### Phase 3 — Automated Recommendation Surfaces and Agent Orchestration

**Target scope:** Background recommendation generation; draft task list pre-population; smart RSVP reminders; AI agent orchestration exploration.

**Entry criteria:**

- Phase 2 exit criteria are met.
- Human-in-the-loop confirmation UI pattern is proven and reusable (from Phase 1/2).
- Privacy impact assessment for background processing approved.
- Notification infrastructure available (email or in-app) for surfacing background recommendations.
- Governance framework for automated AI actions documented and approved by team.
- At least one compliance review cycle completed covering Phases 0–2.

**Work items (to be created as sub-issues once Phase 2 exits):**

| ID    | Description                                                                          | Effort |
| ----- | ------------------------------------------------------------------------------------ | ------ |
| P3-01 | Design background recommendation job architecture (queue-based, not cron)            | L      |
| P3-02 | Implement draft task-list generation for new events (requires explicit user publish) | L      |
| P3-03 | Implement smart RSVP reminder draft workflow (human sends; AI drafts only)           | M      |
| P3-04 | Spike: evaluate LangChain vs. Semantic Kernel vs. custom orchestration               | M      |
| P3-05 | Implement confirmation-gate UI pattern for auto-drafted content                      | L      |
| P3-06 | Governance policy document for automated AI recommendation actions                   | M      |
| P3-07 | Integration tests covering the confirm-before-apply flow                             | M      |

**Technical architecture:**

- Background jobs use a queue (e.g., PostgreSQL-backed job table or lightweight queue) — no new infrastructure unless necessary
- All auto-drafted content is stored in a `draft` state; publishing requires explicit user action
- Agent orchestration (P3-04) is an exploratory spike only — adoption is gated on spike outcome and team review
- Third-party orchestration frameworks are not adopted without explicit architectural review and approval

**Exit criteria:**

- Zero auto-applied AI outputs without user confirmation (verified by integration tests)
- Background job failure rate ≤ 1% over 30-day observation window
- Governance policy document approved and committed to `docs/`
- Agent orchestration spike outcome documented before any adoption decision

**Risks:**

| Risk                                                   | Likelihood | Mitigation                                                                |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| Users ignoring draft recommendations (low adoption)    | Medium     | Track recommendation acceptance rate; adjust surfacing strategy           |
| Background job backlog under high load                 | Medium     | Implement dead-letter handling; job concurrency limits                    |
| Agent orchestration complexity exceeding team capacity | High       | Spike-first; adopt only if spike proves value and team consensus achieved |
| Automation audit trail gaps                            | Low        | Every background AI action logged to `ai_audit_log` before user sees it   |

---

## 6. Dependency Map

```
Phase 0 (MVP — #945–#966)
├── Grounded AI engine ──────────────────► Phase 1 (new workflow types)
├── AI safety controls ──────────────────► All phases (mandatory baseline)
├── AI privacy middleware ───────────────► All phases (mandatory baseline)
├── RBAC enforcement ────────────────────► All phases (mandatory baseline)
├── Structured output schemas ───────────► Phase 1, 2, 3 (extend, never replace)
└── Observability (ai_safety_events) ───► Phase 2 entry criterion

Phase 1 (Contextual Recommendations)
├── Extended prompt templates ───────────► Phase 2 (analytics prompt templates build on these)
├── Frontend copy-to-clipboard pattern ──► Phase 3 (reused by confirm-before-apply)
└── Unit test coverage baseline ─────────► Phase 2, 3 (test patterns established)

Phase 2 (Data-Driven Analytics)
├── Analytics aggregate queries ─────────► Phase 3 (reused by background jobs)
├── Privacy impact assessment ───────────► Phase 3 entry criterion
└── Read-replica / materialized views ──► Phase 3 (background job query targets)

Phase 3 (Automated Surfaces)
└── Agent orchestration spike ───────────► Future (not in current roadmap scope)
```

---

## 7. Privacy and Security Considerations

### 7.1 Permanent Controls (All Phases)

| Control                          | Implementation                                  | Reference                                         |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Prompt injection prevention      | `sanitiseInput` with threat categorisation      | `backend/src/lib/ai-safety.ts`                    |
| PII field exclusion from prompts | `ai-privacy-middleware.ts` field exclusion list | `backend/src/middleware/ai-privacy-middleware.ts` |
| Authenticated access only        | `authenticateToken` + `ai-rbac.ts`              | `backend/src/middleware/ai-rbac.ts`               |
| Per-user rate limiting           | `ai_rate_limits` PostgreSQL table               | `backend/src/controllers/ai-controller.ts`        |
| Output content safety validation | `validateAiOutput`                              | `backend/src/lib/ai-safety.ts`                    |
| No secrets in codebase           | Environment variables only                      | `.env` (never committed)                          |

### 7.2 Phase-Specific Privacy Controls

**Phase 1:**

- Marketing copy and invitation workflows must not include guest PII (email, full name) in prompts
- Invitation drafts are stored as application content, not in the AI audit log

**Phase 2:**

- All aggregate analytics payloads must be anonymised before AI injection
- Privacy impact assessment required before Phase 2 development begins
- GDPR data minimisation principle applied to every new aggregate query

**Phase 3:**

- Background recommendation jobs must log their trigger, payload hash, and output hash to `ai_audit_log` before surfacing to users
- No automated action may write to any application table without an explicit user-confirmation event logged alongside it

### 7.3 CodeQL and Security Scanning

- All new AI backend code must pass CodeQL analysis with zero new alerts before merge
- `npm audit` must report zero high-severity vulnerabilities
- OWASP Top 10 compliance required for all new endpoints

---

## 8. Observability and Governance Requirements

### 8.1 Required Observability Instrumentation (All Phases)

| Signal                                              | Storage                           | Purpose                           |
| --------------------------------------------------- | --------------------------------- | --------------------------------- |
| AI request (provider, context, latency, status)     | `ai_audit_log`                    | Usage analytics, cost attribution |
| Safety events (threat category, substitution count) | `ai_safety_events`                | Security monitoring               |
| Rate limit hits                                     | `ai_rate_limits`                  | Abuse detection                   |
| Structured output parse failures                    | Application log (structured JSON) | Schema drift detection            |
| RBAC denials                                        | Audit log (`AUDIT_ACTIONS`)       | Access control verification       |

### 8.2 Phase-Specific Observability Requirements

**Phase 1:** Response latency per new workflow type tracked; P95 ≤ 10 seconds.

**Phase 2:** Analytics query execution time logged separately from AI provider latency; query budget enforcement (reject > 3s queries).

**Phase 3:** Background job lifecycle events (enqueued, started, completed, failed) logged; recommendation acceptance rate tracked as a product metric.

### 8.3 Governance Framework

| Requirement                                                 | Phase | Owner                     |
| ----------------------------------------------------------- | ----- | ------------------------- |
| All AI features gated behind `ai.access` RBAC permission    | 0–3   | Backend team              |
| Human-in-the-loop confirmation for all AI-suggested writes  | 0–3   | Product + Frontend team   |
| Privacy impact assessment before analytics features         | 2     | Privacy/Security owner    |
| Governance policy for automated actions                     | 3     | Tech lead + Product owner |
| Quarterly AI capability review against requirement baseline | 1–3   | Tech lead                 |

---

## 9. Feature Gating and Rollout Constraints

### 9.1 Feature Flag Strategy

Each phase's capabilities are gated behind environment-variable flags following the existing pattern in `docs/ai-capability.md`:

| Flag                            | Type    | Default | Purpose                                       |
| ------------------------------- | ------- | ------- | --------------------------------------------- |
| `AI_PHASE1_INVITATION_ENABLED`  | boolean | `false` | Enable invitation/marketing copy workflow     |
| `AI_PHASE1_EXTENDED_CONTEXTS`   | boolean | `false` | Enable venue/logistics and follow-up contexts |
| `AI_PHASE2_ANALYTICS_ENABLED`   | boolean | `false` | Enable data-driven analytics recommendations  |
| `AI_PHASE3_BACKGROUND_JOBS`     | boolean | `false` | Enable background recommendation generation   |
| `AI_PHASE3_AGENT_ORCHESTRATION` | boolean | `false` | Enable agent orchestration (spike only)       |

### 9.2 Rollout Sequence

```
develop → test → stage → main
```

Each phase change must traverse the full branch progression. No phase capability is enabled in `main` until it has completed the full CI pipeline on `test` and `stage`.

### 9.3 Rollback Procedure

All phase features are flag-controlled. Rollback is performed by setting the relevant flag to `false` in the target environment. No data migration is required for rollback unless Phase 2 analytics DDL changes have been applied (in which case, the migration must be reversible).

---

## 10. Success Metrics and Validation Strategy

### 10.1 Phase 1 Success Metrics

| Metric                                | Target                                            | Measurement                         |
| ------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| New workflow type adoption rate       | ≥ 20% of AI-enabled users within 30 days          | `ai_audit_log` context distribution |
| Invitation workflow user satisfaction | ≥ 70% copy-to-clipboard usage (proxy for utility) | Frontend analytics event            |
| Safety incident rate for new contexts | 0 unmitigated safety events                       | `ai_safety_events` table            |
| P95 response latency                  | ≤ 10 seconds                                      | `ai_audit_log` latency field        |

### 10.2 Phase 2 Success Metrics

| Metric                            | Target                               | Measurement                            |
| --------------------------------- | ------------------------------------ | -------------------------------------- |
| Analytics recommendation accuracy | ≥ 60% recommendations rated "useful" | Optional in-app thumbs-up/down         |
| Aggregate query performance       | P95 ≤ 3 seconds                      | Backend structured log                 |
| PII leakage incidents             | 0                                    | Privacy audit, `ai-privacy` test suite |
| Adoption among Organiser role     | ≥ 30% within 60 days of release      | RBAC-scoped `ai_audit_log`             |

### 10.3 Phase 3 Success Metrics

| Metric                          | Target                                           | Measurement                            |
| ------------------------------- | ------------------------------------------------ | -------------------------------------- |
| Draft task-list acceptance rate | ≥ 40% (user publishes AI draft with ≤ 20% edits) | Application event log                  |
| Background job reliability      | ≥ 99% success rate                               | Job lifecycle log                      |
| Zero auto-applied writes        | 100% writes have confirmation event              | Integration test assertion + audit log |
| User opt-out rate               | ≤ 10% per 30-day window                          | Feature flag usage analytics           |

---

## 11. Integration Points with Existing AI Workflows

### 11.1 Endpoint Integration

All new recommendation workflows extend the existing `POST /api/ai/grounded` endpoint. New `workflowType` values are added additively; existing behaviour is unchanged.

```
Existing:  workflowType: "event" | "task" | "rsvp"
Phase 1:   + "invitation" | "marketing-copy" | "venue-logistics" | "rsvp-followup"
Phase 2:   + "analytics" | "capacity-analysis" | "scheduling"
Phase 3:   + "task-draft" | "rsvp-reminder" (background-initiated only)
```

### 11.2 Middleware Integration

The existing middleware chain applies to all phases without modification:

```
authenticateToken → ai-rbac → ai-privacy-middleware → ai-controller
```

Phase-specific feature flag checks are inserted in the controller before workflow dispatch, not in middleware, to keep the middleware chain stable and auditable.

### 11.3 Schema Integration

Structured output schemas in `backend/src/lib/ai-schemas.ts` are extended with new interfaces per phase. Existing schema interfaces are never removed or modified in a breaking way.

### 11.4 Frontend Integration

The existing `frontend/src/components/ai/ai-assistant.tsx` context selector is extended to surface new workflow types when the corresponding feature flag is enabled. Phase 3 confirmation-gate UI is implemented as a new component, not as a modification to the existing chat widget.

---

## 12. Technical Debt Considerations

| Item                                                     | Phase Introduced | Risk Level | Mitigation                                                                                      |
| -------------------------------------------------------- | ---------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| Hardcoded `SYSTEM_PROMPTS` in `ai-controller.ts`         | Phase 0          | Medium     | Phase 1: Extract prompt templates to a dedicated `ai-prompt-templates.ts` module                |
| `workflowType` string union growing without bound        | Phase 1          | Low        | Phase 2: Move to a registered workflow registry pattern                                         |
| PostgreSQL handling both OLTP and analytics queries      | Phase 2          | High       | Phase 2: Provision read-replica or materialised views; plan analytics store migration if needed |
| Feature flags as raw environment variables               | Phase 1          | Low        | Phase 2: Consider a lightweight feature flag service if flag count exceeds 10                   |
| No A/B testing infrastructure for recommendation quality | Phase 2          | Medium     | Phase 3: Implement thumbs-up/down signal collection before automated tuning                     |

---

## 13. Ownership and Responsibility Boundaries

| Area                                  | Owner                     | Phase          |
| ------------------------------------- | ------------------------- | -------------- |
| AI backend controllers and middleware | Backend team              | 0–3            |
| AI prompt template design             | Product + Backend team    | 1–3            |
| Privacy impact assessments            | Security / Privacy owner  | 2, 3           |
| Frontend recommendation surfaces      | Frontend team             | 1–3            |
| Observability dashboards              | Platform / DevOps team    | 2, 3           |
| Governance policy documentation       | Tech lead + Product owner | 3              |
| RBAC permission configuration         | Backend team + Admin      | 0–3            |
| Feature flag management               | DevOps / Platform team    | 1–3            |
| Agent orchestration evaluation        | Tech lead                 | 3 (spike only) |

---

## 14. Future Scalability Considerations

- **Token cost management:** As recommendation complexity grows, implement token budget enforcement per workflow type. Phase 2 analytics payloads are the primary risk vector.
- **Provider diversification:** Phase 0 supports Azure OpenAI + OpenAI fallback. Phase 3 agent orchestration spike may evaluate additional providers, but provider diversity is additive only — existing provider logic is not replaced.
- **Model versioning:** As Azure OpenAI deployment versions are updated, test coverage must include regression assertions against known-good structured outputs to detect schema drift.
- **Multi-tenant scalability:** Rate limit architecture (PostgreSQL-backed per-user counters) scales horizontally with multiple backend replicas. Phase 2 analytics queries must be designed to remain within PostgreSQL read-path capacity as event volume grows.
- **Streaming responses:** Phase 1 and 2 recommendations use request/response semantics. If response latency becomes a user experience concern in Phase 2+, streaming (`text/event-stream`) can be added to the grounded endpoint without changing the client contract for non-streaming consumers.

---

## 15. Operational Constraints

- **Stack freeze:** No framework migration (Next.js, Remix, etc.) is permitted in any phase. All AI features remain on Vite + React Router + Express + PostgreSQL.
- **Human-in-the-loop:** No phase may introduce an AI-to-write-path flow without an explicit user confirmation step. This constraint is not relaxed by any phase plan revision.
- **No third-party AI agents in production:** Agent orchestration frameworks (LangChain, Semantic Kernel) are exploratory only until a spike (P3-04) produces a team-reviewed adoption recommendation.
- **Environment variable configuration only:** No AI provider credentials, model names, or deployment identifiers are hardcoded. All provider configuration remains in environment variables.
- **CI gate compliance:** Every PR for any phase must pass: build, lint, type-check, unit tests, and CodeQL scanning with zero new alerts before merge.
- **Allowed non-blocking failures (infrastructure-only):** E2E Tests (Playwright), Lighthouse CI Gate, and Load Test / k6 Smoke may fail in CI due to deployment infrastructure without blocking merge, provided all other gates pass.

---

_Document owned by: [nikhilpatel15](https://github.com/nikhilpatel15)_
_Last updated: 2026-05-27_
_Next review: After Phase 1 entry criteria are met_
