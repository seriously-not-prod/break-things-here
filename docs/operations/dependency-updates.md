# Dependency Updates

This document describes the automated dependency update pipeline for the
Festival Event Planner repository.

## Overview

Dependency updates are managed by **GitHub Dependabot** (`/.github/dependabot.yml`).
Dependabot opens pull requests on a weekly schedule (every Monday at 06:00 UTC)
for outdated packages across all ecosystems.

---

## Ecosystems Covered

| Ecosystem         | Directory   | Schedule |
| ----------------- | ----------- | -------- |
| npm (root)        | `/`         | Weekly   |
| npm (backend)     | `/backend`  | Weekly   |
| npm (frontend)    | `/frontend` | Weekly   |
| GitHub Actions    | `/`         | Weekly   |
| Docker (root)     | `/`         | Weekly   |
| Docker (backend)  | `/backend`  | Weekly   |
| Docker (frontend) | `/frontend` | Weekly   |

---

## PR Grouping

Non-breaking **minor** and **patch** dev-dependency updates are automatically
grouped into a single PR per ecosystem to reduce noise:

- `non-breaking-dev-deps` – root npm dev-dependencies
- `non-breaking-dev-deps-backend` – backend npm dev-dependencies
- `non-breaking-dev-deps-frontend` – frontend npm dev-dependencies
- `github-actions-all` – all GitHub Actions minor/patch bumps

Production dependency updates and major version bumps are always raised as
individual PRs to ensure deliberate review.

---

## Security Updates

Dependabot raises security updates **immediately** (outside the weekly schedule)
when a vulnerability is detected in a dependency.

Security update PRs are handled by the workflow at
`.github/workflows/dependabot-auto-merge.yml`:

1. The `security-issue` label is applied automatically.
2. Auto-merge (squash) is enabled; the PR merges as soon as all required CI
   checks pass.
3. No manual intervention is needed unless CI fails.

---

## Labels Applied

| Label            | Applied when                                 |
| ---------------- | -------------------------------------------- |
| `dependencies`   | All Dependabot PRs                           |
| `npm`            | npm ecosystem updates                        |
| `backend`        | PRs targeting `/backend`                     |
| `frontend`       | PRs targeting `/frontend`                    |
| `github-actions` | GitHub Actions workflow updates              |
| `docker`         | Docker base-image updates                    |
| `security-issue` | Security vulnerability fixes (auto-labelled) |

---

## Commit Message Format

Dependabot commits follow [Conventional Commits](https://www.conventionalcommits.org/):

| Ecosystem          | Prefix                      |
| ------------------ | --------------------------- |
| npm (root)         | `chore(deps):`              |
| npm dev (root)     | `chore(dev-deps):`          |
| npm (backend)      | `chore(deps/backend):`      |
| npm dev (backend)  | `chore(dev-deps/backend):`  |
| npm (frontend)     | `chore(deps/frontend):`     |
| npm dev (frontend) | `chore(dev-deps/frontend):` |
| GitHub Actions     | `chore(ci):`                |
| Docker (root)      | `chore(docker):`            |
| Docker (backend)   | `chore(docker/backend):`    |
| Docker (frontend)  | `chore(docker/frontend):`   |

---

## Reviewer Responsibilities

1. **Version bump PRs**: Review changelog/release notes for breaking changes
   before approving major bumps.
2. **Security PRs**: Verify CI passes; the workflow auto-merges once green.
3. **Grouped PRs**: Spot-check that grouped minor/patch bumps do not include
   accidental major version upgrades.

---

## Disabling or Pausing Updates

To temporarily pause Dependabot for a specific ecosystem, add an `ignore` block
to `.github/dependabot.yml`:

```yaml
ignore:
  - dependency-name: '*'
    update-types: ['version-update:semver-patch']
```

For a permanent exclusion, add the package name:

```yaml
ignore:
  - dependency-name: 'some-package'
```

---

## Related Files

- [`.github/dependabot.yml`](../../.github/dependabot.yml) – Dependabot configuration
- [`.github/workflows/dependabot-auto-merge.yml`](../../.github/workflows/dependabot-auto-merge.yml) – Security PR automation
