# GitHub Copilot Instructions

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Project Context

This is a **Festival Event Planner** application built with React and TypeScript. It's a training repository designed to teach Git workflows, Kanban processes, and collaborative development practices.

## Code Style & Standards

### TypeScript
- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use explicit return types for functions
- Avoid `any` - use proper types or `unknown`
- Enable strict null checks

### React
- Use functional components with hooks
- Prefer named exports over default exports
- Use TypeScript for props interfaces
- Follow component naming: PascalCase for components, camelCase for utilities
- Keep components small and focused (< 200 lines)

### File Organization
- Components: `src/components/ComponentName/ComponentName.tsx`
- Hooks: `src/hooks/useHookName.ts`
- Utils: `src/utils/utilityName.ts`
- Types: `src/types/typeName.ts`
- Tests: Co-locate with source files as `*.test.tsx` or `*.spec.tsx`

### Naming Conventions
- Components: `PascalCase` (e.g., `EventCard`, `UserProfile`)
- Files: Match component names (e.g., `EventCard.tsx`)
- Variables/Functions: `camelCase` (e.g., `handleSubmit`, `fetchEvents`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`, `MAX_RETRIES`)
- Interfaces/Types: `PascalCase` with descriptive names (e.g., `UserProfile`, `EventData`)

## Git Workflow

### Branch Naming
- Features: `feature/issue-number-short-description`
- Bugs: `bugfix/issue-number-short-description`
- Hotfixes: `hotfix/issue-number-short-description`

### Commit Messages
Follow Conventional Commits:
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, no logic change)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat(auth): add login form validation
fix(events): resolve date picker timezone issue
docs(readme): update installation instructions
```

### Branch Flow
Always follow the standard progression:
```
develop → test → staging → main
```

## Work Item References

When implementing features, always reference the related issue:
- Link to parent User Story or Task in PR description
- Use issue numbers in branch names
- Close issues via commit messages: `Closes #123`

## Testing Requirements

### Unit Tests
- Write tests for all utility functions
- Test components with React Testing Library
- Aim for >80% code coverage
- Test user interactions, not implementation details

### Test Structure
```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    // Test
  });
  
  it('should handle user interaction', () => {
    // Test
  });
});
```

## API Integration

### Fetch Patterns
- Use async/await over promises
- Always handle errors with try/catch
- Use proper TypeScript types for responses
- Implement loading and error states

Example:
```typescript
const fetchEvents = async (): Promise<Event[]> => {
  try {
    const response = await fetch('/api/events');
    if (!response.ok) throw new Error('Failed to fetch');
    return await response.json();
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};
```

## Accessibility

- Use semantic HTML elements
- Include ARIA labels where needed
- Ensure keyboard navigation works
- Maintain proper heading hierarchy
- Test with screen readers

## Performance

- Use React.memo for expensive components
- Implement code splitting with lazy loading
- Optimize images and assets
- Avoid unnecessary re-renders
- Use useCallback and useMemo appropriately

## Security

- Never commit API keys or secrets
- Sanitize user input
- Use environment variables for configuration
- Implement proper authentication/authorization
- Validate data on both client and server

## Documentation

### Code Comments
- Use JSDoc for functions and complex logic
- Explain *why*, not *what* the code does
- Keep comments up-to-date with code changes

### Component Documentation
```typescript
/**
 * EventCard displays event information in a card format
 * 
 * @param event - The event data to display
 * @param onEdit - Callback when edit button is clicked
 */
interface EventCardProps {
  event: Event;
  onEdit?: (id: string) => void;
}
```

## Error Handling

- Use Error Boundaries for React components
- Provide user-friendly error messages
- Log errors for debugging
- Implement retry logic for network requests

## State Management

- Use React Context for global state
- Keep state as local as possible
- Consider using useReducer for complex state logic
- Avoid prop drilling - use context when needed

## Common Patterns

### Custom Hooks
Extract reusable logic into custom hooks:
```typescript
const useEventData = (eventId: string) => {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // ... fetch logic
  
  return { event, loading, error };
};
```

### Form Handling
- Use controlled components
- Validate on submit and optionally on blur
- Provide clear validation messages
- Disable submit during submission

## Important Reminders

1. **This is a training project** - Focus on learning Git workflows and collaboration
2. **Follow the branch strategy** - Always use proper branch flow
3. **Link to issues** - Every PR should reference a Theme/Story/Task
4. **Code review required** - All PRs need approval before merging
5. **Test your changes** - Write tests and verify functionality

## Questions?

Refer to:
- [Branching Strategy](docs/processes/BRANCHING_STRATEGY.md)
- [Release Process](docs/processes/RELEASE_PROCESS.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Issue Templates](.github/ISSUE_TEMPLATE/)
