# Branching Strategy

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Overview

This project uses a **four-branch strategy** to support continuous development with monthly production releases. The strategy provides clear environment progression and change control while supporting Kanban workflow.

## Standard Long-Lived Branches

### 1. `main` - Production
- **Purpose**: Production environment
- **Stability**: Highest
- **Protection**: Protected, requires PR approval
- **Deployment**: Monthly releases (first Tuesday)
- **Source**: Merges from `staging` only
- **Restrictions**: No direct commits, no force pushes, no deletions

### 2. `staging` - Pre-Production/UAT
- **Purpose**: User Acceptance Testing and final validation
- **Stability**: High
- **Protection**: Protected, requires PR approval
- **Deployment**: Staging environment
- **Source**: Merges from `test` only
- **Code Freeze**: Active 3 business days before production release
- **Restrictions**: No direct commits, no force pushes, no deletions

### 3. `test` - QA/Testing
- **Purpose**: Quality Assurance and integration testing
- **Stability**: Medium
- **Protection**: Protected, requires PR approval
- **Deployment**: Test environment
- **Source**: Merges from `develop` only
- **Restrictions**: No direct commits, no force pushes, no deletions

### 4. `develop` - Integration/Development
- **Purpose**: Main integration branch for active development
- **Stability**: Lower (but stable)
- **Protection**: Protected, requires PR approval
- **Deployment**: Development environment
- **Source**: Merges from feature/bugfix branches
- **Restrictions**: No direct commits, no force pushes, no deletions

## Developer Branch Naming Conventions

### Feature Branches
- **Pattern**: `feature/issue-number-short-description`
- **Source**: Branch from `develop`
- **Merge to**: `develop` via Pull Request
- **Examples**:
  - `feature/123-user-authentication`
  - `feature/456-payment-integration`
  - `feature/789-event-calendar-view`

### Bugfix Branches
- **Pattern**: `bugfix/issue-number-short-description`
- **Source**: Branch from `develop`
- **Merge to**: `develop` via Pull Request
- **Examples**:
  - `bugfix/234-login-validation-error`
  - `bugfix/567-date-picker-crash`

### Hotfix Branches
- **Pattern**: `hotfix/issue-number-short-description`
- **Source**: Branch from `main` (for production defects)
- **Merge to**: `main` AND back-merge to `staging`, `test`, `develop`
- **Examples**:
  - `hotfix/890-critical-payment-bug`
  - `hotfix/901-security-vulnerability`

### Release Branches (Optional)
- **Pattern**: `release/vX.Y.Z`
- **Source**: Branch from `staging` one week before deployment
- **Purpose**: Final release preparation and last-minute fixes
- **Merge to**: `main` on deployment day
- **Examples**:
  - `release/v1.2.0`
  - `release/v1.2.1`

## Branch Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Branch Flow                              │
└─────────────────────────────────────────────────────────────────┘

feature/bug branches
       │
       ├─── PR ──→ develop ──→ PR ──→ test ──→ PR ──→ staging ──→ PR ──→ main
       │              ↑                                                     │
       │              │                                                     │
       └──────────────┘                                                     │
                                                                            │
hotfix/xxx ──────────────────────────────────────────────────────────────→ │
       │                                                                    │
       └────── back-merge to staging, test, develop ←─────────────────────┘
```

## Workflow

### Commit Message Requirements

**MANDATORY**: All commits must reference an open GitHub issue.

**Format**: Follow Conventional Commits with issue reference:
```
type(scope): description #issue-number
```

**Allowed Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style/formatting
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

### Normal Development Flow

1. **Create Feature/Bugfix Branch**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/123-your-feature
   ```

2. **Develop and Commit**
   ```bash
   # Make changes
   git add .
   git commit -m "feat(component): add your feature #123"
   git push origin feature/123-your-feature
   ```

3. **Create Pull Request**
   - Open PR from `feature/123-your-feature` → `develop`
   - Link related issue (Theme, User Story, or Task)
   - Request reviews from CODEOWNERS
   - Address review feedback

4. **Merge to Develop**
   - Once approved, merge to `develop`
   - Delete feature branch
   - Auto-deploy to development environment

5. **Promote Through Environments**
   - **Develop → Test**: Create PR when features are ready for QA
   - **Test → Staging**: Create PR when testing is complete
   - **Staging → Main**: Create PR during release window

