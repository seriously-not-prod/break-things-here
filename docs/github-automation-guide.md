# Festival Event Planner — GitHub Automation Guide

> Complete reference for all GitHub Actions workflows, branch protection rules,
> auto-sync pipelines, and failure notification setup.
> Owner: Member 5 (QA / DevOps)

---

## Table of Contents

1. [Workflow Overview](#1-workflow-overview)
2. [Branch Protection Rules](#2-branch-protection-rules)
3. [Auto-Sync Pipeline](#3-auto-sync-pipeline)
4. [CI Pipeline (ci-unified.yml)](#4-ci-pipeline)
5. [Failure Notification Workflow](#5-failure-notification-workflow)
6. [Repository Secrets Required](#6-repository-secrets-required)
7. [GitHub Environment Setup](#7-github-environment-setup)
8. [Troubleshooting Sync Failures](#8-troubleshooting-sync-failures)

---

## 1. Workflow Overview

| Workflow File | Trigger | Purpose |
|---|---|---|
| `ci-unified.yml` | Push/PR to any main branch | Lint, typecheck, test all packages |
| `ci-pr-validation.yml` | PR open/update | Validate commit messages, issue references |
| `code-quality.yml` | PR open/update | ESLint, coverage thresholds |
| `promote-develop-to-test.yml` | Push to `develop` | Auto-create PR: develop → test |
| `promote-test-to-stage.yml` | Push to `test` | Auto-create PR: test → stage |
| `promote-stage-to-main.yml` | Push to `stage` | Create PR: stage → main (manual approval) |
| `auto-approve-sync.yml` | Automated PRs | Auto-approve promotion PRs |
| `auto-approve-promotion.yml` | Automated PRs | Auto-approve with label `automated` |
| `enable-auto-merge.yml` | PR labelled `automated` | Enable squash auto-merge |
| `project-automation.yml` | Issue/PR events | Move GitHub Projects board cards |
| `branch-assignee-check.yml` | PR open | Warn if no assignee |
| `auto-draft-pr.yml` | PR open | Mark PR draft if `[WIP]` in title |
| `notify-on-sync-failure.yml` | Workflow failure | Email/issue notification on broken sync |

---

## 2. Branch Protection Rules

Configure these via **GitHub → Settings → Branches → Add branch protection rule**.

### `main`

```
Pattern: main
✅ Require a pull request before merging
  ✅ Required approvals: 2
  ✅ Dismiss stale PR approvals when new commits are pushed
  ✅ Require review from code owners (CODEOWNERS file)
✅ Require status checks to pass:
  - CI - Unified Pipeline / Lint & Type Check
  - CI - Unified Pipeline / Test - Root
  - CI - Unified Pipeline / Test - Backend
✅ Require branches to be up to date before merging
✅ Do not allow bypassing the above settings
✅ Restrict who can push: (no direct pushes — PRs only)
✅ Restrict deletions
✅ Block force pushes
```

### `stage`

```
Pattern: stage
✅ Require a pull request before merging
  ✅ Required approvals: 1
✅ Require status checks to pass (same as main)
✅ Require branches to be up to date
✅ Block force pushes
✅ Restrict deletions
```

### `test`

```
Pattern: test
✅ Require a pull request before merging
  ✅ Required approvals: 1
✅ Require status checks to pass (lint + typecheck minimum)
✅ Block force pushes
✅ Restrict deletions
```

### `develop`

```
Pattern: develop
✅ Require a pull request before merging
  ✅ Required approvals: 1
✅ Require status checks to pass (lint + typecheck minimum)
✅ Block force pushes
✅ Restrict deletions
```

---

## 3. Auto-Sync Pipeline

### Promotion Flow

```
Developer PR → develop
       │
       ▼  (push to develop triggers)
promote-develop-to-test.yml
       │  creates automated PR: develop → test
       │  auto-approve-sync.yml approves it
       │  enable-auto-merge.yml enables squash merge
       ▼  (CI must pass; squash merge happens automatically)
test branch updated
       │
       ▼  (push to test triggers)
promote-test-to-stage.yml
       │  creates automated PR: test → stage
       │  same auto-approve + auto-merge flow
       ▼
stage branch updated
       │
       ▼  (push to stage triggers)
promote-stage-to-main.yml
       │  creates PR: stage → main
       │  ⚠️  MANUAL approval required (environment: production)
       │  2 approvals needed (CODEOWNERS)
       ▼
main updated → production deploy
```

### When Auto-Sync Breaks

1. A CI check fails on the automated PR → PR is blocked from auto-merging
2. `notify-on-sync-failure.yml` fires → creates a GitHub issue tagged `sync-failure`
3. Notification sent to the developer who last pushed to the triggering branch
4. Developer fixes the failing branch, re-pushes → promotion workflow re-triggers

---

## 4. CI Pipeline

The `ci-unified.yml` workflow runs on every push to `main`, `develop`, `test`, `stage`, and all `feature/**`, `bugfix/**`, `hotfix/**` branches, and on all PRs to the four main branches.

### Jobs

```
lint-and-typecheck
  ├── npm ci (root)
  ├── tsc --noEmit (root)
  ├── npm ci (backend)
  └── tsc --noEmit (backend)

test-root              (needs: lint-and-typecheck)
  ├── npm ci
  ├── npm test -- --coverage
  └── Upload coverage artifact

test-backend           (needs: lint-and-typecheck)
  ├── npm ci (backend)
  ├── npm test (backend)
  └── Upload coverage artifact
```

### Coverage Enforcement

Add to `ci-unified.yml` to fail on low coverage:

```yaml
- name: Check coverage threshold
  run: |
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$COVERAGE < 80" | bc -l) )); then
      echo "Coverage $COVERAGE% is below the 80% threshold"
      exit 1
    fi
```

---

## 5. Failure Notification Workflow

The `notify-on-sync-failure.yml` workflow watches all promotion workflows and creates a GitHub issue when any of them fail, tagging the responsible developer.

### Workflow: `.github/workflows/notify-on-sync-failure.yml`

This file is in the repository at `.github/workflows/notify-on-sync-failure.yml`.

### What It Does

When a sync/promotion workflow fails:
1. Creates a GitHub issue labelled `sync-failure` and `automated`
2. Issue title: `⚠️ Sync failure: <workflow-name> on <branch>`
3. Issue body includes: failed workflow run URL, triggering commit, branch, timestamp
4. Assigns the issue to the `SYNC_FAILURE_ASSIGNEE` secret (default: Tech Lead)
5. Adds the issue to the GitHub Projects board in column "Backlog"

### Triggering Developer Notification

To notify the specific developer who broke the build (instead of a fixed assignee):

```yaml
- name: Get pusher login
  id: pusher
  run: echo "login=${{ github.event.workflow_run.triggering_actor.login }}" >> $GITHUB_OUTPUT

- name: Create failure issue
  uses: peter-evans/create-issue-from-file@v5
  with:
    assignees: ${{ steps.pusher.outputs.login }}
```

### Manual Notification via Email (Optional)

If your team uses email for notifications, add the `actions/send-mail` step using `SMTP_*` secrets (see [Repository Secrets Required](#6-repository-secrets-required)).

---

## 6. Repository Secrets Required

Configure these in **GitHub → Settings → Secrets and variables → Actions**.

### Required for CI

| Secret Name | Description | Example |
|---|---|---|
| `GITHUB_TOKEN` | Auto-provided by GitHub Actions | (automatic) |

### Required for Notifications

| Secret Name | Description |
|---|---|
| `SYNC_FAILURE_ASSIGNEE` | GitHub username to assign sync-failure issues (e.g., `tech-lead-username`) |
| `SMTP_HOST` | SMTP server hostname (for email notifications) |
| `SMTP_PORT` | SMTP port (usually `587`) |
| `SMTP_USER` | SMTP login username |
| `SMTP_PASS` | SMTP password |
| `NOTIFY_EMAIL_TO` | Comma-separated team email addresses |

### Required for Production Deploy (stage → main)

| Secret Name | Description |
|---|---|
| `PRODUCTION_DEPLOY_TOKEN` | PAT with `repo` scope for the production environment |

### Setting a Secret

```bash
# Via GitHub CLI
gh secret set SYNC_FAILURE_ASSIGNEE --body "member1-github-handle"
gh secret set SMTP_HOST --body "smtp.gmail.com"
```

---

## 7. GitHub Environment Setup

### `production` Environment

1. Go to **GitHub → Settings → Environments → New environment**
2. Name: `production`
3. Enable **Required reviewers** → add Tech Lead and one other senior member
4. Add **Deployment protection rule**: only `stage` branch can deploy
5. This environment gate blocks `promote-stage-to-main.yml` until approved

### `staging` Environment (Optional)

1. Name: `staging`
2. Required reviewers: Member 5 (QA)
3. Allowed branches: `stage`

---

## 8. Troubleshooting Sync Failures

### Symptom: Automated PR fails CI on `test` branch

**Steps**:
1. Check the failed workflow run in GitHub → Actions
2. Read the failing job output (usually lint or test failure)
3. Check which commit in `develop` introduced the regression
4. Fix in a new `bugfix/issue-number-description` branch from `develop`
5. Merge bugfix to `develop` — promotion workflow re-triggers automatically

### Symptom: Merge conflict on automated PR

Auto-merge cannot proceed if there are conflicts. This means `test` has diverged from `develop`.

**Fix**:
```bash
git checkout develop
git pull origin develop
git checkout test
git pull origin test
git merge develop
# Resolve conflicts manually
git push origin test
```

### Symptom: `peter-evans/enable-pull-request-automerge` fails with "Auto-merge is not enabled"

Auto-merge must be enabled in repository settings.

**Fix**: Go to **GitHub → Settings → General → Pull Requests** → enable **Allow auto-merge**.

### Symptom: Promotion PR has no diff (branches already in sync)

`peter-evans/create-pull-request` will not create a PR if there's no diff. This is expected behaviour — check the workflow run log for "No changes to commit" message.

### Sync Status Check (Quick Health)

```bash
# Compare branch tips locally
git fetch --all
git log --oneline origin/test..origin/develop   # commits in develop not yet in test
git log --oneline origin/stage..origin/test     # commits in test not yet in stage
git log --oneline origin/main..origin/stage     # commits in stage not yet in main
```

Empty output = branches are in sync.
