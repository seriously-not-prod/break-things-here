# Test Quality & Coverage Policy

## Overview

This document describes the test coverage strategy, CI enforcement gates, and the PR coverage delta comment workflow for the Festival Event Planner repository.

---

## Coverage Thresholds

All three workspaces enforce the same thresholds as a **regression-guard floor**. The targets are aspirational (≥ 80%) and the floor is raised incrementally as test coverage improves.

| Workspace | Lines | Statements | Branches | Functions |
| --------- | ----- | ---------- | -------- | --------- |
| Frontend  | ≥ 25% | ≥ 25%      | ≥ 20%    | ≥ 20%     |
| Backend   | ≥ 25% | ≥ 25%      | ≥ 20%    | ≥ 20%     |

> **Goal:** Raise thresholds by 5–10 percentage points each sprint until all workspaces reach ≥ 80%.

These thresholds are enforced in:

- `frontend/vitest.config.ts` → `coverage.thresholds`
- `backend/vitest.config.ts` → `coverage.thresholds`

CI fails with a non-zero exit code if any threshold is not met.

---

## Coverage Reporters

Both workspaces use the `v8` coverage provider and generate three report formats:

| Reporter       | Purpose                                 |
| -------------- | --------------------------------------- |
| `text`         | Human-readable table printed to CI log  |
| `lcov`         | Compatible with external coverage tools |
| `json-summary` | Machine-readable; used for PR comments  |

Reports are uploaded as CI artifacts (`coverage-frontend`, `coverage-backend`) and retained for 14 days.

---

## PR Coverage Delta Comment

Every pull request targeting `develop`, `test`, `stage`, or `main` receives an automatic comment showing the current branch's coverage alongside the delta against the base branch.

### How It Works

1. The `test-frontend` and `test-backend` CI jobs run `npm run test:coverage` and upload `coverage-summary.json` as named artifacts.
2. The `coverage-comment` CI job (runs only on `pull_request` events):
   - Downloads the current branch's coverage artifacts.
   - Finds the latest successful **CI - Unified Pipeline** run on the base branch and downloads its coverage artifacts.
   - Calls `scripts/post-coverage-comment.js` to generate a Markdown table and post (or update) a PR comment.

### Comment Format

```
## 📊 Coverage Report

Delta shown against the base branch (🟢 increased / 🔴 decreased).

| Workspace | Lines     | Statements | Branches  | Functions |
|-----------|-----------|------------|-----------|-----------|
| Frontend  | 26.00% 🟢 +1.00% | … | … | … |
| Backend   | 25.50% =  | … | … | … |

> **Thresholds** (regression-guard floor): Lines ≥25% · Branches ≥20% · Functions ≥20% · Statements ≥25%
```

The comment is **updated in-place** on subsequent pushes; it does not create duplicates.

---

## Running Coverage Locally

```bash
# Frontend
cd frontend
npm run test:coverage
# Report: frontend/coverage/index.html

# Backend (requires a running PostgreSQL test database)
cd backend
npm run test:coverage
# Report: backend/coverage/index.html
```

---

## Workflow Files

| File                               | Purpose                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `.github/workflows/ci-unified.yml` | Main CI pipeline; includes `test-frontend`, `test-backend`, and `coverage-comment` jobs |
| `scripts/post-coverage-comment.js` | Node.js script that posts the coverage delta comment to the PR                          |

---

## Raising Thresholds

When the team is ready to raise the coverage floor:

1. Open a Task issue linked to the relevant User Story.
2. Create a branch `feature/<issue-number>-raise-coverage-thresholds`.
3. Update `thresholds` in both `frontend/vitest.config.ts` and `backend/vitest.config.ts`.
4. Verify CI passes locally, then open a PR.
5. Update this document with the new threshold values.
