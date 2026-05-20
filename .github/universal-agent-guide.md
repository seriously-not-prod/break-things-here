# Universal Agent Guide

> **⚠️ MANDATORY: All AI agents and assistants must read and follow this guide on EVERY request.**

## Critical Rules

### Rule #1: Single README.md Policy

- ✅ **ONLY ONE** `README.md` file exists in this repository
- ✅ Location: Repository root (`/README.md`)
- ❌ **NEVER** create `README.md` files in subdirectories
- ❌ **NEVER** create `README.md` files in any other location

**Examples of FORBIDDEN README locations:**

```
❌ .github/README.md
❌ docs/README.md
❌ src/README.md
❌ .github/agents/README.md
❌ .github/instructions/README.md
❌ ANY subdirectory/README.md
```

**When documentation is needed in subdirectories:**

- Create files with descriptive names (e.g., `GUIDE.md`, `SETUP.md`, `INDEX.md`)
- Link to them from the root README.md if necessary
- NEVER name them `README.md`

### Rule #2: Todo List Management (MANDATORY)

- ✅ **ALWAYS** use todo lists for tracking work on every request
- ✅ Use todo lists even for single-item tasks
- ✅ **FIRST ACTION**: Check if a todo list already exists
- ✅ If exists: Add new items to existing todo list
- ✅ If not exists: Create a new todo list before starting work
- ✅ Update todo status as work progresses (not-started → in-progress → completed)
- ✅ Keep todo list current throughout the entire request

**Todo List Workflow:**

1. Check for existing todo list
2. Create new or update existing list with all work items
3. Mark current item as `in-progress` before starting
4. Complete work on that item
5. Mark item as `completed` immediately after finishing
6. Move to next item and repeat

### Rule #3: File Naming Conventions

- ✅ **All files must be lowercase with dashes** (e.g., `user-profile.ts`, `event-card.tsx`)
- ✅ Use kebab-case for file names (e.g., `api-client.ts`, `header-component.tsx`)
- ❌ **NEVER** use camelCase, PascalCase, or snake_case for file names
- ❌ **NEVER** use uppercase letters in file names (except documented exceptions)

**Exceptions (uppercase allowed at repository root only):**

- `AGENTS.md`
- `CHANGELOG.md`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `LICENSE`
- `README.md`
- `SECURITY.md`

**Examples:**

- ✅ `src/components/event-card.tsx`
- ✅ `src/utils/date-formatter.ts`
- ✅ `docs/processes/branching-strategy.md`
- ❌ `src/components/EventCard.tsx`
- ❌ `src/utils/dateFormatter.ts`
- ❌ `docs/processes/branching-strategy-wrong.md`

### Rule #4: Repository Documentation Review (MANDATORY)

- ✅ **ALWAYS** include a todo item on every request to review and update repo root markdown documents
- ✅ Review: README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, AGENTS.md, CHANGELOG.md
- ✅ Update documents if changes are needed based on work performed
- ⚠️ **CHANGELOG.md Special Rule**: NEVER change existing changelog history
- ✅ For CHANGELOG.md: Only ADD new entries, never modify or remove existing ones

**Documentation Review Workflow:**

1. Add todo item to review repo root documentation
2. After completing work, check if any root documents need updates
3. Update relevant documents (README, CONTRIBUTING, etc.)
4. For CHANGELOG.md: Add new entries under [Unreleased] section only
5. Commit documentation updates separately if changes were made

### Rule #5: Understand Project Context

This is a **fake/demo training repository**:

- Not a real application
- Used for teaching Git workflows and Kanban processes
- No feedback collected or worked on
- Use at own risk

### Rule #6: Follow Established Patterns

- Always check existing files before creating new ones
- Follow the project structure already in place
- Maintain consistency with existing code style
- Reference existing documentation

### Rule #7: Branch Workflow Adherence

- Understand the four-branch strategy: `develop` → `test` → `stage` → `main`
- Never suggest direct commits to protected branches
- Always use proper branch naming conventions
- Reference: [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md)

### Rule #8: Work Item Hierarchy

Enforce the strict hierarchy using GitHub's native sub-issues:

```
Theme (standalone issue)
└── User Story (sub-issue of Theme)
    └── Task (sub-issue of User Story)
        └── Sub-Task (sub-issue of Task)
```

**How to Create:**

- Themes: Create directly using Theme template
- User Stories: Create as sub-issue of Theme (click "Create sub-issue" in Theme)
- Tasks: Create as sub-issue of User Story
- Sub-Tasks: Create as sub-issue of Task

**Separate Issue Types:**

