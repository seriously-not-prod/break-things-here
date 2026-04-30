## Summary

<!-- Provide a concise description of what this PR does. -->

## Related Issues

<!-- Link every issue this PR closes or references. -->
- Closes #<!-- issue number -->
- References #<!-- theme or story number -->

## Type of Change

<!-- Tick all that apply. -->
- [ ] `feat` — New feature
- [ ] `fix` — Bug fix
- [ ] `docs` — Documentation only
- [ ] `style` — Code style / formatting (no logic change)
- [ ] `refactor` — Code refactoring
- [ ] `test` — Tests added or updated
- [ ] `chore` — Maintenance / tooling

---

## Pre-Merge Checklist

### Code Quality
- [ ] Code follows project conventions (TypeScript strict mode, React functional components)
- [ ] No `any` types introduced without justification
- [ ] No hardcoded secrets, API keys, or credentials
- [ ] User input is sanitised / validated at all system boundaries
- [ ] No `console.log` / debug statements left in production code

### Testing
- [ ] Unit / integration tests added or updated for all changed behaviour
- [ ] All existing tests pass (`npm test` or `npx vitest run`)
- [ ] Coverage remains ≥ 80% for changed files

### Database Migration Gate *(skip if no schema changes)*
- [ ] New migration file created in `database/migrations/` — named `YYYYMMDDHHMMSS_description.sql`
- [ ] Migration is **idempotent** (`IF NOT EXISTS` / `IF EXISTS` guards used)
- [ ] Every `-- UP` block has a corresponding `-- DOWN` rollback block
- [ ] Migration tested against a clean PostgreSQL database (`psql -v ON_ERROR_STOP=1`)
- [ ] **No** raw `ALTER TABLE` / `DROP TABLE` DDL in application source files
- [ ] `DATABASE_URL` in CI references the correct per-environment database
- [ ] No SQLite syntax used (no `INTEGER PRIMARY KEY AUTOINCREMENT`, no `PRAGMA`, no `?` placeholders)

### Documentation
- [ ] Code changes reflected in relevant docs (`docs/`, `CONTRIBUTING.md`, etc.)
- [ ] `CHANGELOG.md` updated under `[Unreleased]` (if user-facing change)
- [ ] Commit messages follow Conventional Commits format with open issue references

### UI / Frontend *(skip if backend-only)*
- [ ] Semantic HTML elements used
- [ ] ARIA labels added for interactive elements
- [ ] Keyboard navigation tested
- [ ] Responsive layout verified

### Security
- [ ] No new OWASP Top 10 vulnerabilities introduced
- [ ] Authentication / authorisation guards applied to all new endpoints
- [ ] Dependency changes reviewed for known CVEs

---

## Screenshots / Evidence

<!-- Add screenshots, logs, or test output that demonstrate the change works. -->

---

## Reviewer Notes

<!-- Anything the reviewer should pay special attention to. -->
