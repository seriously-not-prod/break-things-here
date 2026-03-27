# Development Agents

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Overview

This document describes the automated agents and assistants configured for this repository to support development workflows, code quality, and team collaboration.

## GitHub Copilot

**Status**: Configured ✅

GitHub Copilot is the primary AI assistant for this repository. All workspace-specific instructions, coding standards, and behavioral guidelines are configured for optimal assistance.

**Configuration Files:**
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - Complete agent instructions
- **[.github/universal-agent-guide.md](.github/universal-agent-guide.md)** - Mandatory rules for all agents

**Capabilities:**
- Code generation following project standards
- TypeScript and React best practices
- Git workflow guidance
- Work item hierarchy enforcement
- Testing and documentation assistance
- Security and accessibility compliance

**Usage:**
Developers can rely on GitHub Copilot for inline suggestions, code completion, and guidance that automatically follows project conventions.

## Configuration Structure

```
.github/
├── copilot-instructions.md      # Main agent instructions
├── universal-agent-guide.md     # Mandatory rules (must read on every request)
├── agents/                      # Future agent configurations
└── instructions/                # Additional detailed instructions
```

## Future Agents (Planned)

The following automated agents are planned for future implementation:

- **Code Review Agent**: Automated PR checks and feedback
- **Issue Management Agent**: Work item lifecycle automation
- **Release Agent**: Release preparation and deployment
- **Documentation Agent**: Documentation sync and validation
- **Dependency Management Agent**: Security updates and version management

## Related Documentation

For complete details on GitHub Copilot configuration and agent behavior:
- [GitHub Copilot Instructions](.github/copilot-instructions.md)
- [Universal Agent Guide](.github/universal-agent-guide.md)
