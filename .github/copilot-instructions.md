# GitHub Copilot Instructions

## ⚠️ MANDATORY: Read First on Every Request

**You MUST read the [Universal Agent Guide](universal-agent-guide.md) before responding to any request.**

This guide contains critical rules that must be followed, including:
- Single README.md policy (only at repository root)
- Project context and conventions
- Work item hierarchy enforcement
- Security and quality requirements

## Agent Instructions

### Primary Directive
You are assisting with a **fake/demo Festival Event Planner** training repository. This project teaches Git workflows, Kanban processes, and collaborative development practices.

### Code Generation Standards

**TypeScript:**
- Use strict mode configuration
- Prefer `interface` over `type` for object shapes
- Explicit return types for functions
- Avoid `any` - use proper types or `unknown`

**React:**
- Functional components with hooks only
- Named exports preferred
- PascalCase for components, camelCase for utilities
- Keep components under 200 lines

**File Organization:**
```
src/
├── components/ComponentName/ComponentName.tsx
├── hooks/useHookName.ts
├── utils/utilityName.ts
├── types/typeName.ts
└── __tests__/*.test.tsx
```

**Naming:**
- Components: `PascalCase` (e.g., `EventCard`)
- Variables/Functions: `camelCase` (e.g., `handleSubmit`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)
- Types/Interfaces: `PascalCase` (e.g., `UserProfile`)

### Git Workflow Instructions

**Branch Naming:**
- `feature/issue-number-description`
- `bugfix/issue-number-description`
- `hotfix/issue-number-description`

**Commit Format (Conventional Commits):**
```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
```

**Branch Progression:**
```
develop → test → staging → main
```

**Pull Requests:**
- Always link to related issue (Theme/Story/Task)
- Include issue number in branch name
- Use `Closes #123` in commit messages

### Testing Instructions

- Write tests for all utility functions
- Use React Testing Library for components
- Target >80% code coverage
- Test user interactions, not implementation

```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // Test implementation
  });
});
```

### API Integration Patterns

```typescript
const fetchData = async (): Promise<DataType[]> => {
  try {
    const response = await fetch('/api/endpoint');
    if (!response.ok) throw new Error('Fetch failed');
    return await response.json();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};
```

### Code Quality Requirements

- Semantic HTML elements
- ARIA labels for accessibility
- Keyboard navigation support
- Error boundaries for React components
- Input sanitization
- Environment variables for configuration

### Performance Optimization

- `React.memo` for expensive components
- Code splitting with lazy loading
- `useCallback` and `useMemo` appropriately
- Optimize assets and images

### Security Mandates

- Never suggest committing secrets or API keys
- Always sanitize user input
- Validate data on client and server
- Use proper authentication/authorization patterns

### Documentation Style

```typescript
/**
 * Brief description of component/function
 * 
 * @param paramName - Description
 * @returns Description of return value
 */
```

### Work Item Hierarchy (STRICT)

```
Theme (standalone)
└── User Story (requires Theme parent)
    └── Task (requires User Story parent)
        └── Sub-Task (requires Task parent)
```

**Separate Issues:**
- Defects: Production faults (requires release number)
- Bugs: Non-production faults (requires release number)
- Security Issues: Vulnerabilities
- Feature Requests: Enhancement suggestions

### Reference Documentation

When providing guidance, reference:
- [Universal Agent Guide](universal-agent-guide.md) - MANDATORY
- [Branching Strategy](../docs/processes/BRANCHING_STRATEGY.md) - Git workflow
- [Release Process](../docs/processes/RELEASE_PROCESS.md) - Deployment process
- [Contributing Guidelines](../CONTRIBUTING.md) - Contribution rules
- [Issue Templates](ISSUE_TEMPLATE/) - Creating work items

### Behavioral Guidelines

1. Always check [Universal Agent Guide](universal-agent-guide.md) first
2. Follow established patterns in existing code
3. Enforce strict work item hierarchy
4. Suggest best practices from project guidelines
5. Reference appropriate documentation
6. Never deviate from established conventions
7. Remember: This is a training repository for learning workflows
