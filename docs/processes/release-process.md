# Release Process

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Overview

This project follows a **Kanban-based release process** with **monthly production deployments**. The process is designed to provide continuous flow while maintaining regular, predictable releases.

## Release Cadence

- **Production Releases**: Monthly (first Tuesday of each month)
- **Release Branches**: Created one week before deployment
- **Code Freeze**: 3 business days before release
- **Hotfixes**: As needed for critical production issues

## Branch Structure

This project uses a **four-branch strategy** with environment progression:

| Branch    | Environment   | Purpose                        | Auto-Deploy |
|-----------|---------------|--------------------------------|-------------|
| `develop` | Development   | Integration and active dev     | Yes         |
| `test`    | Testing/QA    | Quality assurance testing      | Yes         |
| `staging` | Staging/UAT   | Pre-production validation      | Yes         |
| `main`    | Production    | Live production environment    | Manual      |

**Standard Flow**: `develop` → `test` → `staging` → `main`

For detailed branching guidelines, see [Branching Strategy](branching-strategy.md).

## Kanban Board Structure

### Columns

1. **Backlog** - All themes, stories, and issues not yet started
2. **Ready** - Items refined and ready to be worked on
3. **In Progress** - Active work in development
4. **Code Review** - Pull requests under review
5. **Testing** - Items being tested in non-production environments
6. **Ready for Release** - Approved and tested, waiting for next release
7. **Released** - Deployed to production

### Work In Progress (WIP) Limits

- **In Progress**: Max 5 items per developer
- **Code Review**: Max 10 items total
- **Testing**: Max 8 items total

## Work Item Hierarchy

### Structure

```
Theme (standalone)
└── User Story (must have parent Theme)
    └── Task (must have parent User Story)
        └── Sub-Task (must have parent Task)
```

### Rules

- **Themes**: Standalone items that organize User Stories
- **User Stories**: Must relate to a Theme; cannot be standalone
- **Tasks**: Must relate to a User Story; cannot be standalone
- **Sub-Tasks**: Must relate to a Task; cannot be standalone

### Other Issue Types

- **Defects**: Production-only faults, require release number where reproduced
- **Bugs**: Non-production faults, require release number where reproduced
- **Security Issues**: Vulnerability findings
- **Feature Requests**: Enhancement suggestions (can be converted to Themes/Stories)

## Release Process Workflow

### Phase 1: Planning (Ongoing)

1. **Backlog Refinement**
   - Review and prioritize Themes
   - Break down Themes into User Stories
   - Break down User Stories into Tasks
   - Estimate effort

2. **Ready Queue**
   - Move refined items to Ready column
   - Ensure acceptance criteria are clear
   - Verify dependencies are resolved

### Phase 2: Development (Continuous)

1. **Pull from Ready**
   - Developers pull items from Ready column
   - Move to In Progress
   - Create feature branch from `develop`

2. **Implementation**
   - Branch: `feature/issue-number-description` or `bugfix/issue-number-description`
   - Follow coding standards
   - Write tests
   - Update documentation
   - Create Sub-Tasks as needed

3. **Pull Request to develop**
   - Submit PR when complete: `feature/xxx` → `develop`
   - Move to Code Review column
   - Request reviewers per CODEOWNERS
   - Link to related issue (Theme/Story/Task)

### Phase 3: Review & Testing (Continuous)

1. **Code Review**
   - Review within 24 hours
   - Address feedback
   - Approve when ready

2. **Merge to develop**
   - Merge approved PR to `develop`
   - Auto-deploy to development environment
   - Delete feature branch

3. **Promote to test**
   - Create PR: `develop` → `test`
   - Auto-deploy to testing environment
   - Move to Testing column in Kanban

4. **QA Testing**
   - Automated tests run in CI/CD
   - Manual testing in test environment
   - Verify acceptance criteria
   - Document test results

5. **Promote to staging**
   - Create PR: `test` → `staging`
   - Auto-deploy to staging environment
   - Ready for UAT

6. **Staging Validation**
   - User Acceptance Testing
   - Performance testing
   - Security scanning
   - Move to Ready for Release

### Phase 4: Release Preparation (T-7 days)

