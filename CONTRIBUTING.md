# Contributing to Festival Event Planner

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

Thank you for considering contributing to this project! We welcome contributions from everyone.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:

- A clear description of the problem
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots (if applicable)
- Your environment details (OS, browser, Node version)

### Suggesting Enhancements

We welcome feature requests! Please open an issue with:

- A clear description of the enhancement
- Use cases and benefits
- Any relevant examples or mockups

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Write or update tests as needed
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add some feature'`)
7. Push to the branch (`git push origin feature/your-feature-name`)
8. Open a Pull Request

### Work Item Hierarchy (Required Before PR)

All development PRs must trace back to the required hierarchy:

1. Create a `Theme` issue first.
2. Create a `User Story` as a sub-issue of that Theme.
3. Create a `Task` as a sub-issue of that User Story.
4. Reference the open Task issue number in every commit message (`#123`).
5. Include Theme/Story/Task links in the PR description.

Use the templates under `.github/ISSUE_TEMPLATE/`:

- `theme.yml`
- `user-story.yml`
- `task.yml`

Important: GitHub CLI does not provide first-class sub-issue creation commands,
so create/link sub-issues from the GitHub issue web UI (`Create sub-issue` or
`Add existing issue`) when needed.

### Commit Message Requirements

**All commits MUST reference an open GitHub issue.**

**Format**: Use Conventional Commits with issue reference:

```
type(scope): description #issue-number
```

**Allowed Types**:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting (no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:

```bash
git commit -m "feat(auth): add login validation #42"
git commit -m "fix(payment): resolve checkout crash #123"
git commit -m "docs(readme): update setup instructions #89"
```

**Requirements**:

- ✅ Every commit must include an issue number (#123)
- ✅ Issue must be open (not closed)
- ✅ Issue must exist in the repository
- ❌ No commits without issue references
- ❌ No commits referencing closed issues

**Additional Best Practices**:

- ✅ **Subject line**: Keep under 72 characters
- ✅ **Imperative mood**: Use "add" not "added" or "adds"
- ✅ **No trailing period** in subject line
- ✅ **Separate subject from body** with blank line
- ✅ **Body lines**: Wrap at 72 characters
- ✅ **Atomic commits**: One logical change per commit
- ✅ **Use rebase**: Avoid merge commits in feature branches
- ⚠️ **Breaking changes**: Mark with `BREAKING CHANGE:` in footer

**Breaking Change Example**:

```
feat(api): update authentication endpoint #123

Change authentication to use JWT tokens instead of sessions.

BREAKING CHANGE: Session-based auth endpoints removed.
Clients must migrate to JWT authentication.

Closes #123
```

### Pre-commit Hooks

This repository uses git hooks managed from the `.githooks/` directory.
Running `npm install` at the repo root automatically configures git via the
`prepare` lifecycle script:

```bash
# Verify the hook is installed
git config core.hooksPath
# Expected: .githooks
```

The **pre-commit** hook runs [lint-staged](https://github.com/lint-staged/lint-staged),
which formats and lints every staged file before the commit is recorded:

- **`*.{ts,tsx,js,jsx}`** — `prettier --write` then `eslint --fix`
- **`*.{json,css,md}`** — `prettier --write`

If the hook catches errors, fix them, re-stage the files (`git add .`), and retry.
Use `git commit --no-verify` only in genuine emergencies — CI will catch the same
checks.

For full setup instructions and expected hook output, see
[docs/operations/local-dev.md](docs/operations/local-dev.md).

### Code Style

- Follow the existing code style
- Use TypeScript for all new code
- Write meaningful commit messages
- Add comments for complex logic
- Ensure your code passes linting and formatting checks

### Testing

- Write tests for new features
- Ensure existing tests pass (`npm test`)
- Aim for good test coverage

## Code of Conduct

Please note that this project is released with a [Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.

## Questions?

Feel free to open an issue for any questions or concerns.
