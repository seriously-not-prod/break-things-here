# Local Development Setup

> This guide covers local environment setup, including git hooks and the pre-commit workflow.

## Prerequisites

- Node.js **v20+** (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- npm **v10+**
- Docker Desktop (for the database)
- Git

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/seriously-not-prod/break-things-here.git
cd break-things-here

# 2. Install root dependencies — also configures git hooks automatically
npm install

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Install backend dependencies
cd backend && npm install && cd ..

# 5. Start the database
npm run db:up

# 6. Start the dev servers (in separate terminals)
npm run dev          # Frontend (Vite) on http://localhost:5173
npm run backend:dev  # Backend (Express) on http://localhost:4000
```

## Git Hooks (pre-commit)

### How they are installed

Running `npm install` at the repository root automatically configures git to use the
project's hook directory via the `prepare` npm lifecycle script:

```json
// package.json
"prepare": "git config core.hooksPath .githooks || true"
```

This sets `core.hooksPath` to `.githooks/` for your local clone — no manual step
required.

### Verify the hook is active

```bash
git config core.hooksPath
# Expected output:
# .githooks
```

If the output is empty, re-run `npm install` from the repository root.

### What the pre-commit hook does

The hook at `.githooks/pre-commit` runs
[lint-staged](https://github.com/lint-staged/lint-staged) against every staged file:

| File pattern        | Command                            | Purpose                |
| ------------------- | ---------------------------------- | ---------------------- |
| `*.{ts,tsx,js,jsx}` | `prettier --write`, `eslint --fix` | Format + auto-fix lint |
| `*.{json,css,md}`   | `prettier --write`                 | Format only            |

### Expected output on a clean commit

```
✔ Preparing lint-staged...
✔ Running tasks for staged files...
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...
[feature/my-branch abc1234] feat(scope): my commit message #123
 2 files changed, 10 insertions(+), 3 deletions(-)
```

### Expected output when lint errors are found

```
✔ Preparing lint-staged...
✖ Running tasks for staged files...
  ✖ eslint --fix:
    /path/to/file.ts
      12:5  error  'foo' is defined but never used  @typescript-eslint/no-unused-vars

✖ [FAILED] pre-commit hook returned exit code 1
```

Fix the reported errors, stage the fixes (`git add .`), and retry the commit.

### Bypassing the hook (emergency only)

```bash
git commit --no-verify -m "your message"
```

> ⚠️ **Use sparingly.** CI will catch the same checks, so bypassing locally only delays
> the failure.

## Available npm Scripts

| Script                 | Description                                   |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Start frontend Vite dev server                |
| `npm run build`        | TypeScript compile + Vite production build    |
| `npm test`             | Run root Vitest tests                         |
| `npm run format`       | Apply Prettier formatting to all files        |
| `npm run format:check` | Check formatting without writing (used in CI) |
| `npm run backend:dev`  | Start backend Express server in watch mode    |
| `npm run backend:test` | Start test DB + run backend tests             |
| `npm run test:e2e`     | Run Playwright end-to-end tests               |
| `npm run db:up`        | Start the development PostgreSQL container    |
| `npm run db:test:up`   | Start the test PostgreSQL container           |

## CI and the Pre-commit Hook

CI mirrors the pre-commit checks so that a skipped or missing hook never silently
introduces regressions:

| Pre-commit (local)          | CI equivalent                          |
| --------------------------- | -------------------------------------- |
| `prettier --write` (staged) | `npm run format:check` (all files)     |
| `eslint --fix` (staged)     | TypeScript type check (`tsc --noEmit`) |

If `npm run format:check` fails in CI, run `npm run format` locally, commit the
changes, and push again.

## Troubleshooting

### `npx lint-staged` not found

Ensure you have run `npm install` in the **repository root** (not just inside
`frontend/` or `backend/`).

### Hook does not run

```bash
# Check that core.hooksPath is set
git config core.hooksPath

# If empty, reinstall hooks
npm install
```

### Format check fails in CI

```bash
# Fix all formatting locally
npm run format

# Stage and commit
git add -A
git commit -m "style: fix prettier formatting #<issue>"
```