1. **Prepare staging for Release**
   - Ensure all items in Ready for Release are merged to `staging`
   - Update version numbers
   - Generate preliminary release notes

2. **Final Testing**
   - Complete UAT in staging environment
   - Security scan results reviewed
   - Performance testing validated

3. **Code Freeze (T-3 days)**
   - Freeze merges to `staging`
   - Only critical bug fixes allowed
   - All fixes require expedited approval

### Phase 5: Deployment (Monthly)

1. **Pre-Deployment**
   - Backup production database
   - Notify stakeholders
   - Prepare rollback plan
   - Create final release notes

2. **Deployment**
   - Create PR: `staging` → `main`
   - Get final approval
   - Merge to `main`
   - Deploy to production (first Tuesday)
   - Monitor application health
   - Verify critical paths

3. **Post-Deployment**
   - Update CHANGELOG
   - Close released issues
   - Tag release in GitHub
   - Create GitHub release with notes

4. **Monitoring**
   - Monitor for 24 hours
   - Track error rates
   - Gather user feedback

## Hotfix Process

For critical production issues (Defects):

1. **Identification**
   - Create Defect issue with production release number
   - Assess severity and impact
   - Determine if hotfix is required

2. **Hotfix Branch**
   - Branch from `main`: `hotfix/issue-number-description`
   - Implement fix
   - Test thoroughly in local/dev environment

3. **Expedited Review**
   - Create PR: `hotfix/xxx` → `main`
   - Mandatory code review (expedited)
   - Fast-track testing in staging
   - Approve for deployment

4. **Deploy to Production**
   - Merge to `main`
   - Deploy to production immediately
   - Tag release with patch version
   - Monitor closely

5. **Back-Merge to Other Branches**
   - Merge `main` → `staging`
   - Merge `staging` → `test`
   - Merge `test` → `develop`
   - This ensures hotfix flows through all environments

5. **Post-Hotfix**
   - Document lessons learned
   - Update monitoring/alerts

## Version Numbering

Following Semantic Versioning (SemVer):

- **Major (X.0.0)**: Breaking changes
- **Minor (1.X.0)**: New features, backwards compatible
- **Patch (1.0.X)**: Bug fixes, backwards compatible

## Release Checklist

### One Week Before
- [ ] Create release branch
- [ ] Update version numbers
- [ ] Generate preliminary release notes
- [ ] Begin UAT testing

### Three Days Before
- [ ] Code freeze in effect
- [ ] Complete security scan
- [ ] Complete performance testing
- [ ] Final release notes review

### Deployment Day
- [ ] Backup production
- [ ] Deploy to production
- [ ] Verify deployment
- [ ] Monitor application

### Post-Deployment
- [ ] Update CHANGELOG
- [ ] Tag release in GitHub
- [ ] Close released issues
- [ ] Send release announcement

## Metrics

Track the following metrics for continuous improvement:

- **Lead Time**: Time from Ready to Released
- **Cycle Time**: Time from In Progress to Released
- **Deployment Frequency**: Monthly cadence maintained
- **Defect Rate**: Production defects per release
- **Rollback Rate**: Percentage of releases requiring rollback

## Communication

- **Daily**: Stand-up to review Kanban board
- **Weekly**: Backlog refinement session
- **Release Week**: Daily release status updates
- **Post-Release**: Retrospective within 3 days

## Tools

- **Project Board**: GitHub Projects (Kanban view)
- **Issue Tracking**: GitHub Issues
- **Version Control**: Git/GitHub
- **CI/CD**: GitHub Actions
- **Monitoring**: Application logs and metrics

## Roles & Responsibilities

- **Product Owner**: Prioritize backlog, define acceptance criteria
- **Development Team**: Pull work, implement, test, deploy
- **Code Reviewers**: Review PRs per CODEOWNERS
- **Release Manager**: Coordinate monthly releases
- **QA Team**: Testing and validation

## References

- [Branching Strategy](branching-strategy.md) - Detailed branch workflow and naming
- [CHANGELOG.md](../../CHANGELOG.md) - Release history
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Contribution guidelines
- [Issue Templates](../ISSUE_TEMPLATE/) - Creating work items
- [CODEOWNERS](../../.github/CODEOWNERS) - Code review assignments
