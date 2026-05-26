# AI Capability — Festival Event Planner

> **Task #947 — Expand AI Assistant With Grounded Workflow Support**
>
> This document captures environment variables, feature boundaries, rollout
> constraints, and observability requirements for the AI capabilities delivered
> on the current Vite + React Router + Express stack.

---

## Supported AI Providers

The backend prefers **Azure OpenAI** and falls back to **OpenAI** when Azure
is not configured. If neither provider is configured the endpoints return
`503 Service Unavailable` with a clear error message.

| Variable                                | Required    | Description                                      |
| --------------------------------------- | ----------- | ------------------------------------------------ |
| `AZURE_OPENAI_ENDPOINT` (or `ENDPOINT`) | Azure only  | Base URL of your Azure OpenAI resource           |
| `AZURE_OPENAI_API_KEY` (or `API_KEY`)   | Azure only  | API key for the resource                         |
| `AZURE_OPENAI_DEPLOYMENT`               | Azure only  | Deployment / model name (default: `gpt-4o-mini`) |
| `AZURE_OPENAI_API_VERSION`              | Azure only  | API version (default: `2024-02-15-preview`)      |
| `OPENAI_API_KEY`                        | OpenAI only | API key for OpenAI                               |
| `OPENAI_MODEL`                          | OpenAI only | Model name (default: `gpt-4o-mini`)              |

---

## Endpoints

### `POST /api/ai/suggest`

Prompt-only suggestions endpoint. Accepts a free-form user prompt and an
optional context hint.

**Request body:**

```json
{
  "context": "event | task | rsvp | general",
  "prompt": "string (max 2 000 chars after sanitisation)"
}
```

**Response:**

```json
{ "suggestion": "string" }
```

---

### `POST /api/ai/grounded` _(new — Task #947)_

Grounded workflow endpoint. Fetches live application data (event details,
task list, or RSVP statistics) **before** calling the AI model so suggestions
are anchored to real planner context. Returns both a validated **structured
JSON object** and the raw model response for traceability.

**Request body:**

```json
{
  "workflowType": "event | task | rsvp",
  "entityId": 123,
  "prompt": "string"
}
```

**Response:**

```json
{
  "workflowType": "event",
  "entityId": 123,
  "structured": {
    "title": "...",
    "description": "...",
    "venueType": "...",
    "promotionalTips": ["...", "...", "..."]
  },
  "raw": "raw model output string"
}
```

**Structured output schemas by workflow type:**

| Workflow | Schema                                                  |
| -------- | ------------------------------------------------------- |
| `event`  | `{ title, description, venueType, promotionalTips[] }`  |
| `task`   | `{ actionTitle, dueDateRange, owner, dependencies[] }`  |
| `rsvp`   | `{ confirmationMessage, reminderMessage, capacityTip }` |

If the model returns malformed JSON the `structured` field will be an empty
object `{}` and the full raw response is still returned for inspection.

---

## Rate Limiting

All AI endpoints enforce a **20 requests per user per rolling 1-hour window**,
persisted in the `ai_rate_limits` database table. This survives server
restarts and is enforced consistently across replicas.

Clients that exceed the budget receive `429 Too Many Requests`.

---

## Prompt Safety

All user-supplied prompt text passes through `sanitisePrompt()` before being
sent to the model:

- Common prompt-injection phrases (`ignore previous instructions`, etc.) are
  replaced with `[FILTERED]`
- HTML tags are stripped
- Input is truncated to 2 000 characters

---

## Observability

All **grounded workflow** requests are logged to the `ai_request_logs`
database table (added in v25 migration — Task #947):

| Column          | Description                                               |
| --------------- | --------------------------------------------------------- |
| `user_id`       | Authenticated user (nullable — SET NULL on user deletion) |
| `workflow_type` | `event`, `task`, or `rsvp`                                |
| `entity_id`     | The event/entity ID used to ground the request            |
| `provider`      | `azure` or `openai`                                       |
| `duration_ms`   | End-to-end latency for the AI call                        |
| `status`        | `success` or `error`                                      |
| `error_message` | Provider error detail (populated on failure)              |
| `requested_at`  | UTC timestamp of the request                              |

Log writes are **best-effort** — a log failure will not fail the AI request.

---

## Authentication & Access Control

- Both AI endpoints require a valid JWT (`authenticateToken` middleware).
- Unauthenticated requests receive `401 Unauthorized`.
- Rate limits are tracked per authenticated user ID.

---

## Feature Boundaries (In Scope)

| Feature                               | Status                                |
| ------------------------------------- | ------------------------------------- |
| Free-form chat (prompt-only)          | ✅ Implemented                        |
| Grounded event workflow               | ✅ Implemented                        |
| Grounded task workflow                | ✅ Implemented                        |
| Grounded RSVP workflow                | ✅ Implemented                        |
| Structured JSON output validation     | ✅ Implemented                        |
| AI request observability logging      | ✅ Implemented                        |
| Per-user rate limiting (DB-persisted) | ✅ Implemented                        |
| Prompt injection sanitisation         | ✅ Implemented                        |
| Human-in-the-loop (no auto-apply)     | ✅ By design — output is display-only |

## Feature Boundaries (Out of Scope)

| Feature                                           | Reason                                    |
| ------------------------------------------------- | ----------------------------------------- |
| Auto-applying AI suggestions to event/task fields | Requires explicit user action per design  |
| AI-generated images or media                      | Out of scope for current stack            |
| Streaming/SSE responses                           | Not required by acceptance criteria       |
| Model fine-tuning                                 | Infrastructure concern, not product scope |
| Framework migration (Next.js, etc.)               | Explicitly excluded — current stack only  |

---

## Rollout Constraints

1. **Provider configuration is optional at boot** — the application starts
   normally even with no AI keys set. Users see a clear `503` when they try
   to use AI features without a configured provider.
2. **No environment-specific feature flags are required** — provider selection
   is fully driven by environment variables.
3. **The `ai_request_logs` table is created by the v25 idempotent migration**
   — no manual SQL is required on existing deployments.
4. **AI output is never automatically applied** — the frontend renders
   structured suggestions for the planner to review and act on manually.

---

## Related Work Items

- Theme #945 — AI Assistance for Festival Planning
- Story #946 — AI Assistant for Event Planners
- Story #948 — Define AI Requirement Baseline and Traceability
- Task #947 — Expand AI Assistant With Grounded Workflow Support _(this PR)_
- Task #925/#926 — Previous AI hardening work
