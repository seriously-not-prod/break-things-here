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
- Understand the four-branch strategy: `develop` → `test` → `staging` → `main`
- Never suggest direct commits to protected branches
- Always use proper branch naming conventions
- Reference: [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md)

### Rule #8: Work Item Hierarchy
Enforce the strict hierarchy:
```
Theme (standalone)
└── User Story (must have parent Theme)
    └── Task (must have parent User Story)
        └── Sub-Task (must have parent Task)
```

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

### Rule #13: AI Assistant Behavior
When assisting with code or documentation:
1. **Read this guide first** on every request
2. Check for existing patterns and follow them
3. Reference appropriate documentation
4. Suggest best practices from project guidelines
5. Enforce the rules defined here
6. Never deviate from established conventions

## Quick Reference

| Topic | Document |
|-------|----------|
| Branching | [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md) |
| Releases | [docs/processes/release-process.md](docs/processes/release-process.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Issue Templates | [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/) |
| Code Ownership | [.github/CODEOWNERS](.github/CODEOWNERS) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |
| Security | [SECURITY.md](SECURITY.md) |

## Enforcement

These rules are **MANDATORY**. Violations indicate:
1. The guide was not read
2. Instructions were not followed
3. Project conventions were ignored

Always prioritize following this guide over convenience or assumptions.

## Updates

This guide may be updated as the project evolves. Always check for the latest version before providing assistance.

**Last Updated**: January 21, 2026
