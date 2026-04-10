# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## [Unreleased]

### Added
- User registration endpoint with bcrypt password hashing, email normalization, and validation (#16, #20)
- Email confirmation flow with token generation and single-use enforcement (#16, #74)
- Password reset and recovery with secure token generation and audit logging (#74)
- Registration form React component with ARIA accessibility and keyboard navigation (#20)
- In-memory user store with `emailConfirmed` field and `confirmEmail` method (#16)
- Express app factory (`createApp`) exposing `/api/auth/register` and `/api/auth/confirm-email` routes (#16)
- Docker Desktop development environment with frontend, backend, and PostgreSQL services (#52)
- GitHub Actions workflows: `auto-draft-pr.yml` and `branch-assignee-check.yml` (#48)
- Branch naming convention enforced via repository ruleset (#48)
- GitHub CLI usage documented and enforced as the standard for all GitHub interactions (#53)
- `validate-issue-hierarchy.js` migrated to GraphQL API for reliable sub-issue parent detection (#72)

### Fixed
- TypeScript error: `AuthRequest` interface now includes `multer` `file` property in profile-controller.ts (#102)
- Password reset audit log now always written regardless of email delivery success (#74)
- All test files migrated from `jest.*` API calls to `vi.*` equivalents for vitest compatibility (#26)
- ESM module mocking patterns corrected using `vi.mock` with `vi.fn()` factory functions (#26)
- Missing runtime dependencies installed: `@testing-library/dom`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `supertest`, `express` (#26)

### Next.js App Router project scaffold with TypeScript (#50)
- MUI (Material UI) integration with theme provider and CssBaseline (#50)
- Frontend folder structure: components, hooks, utils, types (#50)
- Backend API routes scaffold under `src/app/api/` (#50)
- Data tier structure: models, config, migrations under `src/data/` (#50)
- Initial app layout with MUI AppBar (#50)
- ESLint configuration with Next.js rules (#50)
- GitHub Projects (Project 1) integration for visual Kanban workflow management
- Project automation workflow to auto-add issues and PRs to Project 1
- Workflow status fields: Backlog → Ready → In Progress → Code Review → Testing → Ready for Release → Released
- Project Board link in README and release process documentation
- Instructions for adding issues to Project 1

### Changed
- Updated README.md with GitHub Projects workflow integration
- Updated docs/processes/release-process.md with Project 1 details and workflow states
- Enhanced Making Changes section with project board workflow steps

## [Unreleased - Previously]

### Added
- Initial project structure
- Documentation framework
- Issue templates for project management (Theme, User Story, Task, Sub-Task, Bug, Defect, Security Issue, Feature Request)
- GitHub sub-issues integration for work item hierarchy
- Release process documentation
- Branching strategy documentation
- CI validation workflow for PR issue hierarchy
- CI validation workflow for commit messages
- Issue hierarchy validation script (validate-issue-hierarchy.js)
- Git hooks for commit message validation
- CODEOWNERS file for code review assignments
- Pull request template with hierarchy validation
- Automated CI comments on PRs for validation results

### Changed
- Issue templates updated to use GitHub native sub-issues instead of manual parent references
- User Story template: removed story points, added hour estimation ranges
- Task and Sub-Task templates: converted estimated hours to dropdown ranges
- Workflow naming convention: CI workflows prefixed with `ci-`, CD workflows prefixed with `cd-`
- Repository structure updated to include workflows and validation scripts

### Deprecated

### Removed

### Fixed

### Security

---

## Release History

<!-- Releases will be documented below in reverse chronological order -->

<!-- 
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Features that will be removed in upcoming releases

### Removed
- Features removed in this release

### Fixed
- Bug fixes

### Security
- Security patches and vulnerability fixes

-->

---

## Legend

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Features that will be removed in upcoming releases
- **Removed**: Features removed in this release
- **Fixed**: Bug fixes
- **Security**: Security patches and vulnerability fixes

---

## Release Notes Guidelines

When updating this changelog:

1. Always update the `[Unreleased]` section during development
2. When creating a release, move items from `[Unreleased]` to a new version section
3. Use the format `## [X.Y.Z] - YYYY-MM-DD` for version headers
4. Include issue/PR numbers where applicable: `- Fix login bug (#123)`
5. Group changes by category (Added, Changed, Fixed, etc.)
6. Write in imperative mood: "Add feature" not "Added feature"
7. Link to compare views: `[X.Y.Z]: https://github.com/user/repo/compare/vX.Y.Z-1...vX.Y.Z`

---

[Unreleased]: https://github.com/seriously-not-prod/break-things-here/compare/main...HEAD