- Defects: Production faults with release number
- Bugs: Non-production faults with release number
- Security Issues: Vulnerability findings
- Feature Requests: Enhancement suggestions

### Rule #9: Code Quality Standards

- TypeScript strict mode required
- React functional components with hooks
- Named exports preferred over default exports
- Comprehensive testing required (>80% coverage)
- Accessibility compliance mandatory

### Rule #10: Documentation Discipline

- Keep documentation in sync with code
- Use conventional commit messages
- Link PRs to issues
- Update CHANGELOG.md for releases
- Cross-reference related documentation

### Rule #11: Security Awareness

- Never commit secrets or API keys
- Sanitize user input
- Use environment variables for config
- Validate all data
- Follow secure coding practices

### Rule #12: Training Repository Focus

Remember this is for **training purposes**:

- Emphasize learning Git workflows
- Support Kanban process understanding
- Enable collaborative development practice
- Provide realistic project structure

### Rule #13: GitHub CLI Required (MANDATORY)

- ✅ **ALWAYS** use the GitHub CLI (`gh`) for any interaction with github.com **when a `gh` command exists for the operation**
- ✅ Use `gh` for creating issues, pull requests, releases, and all GitHub operations that `gh` supports
- ❌ **NEVER** use the GitHub REST API directly via `curl`, `fetch`, or HTTP clients
- ❌ **NEVER** use the GitHub GraphQL API directly
- ✅ Prefer high-level `gh` subcommands (e.g., `gh issue`, `gh pr`, `gh repo`) over low-level API calls
- ✅ `gh api` / `gh api graphql` may be used **only when no suitable first-class `gh` command exists** for the required GitHub operation
- ❌ **NEVER** use `gh api` / `gh api graphql` to circumvent the bans on direct REST/GraphQL usage via other HTTP clients
- ❌ **NEVER** suggest manual browser-based actions when `gh` can accomplish the task
- ✅ You may suggest the GitHub web UI **only when no equivalent `gh` support exists** for the required GitHub action (e.g., creating sub-issues, features not yet supported by `gh`)

**Common `gh` Commands:**

```bash
# Issues
gh issue create --title "Title" --body "Body"
gh issue list
gh issue view 123
gh issue close 123

# Pull Requests
gh pr create --title "Title" --body "Body" --base develop
gh pr list
gh pr view 123
gh pr merge 123

# Releases
gh release create v1.0.0 --title "Release v1.0.0" --notes "Release notes"

# Repository
gh repo view
gh repo clone owner/repo

# Workflow / Actions
gh run list
gh run view 123

# Sub-issues
# Note: `gh` does not natively support creating/linking sub-issues.
# Use the GitHub web UI for sub-issue management.
```

**Why GitHub CLI:**

- Ensures consistent, scriptable interactions with GitHub
- Avoids credential management issues with raw API calls
- Provides built-in authentication via `gh auth login`
- Keeps all GitHub operations auditable in terminal history

### Rule #14: AI Assistant Behavior

When assisting with code or documentation:

1. **Read this guide first** on every request
2. Check for existing patterns and follow them
3. Reference appropriate documentation
4. Suggest best practices from project guidelines
5. Enforce the rules defined here
6. Never deviate from established conventions

### Rule #15: Commit Message Requirements (MANDATORY)

- ✅ **EVERY commit MUST reference an open (non-closed) GitHub issue**
- ✅ Use issue numbers in commit messages: `#123` or `Closes #123`
- ✅ Follow Conventional Commits format: `type(scope): description #123`
- ❌ **NO commits without issue references** - all work must be tracked
- ❌ **NO commits referencing closed issues** - only active work items

**Commit Message Format:**

```
type(scope): description #123

Optional body with more details.

References #123
Closes #456
```

