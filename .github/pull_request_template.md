## Description

<!-- Provide a clear and concise description of your changes -->

## Related Issue

<!-- Link to the issue this PR addresses -->

Closes #

## Type of Change

<!-- Mark the appropriate option with an "x" -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Code refactoring
- [ ] Performance improvement
- [ ] Test updates

## Work Item Hierarchy

<!-- Indicate the work item hierarchy this PR relates to -->
<!-- CI will automatically validate that issues follow proper hierarchy -->

- Theme: #
- User Story: # (must be sub-issue of Theme)
- Task: # (must be sub-issue of User Story)

## Changes Made

<!-- List the main changes in this PR -->

-
-
-

## Database Changes

<!-- Complete this section if your PR includes database schema changes -->

- [ ] No database changes in this PR
- [ ] New migration file added to `database/migrations/` (timestamped `YYYYMMDDHHMMSS_description.sql`)
- [ ] Migration includes `-- DOWN` rollback block
- [ ] Migration tested locally against PostgreSQL
- [ ] `DATABASE_URL` uses correct environment-specific connection string
- [ ] Seed data updated in `database/seeds/` if applicable

## Database Changes
<!-- Complete this section if your PR includes database schema changes -->
- [ ] No database changes in this PR
- [ ] New migration file added to `database/migrations/` (timestamped `YYYYMMDDHHMMSS_description.sql`)
- [ ] Migration includes `-- DOWN` rollback block
- [ ] Migration tested locally against PostgreSQL
- [ ] `DATABASE_URL` uses correct environment-specific connection string
- [ ] Seed data updated in `database/seeds/` if applicable

## Testing Performed

<!-- Describe the testing you've done -->

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed
- [ ] Test coverage maintained/improved

### Test Details:

<!-- Describe what you tested -->

## Checklist

<!-- Mark completed items with an "x" -->

- [ ] My code follows the project's code style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] All commits reference an open GitHub issue (#123)
- [ ] All commits follow Conventional Commits format
- [ ] Referenced issues follow proper hierarchy (validated by CI)

## Breaking Changes

<!-- If this PR contains breaking changes, describe them here -->
<!-- Format: BREAKING CHANGE: description -->

## Screenshots (if applicable)

<!-- Add screenshots to help explain your changes -->

## Additional Notes

<!-- Any additional information reviewers should know -->

## Deployment Notes

<!-- Any special deployment considerations -->

- [ ] No special deployment steps required
- [ ] Requires PostgreSQL database migration (migration file added to `database/migrations/`) — or `database/init.sql` updated if PostgreSQL migration is not yet complete
- [ ] Requires environment variable changes (`DATABASE_URL` or other)
- [ ] Requires configuration updates

---

**Reviewer Checklist:**

- [ ] Code quality and style are consistent
- [ ] All commits reference open issues
- [ ] Issue hierarchy is valid (CI validates automatically)
- [ ] Tests are adequate and passing
- [ ] Documentation is updated
- [ ] No security concerns identified
