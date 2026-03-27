# Git Hooks

This directory contains git hook templates for the project.

## Available Hooks

### commit-msg

Validates commit messages to ensure:
- Every commit references a GitHub issue (#123)
- Commit messages follow Conventional Commits format

**Installation:**

```bash
# Copy the hook to your local .git/hooks directory
cp .git-hooks/commit-msg .git/hooks/commit-msg

# Make it executable
chmod +x .git/hooks/commit-msg
```

**Automatic Installation (Recommended):**

Add this to your project setup:

```bash
# In package.json scripts:
"postinstall": "cp .git-hooks/commit-msg .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg"
```

Or run manually after clone:

```bash
npm run setup-hooks
# or
./scripts/setup-hooks.sh
```

## Testing the Hook

Try committing without an issue reference:

```bash
git commit -m "add new feature"
# ERROR: Commit message must reference a GitHub issue!
```

Valid commit:

```bash
git commit -m "feat(auth): add login validation #42"
# ✓ Commit message validation passed
```

## Bypassing the Hook

In exceptional cases (not recommended):

```bash
git commit --no-verify -m "emergency fix"
```

**Note**: PRs with improperly formatted commits may be rejected during code review.
