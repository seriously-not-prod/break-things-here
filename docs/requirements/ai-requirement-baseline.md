# AI Requirement Baseline and Traceability

**Document Version:** 1.0
**Created:** 2026-05-26
**Story:** [#948 — Define AI Requirement Baseline and Traceability](https://github.com/seriously-not-prod/break-things-here/issues/948)
**Parent Theme:** [#945 — AI Assistance Expansion](https://github.com/seriously-not-prod/break-things-here/issues/945)
**Stack:** Vite + React Router + Express + PostgreSQL (current authoritative stack)

---

## 1. Purpose

This document establishes the structured AI requirement baseline for the Festival & Event Planner application. It converts all AI-related signals from the existing requirements corpus into explicit, measurable, traceable requirements aligned with the current stack.

The document satisfies the acceptance criteria of Story #948:

- AI requirement set documented with scope, in-scope, and out-of-scope boundaries.
- Every AI requirement maps to one or more implementation stories or tasks.
- Existing AI functionality classified as `Implemented`, `Partial`, or `Missing`.
- Ambiguous requirement statements clarified with measurable acceptance criteria.

---

## 2. Scope

### 2.1 In-Scope (Current Stack — Supported Capability)

The following AI capabilities are within scope for the current Vite + React Router + Express + PostgreSQL stack:

| Capability | Description |
|---|---|
| AI Planning Assistant UI | Floating chat widget accessible from any authenticated page |
| Context-aware suggestions | Suggestions scoped to `event`, `task`, `rsvp`, and `general` contexts |
| Azure OpenAI provider | Primary AI provider via Azure OpenAI REST API |
| OpenAI provider fallback | Fallback provider when Azure OpenAI is not configured |
| Per-user rate limiting | 20 AI requests per rolling 1-hour window, persisted in the database |
| Prompt injection sanitization | Server-side sanitization of user input before sending to AI provider |
| Authenticated access enforcement | AI endpoint requires a valid session token (`authenticateToken` middleware) |
| Graceful provider error handling | Clear loading, error, and empty states in the frontend; actionable error responses from the backend |
| Environment-based provider configuration | Provider selection and credentials via environment variables; no secrets in code |
| Grounded workflow support | AI responses informed by live planner context (event, task, RSVP data) passed in the prompt |

### 2.2 Out-of-Scope (Future Phases — Not Included in Current Implementation)

The following AI capabilities are explicitly out of scope for the current development phase. They remain listed under future phases in `docs/requirements/REQUIREMENTS_BASELINE.md` §6.3:

| Capability | Reason |
|---|---|
| AI-powered event recommendations engine | Requires dedicated ML pipeline; deferred to future phase |
| Automated AI output application without user confirmation | Human-in-the-loop policy; AI suggestions require explicit user action |
| Advanced analytics with machine learning insights | Deferred to future phase |
| Auto-assignment or auto-scheduling based on AI output | Outside current stack scope |
| Framework migration (e.g., Next.js) to support AI features | Stack freeze; current Vite + Express stack is authoritative |
| AI-generated invitations or marketing copy | Deferred to future phase |
| Third-party AI agent orchestration (LangChain, Semantic Kernel, etc.) | Not required for current scope |

### 2.3 Stack Constraint

> All AI features must remain within the current **Vite + React Router + Express + PostgreSQL** architecture. No framework migration is permitted as part of AI expansion work.

---

## 3. AI Requirement Set

### AI-REQ-001 — AI Planning Assistant Availability

**Priority:** High
**Status:** Implemented

**Statement:**
The application must provide an AI planning assistant accessible to all authenticated users from any page in the application.

**Measurable Acceptance Criteria:**
- A floating action button labelled "AI Planning Assistant" is visible on all authenticated pages.
- The assistant panel opens and closes without navigating away from the current page.
- The assistant is only accessible to authenticated users; unauthenticated access returns HTTP 401.

**Implementation Reference:**
- Frontend: `frontend/src/components/ai/ai-assistant.tsx`
- Backend route: `POST /api/ai/suggest` (protected by `authenticateToken`)

---

### AI-REQ-002 — Context-Aware Suggestions

**Priority:** High
**Status:** Implemented

**Statement:**
The AI assistant must support context-aware suggestions for at least four planner domains: event planning, task management, RSVP management, and general planning.

**Measurable Acceptance Criteria:**
- The assistant exposes a context selector with exactly four values: `event`, `task`, `rsvp`, `general`.
- Each context maps to a distinct system prompt that constrains the AI response to the selected domain.
- Selecting a context and sending a prompt returns a response relevant to that domain within 10 seconds under normal network conditions.
- An invalid or missing context value defaults to `general` without returning an error.

**Implementation Reference:**
- Frontend context selector: `frontend/src/components/ai/ai-assistant.tsx` (`CONTEXT_LABELS`)
- Backend system prompts: `backend/src/controllers/ai-controller.ts` (`SYSTEM_PROMPTS`)

---

### AI-REQ-003 — Provider Configuration and Fallback

**Priority:** High
**Status:** Implemented

**Statement:**
The backend must support Azure OpenAI as the primary AI provider, with OpenAI as an automatic fallback. Provider selection must be driven entirely by environment variables with no secrets in the codebase.

**Measurable Acceptance Criteria:**
- When `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY` (or their aliases `ENDPOINT` / `API_KEY`) are set, the backend routes requests to Azure OpenAI.
- When Azure OpenAI variables are absent and `OPENAI_API_KEY` is set, the backend routes requests to OpenAI.
- When Azure OpenAI variables are only partially set, the backend returns HTTP 503 with a descriptive error identifying the missing variable(s).
- When neither provider is configured, the backend returns HTTP 503 with configuration instructions.
- No API key or secret appears in any committed file.

**Implementation Reference:**
- `backend/src/controllers/ai-controller.ts` (`resolveAiProviderConfig`, `readEnv`)
- `backend/__tests__/ai-controller.test.ts` (provider selection test cases)

---

### AI-REQ-004 — Per-User Rate Limiting

**Priority:** High
**Status:** Implemented

**Statement:**
The AI endpoint must enforce per-user rate limiting to prevent abuse and control AI provider costs.

**Measurable Acceptance Criteria:**
- Each authenticated user is limited to 20 AI requests per rolling 1-hour window.
- Rate limit state is persisted in the `ai_rate_limits` database table so it survives server restarts and is consistent across multiple backend replicas.
- A user who exceeds the limit receives HTTP 429 with the message: `"AI rate limit exceeded. You can make 20 AI requests per hour."`
- Rate limit resets automatically after the 1-hour window has elapsed from the first request in the window.

**Implementation Reference:**
- `backend/src/controllers/ai-controller.ts` (`checkAiRateLimit`, `AI_RATE_LIMIT_PER_HOUR`, `AI_RATE_LIMIT_WINDOW_MS`)
- `backend/src/db/database.ts` (`ai_rate_limits` table DDL)

---

### AI-REQ-005 — Prompt Injection Sanitization

**Priority:** High
**Status:** Implemented

**Statement:**
All user-supplied prompt text must be sanitized server-side before being forwarded to any AI provider to prevent prompt injection attacks.

**Measurable Acceptance Criteria:**
- The following patterns are replaced with `[FILTERED]` before forwarding: `ignore previous instructions`, `you are now`, `system prompt`, `[SYSTEM]`, and HTML/XML tags.
- Prompt input is truncated to a maximum of 2000 characters.
- Sanitization occurs on the server; the frontend does not rely on client-side filtering as the only control.

**Implementation Reference:**
- `backend/src/controllers/ai-controller.ts` (`sanitisePrompt`)

---

### AI-REQ-006 — Input Validation

**Priority:** Medium
**Status:** Implemented

**Statement:**
The AI endpoint must validate all required request fields before processing and return clear error responses for invalid input.

**Measurable Acceptance Criteria:**
- A request with an empty or missing `prompt` field returns HTTP 400 with the message: `"prompt is required."`
- The `context` field accepts only the four known values; any other value silently defaults to `general`.
- Validation occurs before any AI provider call is made.

**Implementation Reference:**
- `backend/src/controllers/ai-controller.ts` (`getSuggestion`, `VALID_CONTEXTS`)

---

### AI-REQ-007 — AI Error Handling and Observability

**Priority:** Medium
**Status:** Partial

**Statement:**
The application must handle AI provider failures gracefully and surface actionable feedback to the user. AI errors must be observable through the backend logging system.

**Measurable Acceptance Criteria:**
- A network or upstream AI provider failure returns HTTP 502 with a descriptive error message.
- The frontend displays a visible error state (not a blank or frozen UI) when the AI request fails.
- Provider misconfiguration errors return HTTP 503 with instructions identifying the missing configuration.
- Backend logs capture AI error events with enough context for diagnosis (provider type, error message, timestamp).

**Current Gap:**
- HTTP 502/503 responses and frontend error display are implemented.
- Structured backend observability logging for AI errors is not yet consistently emitted. AI error events are not captured in a dedicated observability channel.

**Implementation Reference:**
- Frontend error state: `frontend/src/components/ai/ai-assistant.tsx` (catch block, `⚠️` message)
- Backend error response: `backend/src/controllers/ai-controller.ts` (502/503 handlers)

**Linked Task for Gap Closure:** #947

---

### AI-REQ-008 — Authenticated Access Enforcement

**Priority:** High
**Status:** Implemented

**Statement:**
All AI endpoints must require a valid authenticated session. Unauthenticated requests must be rejected before any AI provider call is made.

**Measurable Acceptance Criteria:**
- `POST /api/ai/suggest` returns HTTP 401 for requests without a valid session token.
- The `authenticateToken` middleware is applied before the `getSuggestion` handler in the route definition.
- No AI provider request is initiated for unauthenticated calls.

**Implementation Reference:**
- `backend/src/routes/api-routes.ts` (line: `router.post('/ai/suggest', authenticateToken, aiController.getSuggestion)`)

---

### AI-REQ-009 — Grounded Workflow Context

**Priority:** Medium
**Status:** Partial

**Statement:**
At least one AI-assisted workflow must use live application data (event, task, or RSVP records) as grounding context rather than relying solely on free-text user prompts.

**Measurable Acceptance Criteria:**
- The AI request payload for at least one planner domain includes structured data from the application (e.g., event name, task status, RSVP count) in addition to the user's free-text prompt.
- Grounded context is passed as part of the system prompt or user message, not as a separate API call from the frontend.
- The response is demonstrably more relevant to the actual planner state than a generic prompt-only response.

**Current Gap:**
- The current implementation passes only a static system prompt and the user's free-text input. No live application data is injected as grounding context. This gap is the primary scope of Story #946 and Task #947.

**Implementation Reference:**
- Current: `backend/src/controllers/ai-controller.ts` (`SYSTEM_PROMPTS`, `getSuggestion`)
- Target: Story #946, Task #947

---

### AI-REQ-010 — Frontend Loading and Empty States

**Priority:** Medium
**Status:** Implemented

**Statement:**
The AI assistant frontend must expose clear loading, empty, and error states for all AI interactions.

**Measurable Acceptance Criteria:**
- A loading indicator is visible while an AI request is in-flight.
- An empty state message is shown when no conversation messages exist.
- An error message is shown inline in the chat when the AI request fails.
- The send button and input field are disabled while a request is in-flight to prevent duplicate submissions.

**Implementation Reference:**
- `frontend/src/components/ai/ai-assistant.tsx` (`loading` state, `CircularProgress`, empty state `Typography`, catch block)

---

### AI-REQ-011 — Structured Output Format

**Priority:** Low
**Status:** Partial

**Statement:**
At least one AI-assisted flow must return a structured or reusable response format suitable for planner workflows (e.g., a list of tasks, a set of RSVP message variants) rather than only unstructured prose.

**Current Gap:**
- All current responses are unstructured prose text. No workflow returns a parsed structured format (JSON, list, table). This is in scope for Story #946 / Task #947.

**Measurable Acceptance Criteria:**
- At least one context (e.g., `task`) returns a response where the assistant provides output in a recognizable structured pattern (numbered list, named fields) that the frontend can render distinctly.
- The structured format is documented as part of the system prompt for that context.

**Linked Task for Gap Closure:** #947

---

### AI-REQ-012 — Environment Variable Documentation

**Priority:** Medium
**Status:** Partial

**Statement:**
All environment variables required for AI functionality must be documented in the project's environment configuration reference and contribution guidance.

**Measurable Acceptance Criteria:**
- The root `.env.example` or equivalent documents all AI-related variables: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `ENDPOINT`, `API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
- `CONTRIBUTING.md` or a developer setup guide references AI provider configuration steps.
- Docker Compose passes AI environment variables to the backend container.

**Current Gap:**
- Docker Compose AI env wiring and alias fallback is the subject of Story #926 / Task #925. Partial progress exists.

**Linked Issues:** #925, #926

---

## 4. Implementation Status Summary

| Requirement | Description | Status |
|---|---|---|
| AI-REQ-001 | AI assistant availability (authenticated pages) | Implemented |
| AI-REQ-002 | Context-aware suggestions (4 domains) | Implemented |
| AI-REQ-003 | Provider configuration and fallback (Azure / OpenAI) | Implemented |
| AI-REQ-004 | Per-user rate limiting (20/hour, DB-persisted) | Implemented |
| AI-REQ-005 | Prompt injection sanitization | Implemented |
| AI-REQ-006 | Input validation | Implemented |
| AI-REQ-007 | AI error handling and observability | Partial |
| AI-REQ-008 | Authenticated access enforcement | Implemented |
| AI-REQ-009 | Grounded workflow context | Partial |
| AI-REQ-010 | Frontend loading and empty states | Implemented |
| AI-REQ-011 | Structured output format | Partial |
| AI-REQ-012 | Environment variable documentation | Partial |

**Implemented:** 7 / 12
**Partial:** 4 / 12 (AI-REQ-007, AI-REQ-009, AI-REQ-011, AI-REQ-012)
**Missing:** 0 / 12

---

## 5. Requirements Traceability Matrix

| Requirement | GitHub Issue(s) | Type | Notes |
|---|---|---|---|
| AI-REQ-001 | #908, #554 | Task / Bug | Re-enable AI assistant; Azure compat |
| AI-REQ-002 | #908, #947 | Task | Context selector and system prompts |
| AI-REQ-003 | #908, #925, #926 | Task / Story | Provider config, alias fallback |
| AI-REQ-004 | #908 | Task | Rate limit implementation |
| AI-REQ-005 | #908 | Task | Prompt injection sanitization |
| AI-REQ-006 | #908 | Task | Input validation |
| AI-REQ-007 | #947 | Task | Observability gap to close |
| AI-REQ-008 | #908 | Task | Auth middleware |
| AI-REQ-009 | #946, #947 | Story / Task | Grounded workflow — primary gap |
| AI-REQ-010 | #908, #947 | Task | Frontend states |
| AI-REQ-011 | #946, #947 | Story / Task | Structured output — in scope for #947 |
| AI-REQ-012 | #925, #926 | Task / Story | Docker env wiring |
| **Baseline doc** | **#948** | **Story** | **This document** |

### Parent Hierarchy

```
Theme #945 — AI Assistance Expansion
├── Story #946 — Expand AI Assistant Into Grounded Planning Workflows
│   └── Task #947 — Expand AI assistant with grounded workflow support
├── Story #948 — Define AI Requirement Baseline and Traceability  ← THIS STORY
├── Story #926 — Docker AI env compatibility
│   └── Task #925 — Fix Docker AI env wiring and alias fallback
└── (Historical) Task #908 — Re-enable AI assistant with Azure OpenAI compatibility
```

---

## 6. Clarifications on Previously Ambiguous Requirements

### 6.1 `REQUIREMENTS_BASELINE.md` §6.3 — "AI-powered event recommendations and optimization" listed as Out of Scope

**Original statement (§6.3):**
> AI-powered event recommendations and optimization

**Clarification:**
This entry refers to an unsupervised AI recommendation engine (e.g., suggesting events based on behavioural patterns). This remains out of scope.

The **AI Planning Assistant** (an interactive, user-driven chat assistant) is a distinct capability that is **in scope** and has been implemented. The requirements baseline document must distinguish between:
- **In scope:** Interactive AI assistant responding to explicit user prompts within the planner context.
- **Out of scope:** Automated, unsolicited AI recommendations based on ML inference.

### 6.2 `REQUIREMENTS_BASELINE.md` §1.2 — "Serve as a hands-on learning platform for AI-assisted development"

**Original statement:**
> 3. Serve as a hands-on learning platform for AI-assisted development

**Clarification:**
This business goal refers to the use of AI developer tools (e.g., GitHub Copilot) during development, not to AI features within the application itself. It does not create a functional requirement for in-app AI features.

### 6.3 Story #946 — "AI workflows are mapped to event, task, RSVP, and other relevant planner domains"

**Original statement (acceptance criteria):**
> AI workflows are mapped to event, task, RSVP, and other relevant planner domains.

**Clarification:**
"Mapped" means the AI assistant exposes a context selector for each domain AND the system prompt for each domain is tailored to guide responses relevant to that domain. This is satisfied by AI-REQ-002. It does not require deep data integration (that is AI-REQ-009, addressed in Task #947).

### 6.4 Task #947 — "At least one grounded workflow using live application data"

**Original statement:**
> The assistant supports at least one grounded workflow using live application data instead of prompt-only text.

**Clarification:**
"Grounded" means the backend enriches the AI request with structured application data (e.g., event name, date, guest count, task list) retrieved from the database before calling the AI provider. The minimum viable definition of done is: one context type (e.g., `event`) reads at least one field from the database and includes it in the prompt sent to the AI provider.

**Measurable acceptance criteria added:**
- The `event` context, when an `eventId` is supplied in the request body, fetches event name, date, and guest count from the database and includes them in the system or user message.
- If `eventId` is not supplied, the request falls back to prompt-only behaviour without error.
- A backend unit test verifies that the database read is performed and the resulting data appears in the provider request body.

---

## 7. Assumptions and Technical Decisions

| Decision | Rationale |
|---|---|
| Azure OpenAI is the primary provider | Aligns with existing Azure Entra ID infrastructure and organisational Azure tenancy |
| OpenAI is the fallback provider | Provides a usable configuration path for local development without Azure credentials |
| Rate limit stored in PostgreSQL | Ensures consistency across replicas and survives restarts; avoids in-process state |
| Prompt sanitization is server-side only | Client-side validation is informational; the server is the trust boundary |
| Human-in-the-loop for all AI output | AI suggestions are presented; the user explicitly applies them. Auto-application is out of scope |
| Stack freeze (no framework migration) | Stability and training workflow consistency take precedence over framework alignment with original TRD |
| `ai_rate_limits` table owned by backend DB init | Avoids a separate migration script; table is idempotent on re-init |

---

## 8. Changelog

| Date | Author | Change |
|---|---|---|
| 2026-05-26 | nikhilpatel15 | Initial document created under Story #948 |