**Allowed Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting (no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

- ✅ `feat(auth): add login validation #42`
- ✅ `fix(payment): resolve checkout crash\n\nCloses #123`
- ✅ `docs(readme): update setup instructions #89`
- ❌ `add new feature` (no issue reference)
- ❌ `fix bug #999` (if #999 is closed)

**Additional Commit Best Practices:**

- ✅ **Subject line**: Keep under 72 characters
- ✅ **Imperative mood**: Use "add" not "added" or "adds"
- ✅ **No trailing period** in subject line
- ✅ **Separate subject from body** with blank line
- ✅ **Body lines**: Wrap at 72 characters
- ✅ **Atomic commits**: One logical change per commit
- ✅ **Use rebase**: Avoid merge commits in feature branches
- ⚠️ **Breaking changes**: Mark with `BREAKING CHANGE:` in footer

**Breaking Change Example:**

```
feat(api): update authentication endpoint #123

Change authentication to use JWT tokens instead of sessions.

BREAKING CHANGE: Session-based auth endpoints removed.
Clients must migrate to JWT authentication.

Closes #123
```

**Enforcement:**

- Git commit-msg hook validates issue references
- CI/CD checks verify issues are open
- PRs without proper commit messages will be rejected

### Rule #16: PostgreSQL Database Standards (PLANNED)

> **⚠️ Migration Note**: The current backend initializes its schema via `database/init.sql` (SQLite-compatible). PostgreSQL is the **planned target database** for this project. The guidelines below represent the target state and must be followed for all new database work. Existing SQLite-based code should be migrated incrementally.

#### Connection Configuration

- ✅ **Always** use `DATABASE_URL` environment variable for connection strings
- ✅ Use separate databases per environment (never share between `develop`, `test`, `stage`, `main`)
- ✅ Store credentials in `.env` files — never commit them
- ✅ Use connection pooling (e.g., `pg-pool` or Prisma connection pool)
- ❌ **NEVER** hardcode connection strings in code

**Environment variable pattern:**

```bash
# .env.development
DATABASE_URL=postgresql://user:password@localhost:5432/festivalplanner_dev

# .env.test
DATABASE_URL=postgresql://user:password@localhost:5432/festivalplanner_test

# .env.stage
DATABASE_URL=postgresql://user:password@host:5432/festivalplanner_stage

# .env.production
DATABASE_URL=postgresql://user:password@host:5432/festivalplanner_prod
```

#### Migration Standards

- ✅ Use numbered, timestamped migration files: `YYYYMMDDHHMMSS_description.sql`
- ✅ Migrations must be **idempotent** — safe to re-run
- ✅ Every migration must have a corresponding **rollback** (`-- DOWN`) comment block
- ✅ Migrations are committed **in the same PR** as the code that requires them
- ✅ Migration files live in `database/migrations/`
- ❌ **NEVER** modify existing migration files — always create a new one
- ⚠️ Until PostgreSQL migration is complete, schema DDL changes must go through `database/init.sql` via PR — no ad-hoc DDL directly in application code

**Migration file naming:**

```
database/migrations/
  20260101120000_create_events_table.sql
  20260102090000_add_user_id_to_events.sql
  20260103150000_create_rsvps_table.sql
```

**Migration file structure:**

```sql
-- Migration: 20260101120000_create_events_table.sql
-- Description: Create initial events table
-- Author: developer-name
-- Date: 2026-01-01

-- UP
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DOWN (rollback)
-- DROP TABLE IF EXISTS events;
```

#### Schema Version Management Across Branches

- ✅ Migrations must be applied in order: `develop` → `test` → `stage` → `main`
- ✅ PR promotions (`develop→test`, `test→stage`, `stage→main`) require migration checks to pass once CI is configured
- ✅ A migration tracking mechanism (e.g., `schema_migrations` table) records applied migrations per environment
- ❌ **NEVER** skip environments when promoting schema changes

#### Rollback Procedure

1. Identify the failed migration filename
2. Execute the `-- DOWN` section manually against the target environment DB
3. Fix the issue by creating a **new** corrective migration — never edit the old file
4. Re-run migrations from CI/CD pipeline
5. Document the incident in `CHANGELOG.md` under `[Unreleased]`

#### Seed Data

- ✅ Seed data lives in `database/seeds/` — separate from migrations
- ✅ Seeds are environment-specific (`seed.development.sql`, `seed.test.sql`)
- ✅ Seeds are **never** run in `stage` or `main` environments
- ❌ Never mix seed data with migration files

#### Docker / Local Development

```yaml
# docker-compose.yml — PostgreSQL service
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: festivalplanner_dev
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
```

## Quick Reference

| Topic           | Document                                                                     |
| --------------- | ---------------------------------------------------------------------------- |
| Branching       | [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md) |
| Releases        | [docs/processes/release-process.md](docs/processes/release-process.md)       |
| Contributing    | [CONTRIBUTING.md](CONTRIBUTING.md)                                           |
| Issue Templates | [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/)                           |
| Code Ownership  | [.github/CODEOWNERS](.github/CODEOWNERS)                                     |
| Changelog       | [CHANGELOG.md](CHANGELOG.md)                                                 |
| Security        | [SECURITY.md](SECURITY.md)                                                   |

## Enforcement

These rules are **MANDATORY**. Violations indicate:

1. The guide was not read
2. Instructions were not followed
3. Project conventions were ignored

Always prioritize following this guide over convenience or assumptions.

## Updates

This guide may be updated as the project evolves. Always check for the latest version before providing assistance.

**Last Updated**: April 29, 2026
