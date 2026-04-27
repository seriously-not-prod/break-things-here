# Festival Event Planner — Team Development Guide

> **5-Member Team | Full-Stack TypeScript | React + Node.js + SQLite**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Team Roles & Responsibilities](#3-team-roles--responsibilities)
4. [Repository Structure](#4-repository-structure)
5. [Environment Setup](#5-environment-setup)
6. [Development Workflow](#6-development-workflow)
7. [Branch Strategy](#7-branch-strategy)
8. [Work Item Hierarchy](#8-work-item-hierarchy)
9. [Coding Standards](#9-coding-standards)
10. [Testing Requirements](#10-testing-requirements)
11. [Definition of Done](#11-definition-of-done)
12. [Communication & Meetings](#12-communication--meetings)
13. [Related Documents](#13-related-documents)

---

## 1. Project Overview

The **Festival Event Planner** is a web application that allows organisers to plan, manage, and promote festival events. It supports event creation, task assignment, RSVP collection, user role-based access control, and an admin dashboard.

### Core Capabilities

| Capability | Description |
|---|---|
| Authentication | Register, login, JWT sessions, remember-me, password reset |
| Event Management | Create/edit/delete events with Draft → Active → Completed lifecycle |
| Task Management | Assign tasks to team members per event with due dates |
| RSVP Management | Internal and public RSVP collection per event |
| User Profiles | Profile photos, bio, contact details, email change |
| Role-Based Access | Attendee → Organizer → Admin permission tiers |
| Admin Dashboard | User management, role assignment, system audit log |
| Analytics | Dashboard stats — active events, pending tasks, recent RSVPs |

---

## 2. Tech Stack

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 (functional components + hooks) |
| Language | TypeScript 5 (strict mode) |
| UI Library | Material UI (MUI) v6 |
| Routing | React Router v6 |
| Build Tool | Vite |
| Testing | Vitest + React Testing Library |

### Backend

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 |
| Framework | Express 4 |
| Language | TypeScript 5 (strict mode) |
| Database | SQLite (via `sqlite` + `sqlite3`) |
| Auth | JWT (access + refresh tokens) + bcrypt |
| File Uploads | Multer (profile photos) |
| Rate Limiting | express-rate-limit |
| Testing | Vitest |

### Infrastructure / DevOps

| Area | Technology |
|---|---|
| Containerisation | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Branch Model | 4-tier: `develop` → `test` → `stage` → `main` |
| Package Manager | npm workspaces |

---

## 3. Team Roles & Responsibilities

### Suggested 5-Member Assignment

| Member | Role | Primary Modules | Branch Prefix |
|---|---|---|---|
| **Member 1** | Tech Lead / Auth | Authentication, Sessions, Security | `feature/auth-*` |
| **Member 2** | Backend Dev | Events, Tasks, RSVPs APIs | `feature/events-*`, `feature/tasks-*` |
| **Member 3** | Frontend Dev | Event UI, Dashboard, RSVP forms | `feature/ui-events-*` |
| **Member 4** | Full-Stack Dev | User Profiles, Admin panel | `feature/profile-*`, `feature/admin-*` |
| **Member 5** | QA / DevOps | Tests, CI/CD pipelines, Automation | `bugfix/*`, `chore/*` |

### Role Responsibilities

**Tech Lead (Member 1)**
- Reviews all PRs targeting `develop`
- Owns architecture decisions
- Maintains API contracts and type definitions in `src/types/`
- Approves `develop` → `test` promotions

**Backend Dev (Member 2)**
- Owns `backend/src/controllers/`, `backend/src/routes/`
- Writes unit + integration tests for all API endpoints
- Keeps `backend/src/db/database.ts` migrations up to date

**Frontend Dev (Member 3)**
- Owns `frontend/src/components/` UI components
- Writes component tests with React Testing Library
- Coordinates with Member 2 on API contracts before building UI

**Full-Stack Dev (Member 4)**
- Owns profile and admin features end-to-end
- Manages `src/types/` shared type definitions
- Coordinates user role changes with Member 1

**QA / DevOps (Member 5)**
- Owns `.github/workflows/`
- Maintains `jest.config.js`, `vitest.config.ts`
- Ensures branch protection rules and auto-sync workflows are healthy
- Triages CI failures and notifies the team

---

## 4. Repository Structure

```
break-things-here/
├── .github/
│   ├── workflows/         # All CI/CD pipelines
│   ├── ISSUE_TEMPLATE/    # Issue templates (Theme, Story, Task, Bug…)
│   ├── copilot-instructions.md
│   └── universal-agent-guide.md
├── backend/
│   ├── src/
│   │   ├── controllers/   # Route handler logic
│   │   ├── db/            # SQLite init + migrations
│   │   ├── middleware/     # Auth, error, rate-limit
│   │   ├── routes/        # Express router
│   │   └── utils/         # Shared helpers (auth, validation)
│   └── __tests__/         # Backend integration tests
├── frontend/
│   └── src/
│       ├── components/    # React UI components by feature
│       ├── contexts/      # React context providers
│       └── lib/           # Shared frontend utilities
├── src/
│   ├── components/        # Shared/root-level components
│   ├── types/             # TypeScript interfaces (shared)
│   ├── api/               # Frontend API client functions
│   ├── hooks/             # Custom React hooks
│   └── __tests__/         # Root-level tests
├── docs/
│   ├── processes/         # branching-strategy.md, release-process.md
│   ├── requirements/      # BRD, FRD, TRD, Use Cases, Personas (.docx)
│   └── *.md               # This guide and other planning docs
└── docker-compose.yml
```

---

## 5. Environment Setup

### Prerequisites

```bash
node --version   # Must be >= 20
npm --version    # Must be >= 10
git --version    # Must be >= 2.40
```

### First-time Setup

```bash
# 1. Clone the repo
git clone https://github.com/<org>/break-things-here.git
cd break-things-here

# 2. Install root dependencies
npm ci

# 3. Install backend dependencies
cd backend && npm ci && cd ..

# 4. Install frontend dependencies
cd frontend && npm ci && cd ..

# 5. Copy environment template (never commit .env)
cp backend/.env.example backend/.env

# 6. Start everything with Docker Compose
docker compose up --build

# OR start manually for development:
# Terminal 1 — backend
cd backend && PORT=4000 npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

### Environment Variables (backend/.env)

```env
PORT=4000
DATABASE_URL=./database/dev.sqlite
JWT_SECRET=<generate-with: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate-with: openssl rand -hex 32>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=noreply@example.com
EMAIL_PASS=<smtp-password>
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

> **Security**: Never commit secrets to git. Use GitHub repository secrets for CI/CD.

---

## 6. Development Workflow

### Daily Workflow (Every Developer)

```
1. Pull latest develop
   git checkout develop && git pull origin develop

2. Create feature branch from develop
   git checkout -b feature/<issue-number>-short-description

3. Make atomic commits with issue reference
   git commit -m "feat(events): add location field #42"

4. Push branch and open PR against develop
   git push origin feature/<issue-number>-short-description

5. PR must pass CI before merge
6. Tech Lead reviews and approves
7. Merge PR → develop (squash merge)
8. Delete feature branch
```

### Commit Message Format

```
type(scope): description #issue-number

Types:  feat | fix | docs | style | refactor | test | chore
Scopes: auth | events | tasks | rsvps | profile | admin | ui | ci

Examples:
  feat(events): add soft-delete for events #55
  fix(auth): handle expired refresh token correctly #61
  test(rsvps): add integration test for RSVP creation #78
  chore(ci): add notify-on-sync-failure workflow #90
```

### Pull Request Rules

- Every PR must reference at least one open issue (`Closes #123`)
- All CI checks must be green before merge
- At least 1 approving review required (2 for `stage` → `main`)
- No direct pushes to `main`, `stage`, `test`, or `develop`
- Branches must be up-to-date with base before merge

---

## 7. Branch Strategy

See [branching-strategy.md](processes/branching-strategy.md) for full details.

### Quick Reference

```
feature/xxx  ──PR──▶  develop  ──auto-PR──▶  test  ──auto-PR──▶  stage  ──PR──▶  main
                                                                              ▲
hotfix/xxx  ─────────────────────────────────────────────────────────────────┘
             └── back-merged to: stage, test, develop
```

### Auto-Sync

| Trigger | Action |
|---|---|
| Push to `develop` | Workflow auto-creates PR `develop → test` |
| Push to `test` | Workflow auto-creates PR `test → stage` |
| Push to `stage` | Workflow auto-creates PR `stage → main` (manual approval required) |
| CI failure on any promotion | Slack/email notification sent to developer who triggered it |

See [github-automation-guide.md](github-automation-guide.md) for workflow configuration.

---

## 8. Work Item Hierarchy

```
Theme  (epics — standalone GitHub issue)
└── User Story  (sub-issue of Theme)
    └── Task  (sub-issue of User Story)
        └── Sub-Task  (sub-issue of Task)
```

### Issue Creation Rules

| Type | Template | Parent |
|---|---|---|
| Theme | Theme template | None |
| User Story | User Story template | Sub-issue of Theme |
| Task | Task template | Sub-issue of User Story |
| Sub-Task | Sub-Task template | Sub-issue of Task |
| Bug | Bug template | Standalone |
| Security Issue | Security template | Standalone |

All issues must be added to GitHub Projects board (column: Backlog initially).

---

## 9. Coding Standards

### TypeScript

```typescript
// ✅ Use interfaces for object shapes
interface EventPayload {
  title: string;
  date: string;
  location: string;
  description: string;
  status: EventStatus;
}

// ✅ Explicit return types on all exported functions
export async function createEvent(payload: EventPayload): Promise<PlannerEvent> { … }

// ❌ Avoid any
const data: any = response.json(); // WRONG
const data: unknown = response.json(); // Correct — then narrow
```

### React Components

```typescript
// ✅ Functional component with named export, explicit props interface
interface EventCardProps {
  event: PlannerEvent;
  onEdit: (id: string) => void;
}

export function EventCard({ event, onEdit }: EventCardProps): JSX.Element {
  …
}
```

### File Naming

```
✅ event-card.tsx          (kebab-case)
✅ use-event-data.ts       (hooks: use- prefix)
✅ auth-controller.ts      (backend controllers)
❌ EventCard.tsx           (no PascalCase files)
❌ eventCard.ts            (no camelCase files)
```

### API Error Handling

```typescript
// Backend: always return structured errors
res.status(400).json({ error: 'Validation failed', details: [...] });

// Frontend: always handle errors in fetch calls
const response = await fetch('/api/events');
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const data: PlannerEvent[] = await response.json();
```

### Security Checklist (per PR)

- [ ] No secrets or API keys in code
- [ ] All user inputs validated server-side
- [ ] SQL queries use parameterised statements
- [ ] File uploads validated by MIME type (not extension)
- [ ] Auth endpoints rate-limited
- [ ] Sensitive routes protected by `authenticateToken` middleware

---

## 10. Testing Requirements

### Coverage Targets

| Layer | Minimum Coverage |
|---|---|
| Backend utilities (`src/utils/`) | 90% |
| Backend controllers | 80% |
| Frontend components | 80% |
| Integration tests (API) | All happy paths + main error paths |

### Running Tests

```bash
# Root tests
npm test

# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# Coverage report
npm test -- --coverage
```

### Test File Location

```
src/__tests__/                 → root/frontend component tests
backend/__tests__/             → backend integration tests
src/components/X/__tests__/    → component-specific tests
```

### Test Naming Convention

```typescript
describe('EventCard', () => {
  it('should render event title and date', () => { … });
  it('should call onEdit when edit button clicked', () => { … });
  it('should show Cancelled badge when status is Cancelled', () => { … });
});
```

---

## 11. Definition of Done

A work item (Task/Sub-Task) is **Done** when ALL of the following are true:

- [ ] Code written and self-reviewed
- [ ] Unit/integration tests written and passing locally
- [ ] CI pipeline green (lint, typecheck, tests)
- [ ] PR reviewed and approved by at least 1 team member
- [ ] Merged to `develop` with squash commit
- [ ] GitHub issue closed with `Closes #<number>` in commit
- [ ] No new TypeScript errors (`tsc --noEmit` passes)
- [ ] No new ESLint errors
- [ ] Feature works in Docker Compose locally

---

## 12. Communication & Meetings

### Recommended Cadence (5-Member Team)

| Meeting | Frequency | Duration | Purpose |
|---|---|---|---|
| Stand-up | Daily | 15 min | Progress, blockers, branch sync status |
| Sprint Planning | Bi-weekly | 1 hr | Pick items from backlog, assign |
| PR Review | As needed | 30 min | Async first, sync review if complex |
| Retrospective | Bi-weekly | 45 min | Process improvements |

### Escalation Path

1. Blocked on code → comment in GitHub issue, tag relevant member
2. CI failure on promotion branch → check GitHub Actions, see [github-automation-guide.md](github-automation-guide.md)
3. Production defect → create Hotfix branch from `main`, follow hotfix process in [branching-strategy.md](processes/branching-strategy.md)

---

## 13. Related Documents

| Document | Location | Purpose |
|---|---|---|
| Module Development Plan | [module-development-plan.md](module-development-plan.md) | Feature-by-feature build order |
| Database Design | [database-design.md](database-design.md) | Schema, ERD, indexes, migrations |
| GitHub Automation Guide | [github-automation-guide.md](github-automation-guide.md) | Workflows, sync, failure notifications |
| Sprint Plan | [sprint-plan.md](sprint-plan.md) | 8-sprint delivery roadmap |
| Branching Strategy | [processes/branching-strategy.md](processes/branching-strategy.md) | Branch rules, naming, flow |
| Release Process | [processes/release-process.md](processes/release-process.md) | Monthly release cadence |
| Contributing Guidelines | [../CONTRIBUTING.md](../CONTRIBUTING.md) | Commit format, PR rules |
| Requirements (BRD) | [requirements/festival-event-planner-brd-final.docx](requirements/festival-event-planner-brd-final.docx) | Business requirements |
| Requirements (FRD) | [requirements/festival-event-planner-frd-final.docx](requirements/festival-event-planner-frd-final.docx) | Functional requirements |
| Requirements (TRD) | [requirements/festival-event-planner-trd-final.docx](requirements/festival-event-planner-trd-final.docx) | Technical requirements |