### Hotfix Flow

1. **Create Hotfix Branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/890-critical-bug
   ```

2. **Fix and Test**
   - Implement fix
   - Test thoroughly
   - Update version number (patch increment)

3. **Create Pull Request to Main**
   - Open PR from `hotfix/890-critical-bug` → `main`
   - Mark as urgent/hotfix
   - Request expedited review
   - Once approved, merge to `main`

4. **Back-Merge to Other Branches**
   ```bash
   # Merge to staging
   git checkout staging
   git merge main
   git push origin staging
   
   # Merge to test
   git checkout test
   git merge staging
   git push origin test
   
   # Merge to develop
   git checkout develop
   git merge test
   git push origin develop
   ```

5. **Deploy Hotfix**
   - Deploy to production immediately
   - Update CHANGELOG
   - Tag release
   - Monitor closely

## Branch Protection Rules

All long-lived branches (`main`, `staging`, `test`, `develop`) have the following protections:

- ✅ **Require Pull Request**: All changes must go through PR
- ✅ **Require 1 Approval**: At least one reviewer must approve
- ✅ **Dismiss Stale Reviews**: New commits dismiss previous approvals
- ✅ **No Force Pushes**: History cannot be rewritten
- ✅ **No Deletions**: Branches cannot be deleted
- ⚠️ **No Direct Commits**: All commits via PR only

## Pull Request Guidelines

### PR Title Format
- Use conventional commits: `type(scope): description`
- Examples:
  - `feat(auth): add login form validation`
  - `fix(payment): resolve checkout crash`
  - `docs(readme): update installation steps`

### PR Description Must Include
- Link to related issue (Theme/Story/Task)
- Description of changes
- Testing performed
- Screenshots (if UI changes)
- Checklist of acceptance criteria

### PR Review Process
1. Automated checks run (CI/CD)
2. Code review by CODEOWNERS
3. At least 1 approval required
4. Address all comments
5. Squash and merge (optional)

## Environment Mapping

| Branch    | Environment   | Auto-Deploy | URL Pattern              |
|-----------|---------------|-------------|--------------------------|
| `develop` | Development   | Yes         | dev.example.com          |
| `test`    | Testing/QA    | Yes         | test.example.com         |
| `staging` | Staging/UAT   | Yes         | staging.example.com      |
| `main`    | Production    | Manual      | example.com              |

## Best Practices

### Do's ✅
- Always branch from the correct source branch
- Keep feature branches short-lived (< 2 weeks)
- Rebase your branch on latest develop before creating PR
- Write descriptive commit messages
- Link PRs to issues
- Delete branches after merging
- Tag releases in `main`

### Don'ts ❌
- Never commit directly to protected branches
- Don't merge PRs without approval
- Don't force push to shared branches
- Don't merge `main` into `develop` (except after hotfixes)
- Don't keep stale branches around
- Don't skip the environment progression

## Version Tagging

Tags are created on `main` after each deployment:

```bash
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

Follow Semantic Versioning:
- **Major**: Breaking changes (v2.0.0)
- **Minor**: New features (v1.3.0)
- **Patch**: Bug fixes (v1.2.1)

## Emergency Procedures

### Rollback Production
1. Identify last good tag (e.g., `v1.1.0`)
2. Create hotfix from that tag
3. Deploy immediately
4. Post-mortem and update processes

### Unblock Broken Branch
1. Identify breaking commit
2. Create revert PR
3. Expedite review and merge
4. Investigate root cause

## Metrics to Track

- Average PR age (time from open to merge)
- Number of hotfixes per month
- Environment promotion success rate
- Build success rate per branch

## Related Documentation

- [Release Process](release-process.md) - Monthly release workflow
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution guidelines
- [Issue Templates](../../.github/ISSUE_TEMPLATE/) - Creating work items
- [CODEOWNERS](../../.github/CODEOWNERS) - Code review assignments

## Quick Reference

```bash
# Start new feature
git checkout develop && git pull
git checkout -b feature/123-description

# Update from develop
git checkout develop && git pull
git checkout feature/123-description
git rebase develop

# Create PR (via GitHub UI or gh CLI)
gh pr create --base develop --title "feat: description"

# Promote through environments
# develop → test
gh pr create --base test --head develop

# test → staging  
gh pr create --base staging --head test

# staging → main (release)
gh pr create --base main --head staging
```
