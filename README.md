# Festival Event Planner

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

A training repository for learning Git workflows, Kanban processes, and collaborative development practices using a React TypeScript festival event planning application as a realistic example.

## Purpose

This repository is designed to teach:
- **Git Workflow**: Four-branch strategy (develop → test → staging → main)
- **Kanban Process**: Work item hierarchy and continuous flow with GitHub Projects
- **Commit Standards**: Conventional Commits with issue tracking
- **Code Review**: Pull request workflow and CODEOWNERS
- **Release Management**: Monthly production releases
- **Documentation**: Complete project documentation standards

**Project Board**: https://github.com/orgs/seriously-not-prod/projects/1

## Getting Started

### Prerequisites

- Git
- GitHub account
- Basic understanding of version control

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/seriously-not-prod/break-things-here.git
   cd break-things-here
   ```

2. **Install git hooks** (enforces commit message standards)
   ```bash
   ./scripts/setup-hooks.sh
   ```

3. **Read the documentation**
   - [Universal Agent Guide](.github/universal-agent-guide.md) - Mandatory rules
   - [Branching Strategy](docs/processes/branching-strategy.md) - Git workflow
   - [Release Process](docs/processes/release-process.md) - Deployment process
   - [Contributing Guidelines](CONTRIBUTING.md) - How to contribute

## Repository Structure

```
.
├── .github/
│   ├── ISSUE_TEMPLATE/       # Issue templates (Theme, Story, Task, etc.)
│   ├── workflows/
│   │   └── pr-validation.yml # CI validation workflow
│   ├── copilot-instructions.md
│   ├── universal-agent-guide.md
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .git-hooks/
│   ├── commit-msg            # Validates commit messages
│   └── SETUP.md
├── docs/
│   ├── processes/
│   │   ├── branching-strategy.md
│   │   └── release-process.md
│   └── requirements/         # Project requirement documents
├── scripts/
│   ├── setup-hooks.sh        # Git hooks installation script
│   └── validate-issue-hierarchy.js  # Issue hierarchy validator
├── AGENTS.md                 # AI assistant configuration
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── SECURITY.md
```

## Workflow Overview

### Branch Strategy

| Branch    | Purpose           | Deployed To     |
|-----------|-------------------|-----------------|
| `develop` | Integration       | Development     |
| `test`    | QA Testing        | Test            |
| `staging` | Pre-production    | Staging/UAT     |
| `main`    | Production        | Production      |

### Creating Work Items

Follow the strict hierarchy using GitHub's **native sub-issues**:
```
Theme (standalone issue)
└── User Story (sub-issue of Theme)
    └── Task (sub-issue of User Story)
        └── Sub-Task (sub-issue of Task)
```

**How to Create:**
1. Start by creating a Theme issue
2. Open the Theme and click "Create sub-issue" → Select User Story template
3. Open the User Story and click "Create sub-issue" → Select Task template
4. Open the Task and click "Create sub-issue" → Select Sub-Task template

Use the [issue templates](.github/ISSUE_TEMPLATE/) for structured work items.

### Making Changes

1. **Select work from [Project Board](https://github.com/orgs/seriously-not-prod/projects/1)**: Choose an item from **Ready** column
2. **Move to In Progress**: Drag the item to **In Progress** status
3. Create a branch: `feature/123-description` or `bugfix/456-description`
4. Make changes with atomic commits
5. Commit with issue reference: `feat(scope): description #123`
6. Create Pull Request to `develop` (auto-moves to **Code Review** status)
7. **CI automatically validates:**
   - Issue hierarchy is correct
   - All commits reference open issues
8. Address review feedback
9. Merge after approval (moves to **Testing** → **Ready for Release** → **Released**)

### Commit Message Format

**Required**: Every commit must reference an open GitHub issue.

```
type(scope): description #123

Optional body with details.

Closes #123
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

See [Branching Strategy](docs/processes/branching-strategy.md) for complete commit guidelines.

## Documentation

### Process Documentation
- [Branching Strategy](docs/processes/branching-strategy.md) - Complete Git workflow
- [Release Process](docs/processes/release-process.md) - Monthly release cadence
- [Contributing Guidelines](CONTRIBUTING.md) - How to contribute
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community standards

### Configuration
- [Universal Agent Guide](.github/universal-agent-guide.md) - Mandatory rules for all agents
- [GitHub Copilot Instructions](.github/copilot-instructions.md) - AI assistant setup
- [CODEOWNERS](.github/CODEOWNERS) - Code review assignments
- [Issue Templates](.github/ISSUE_TEMPLATE/) - Work item templates

### Project Information
- [AGENTS.md](AGENTS.md) - Development agents and automation
- [CHANGELOG.md](CHANGELOG.md) - Release history
- [SECURITY.md](SECURITY.md) - Security policies
- [LICENSE](LICENSE) - MIT License

## Git Hooks

This repository includes git hooks to enforce commit standards:

**Installation:**
```bash
./scripts/setup-hooks.sh
```

**Validations:**
- ✅ Commit messages must reference GitHub issue (#123)
- ✅ Conventional Commits format
- ✅ Subject line ≤72 characters
- ✅ Imperative mood
- ✅ No trailing period

See [.git-hooks/SETUP.md](.git-hooks/SETUP.md) for details.

## Key Features

- ✅ Four-branch workflow with environment progression
- ✅ **GitHub Projects (Project 1)** for visual Kanban workflow
- ✅ Strict work item hierarchy enforcement
- ✅ Complete issue template collection
- ✅ Automated commit message validation
- ✅ **Automated CI validation of issue hierarchy**
- ✅ **Automated commit message validation in PRs**
- ✅ Pull request template
- ✅ Code ownership and review process
- ✅ Monthly release cadence
- ✅ Comprehensive documentation
- ✅ AI assistant configuration (GitHub Copilot)

## Learning Objectives

By using this repository, you will learn:

1. **Git Branching**: How to manage multiple environments with branches
2. **Commit Discipline**: Writing meaningful, traceable commit messages
3. **Issue Tracking**: Creating and linking work items properly
4. **Code Review**: Pull request workflow and feedback process
5. **Release Management**: Coordinating monthly production deployments
6. **Documentation**: Maintaining project documentation
7. **Collaboration**: Working with CODEOWNERS and team reviews

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Pull request process
- Commit message requirements
- Code style guidelines
- Testing requirements

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Support

This is a training repository. For questions:
- Review the [documentation](docs/)
- Check [issue templates](.github/ISSUE_TEMPLATE/)
- Read the [Universal Agent Guide](.github/universal-agent-guide.md)

---

**Remember**: This is a fake/demo project for learning purposes only. No feedback will be collected or worked on. Use at your own risk.
