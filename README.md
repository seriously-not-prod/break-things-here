# Festival Event Planner

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

A training repository for learning Git workflows, Kanban processes, and collaborative development practices using a React TypeScript festival event planning application as a realistic example.

## Purpose

This repository is designed to teach:

- **Git Workflow**: Four-branch strategy (develop → test → stage → main)
- **Kanban Process**: Work item hierarchy and continuous flow with GitHub Projects
- **Commit Standards**: Conventional Commits with issue tracking
- **Code Review**: Pull request workflow and CODEOWNERS
- **Release Management**: Monthly production releases
- **Documentation**: Complete project documentation standards

**Project Board**: https://github.com/orgs/seriously-not-prod/projects/1

## Getting Started

### Tech Stack

- **Frontend**: [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Routing**: [React Router](https://reactrouter.com/)
- **UI Layer**: Custom responsive workspace shell with existing MUI dependencies available in the repo
- **Backend**: Express and additional training API surfaces under `backend/` and `src/api/`
- **Data Tier**: Sample seeded planner data with local persistence in the active root app
- **Package Manager**: npm

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm
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

3. **Install dependencies**

   ```bash
   npm install
   ```

   Optional training surfaces can also be installed independently when needed:

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

   Backend tests resolve `TEST_DATABASE_URL` when provided. Without it, the backend defaults to the dedicated local test database at `postgresql://postgres:postgres@127.0.0.1:5433/festival_planner_test`.

4. **Read the documentation**
   - [Universal Agent Guide](.github/universal-agent-guide.md) - Mandatory rules
   - [Branching Strategy](docs/processes/branching-strategy.md) - Git workflow
   - [Release Process](docs/processes/release-process.md) - Deployment process
   - [Contributing Guidelines](CONTRIBUTING.md) - How to contribute

### Running the Application

Run the active root application:

```bash
npm run dev
```

Optional: run backend API in another terminal when working on backend training tasks:

```bash
docker compose up -d db
cd backend && npm run dev
```

Optional: run the separate `frontend/` training app surface if you specifically need it:

```bash
cd frontend && npm run dev
```

The active root planner app runs on `http://localhost:5173` and the backend runs on `http://localhost:4000`.

Current implementation includes:

- Dashboard with event, RSVP, and task summaries
- Sidebar and top navigation with responsive mobile behavior
- Event list, create, detail, and edit flows (with owner filter, tag filter, and full-text search)
- Task tracking linked to events
- RSVP management plus a public RSVP route (`/rsvp/:eventId`)
- Minimal admin overview with sample users and activity logs
- **Gallery management**: upload, delete (with confirmation), and caption editing of event images; `GET/DELETE/PATCH /api/events/:id/gallery`
- **Messaging**: live event-thread messaging backed by `GET/POST /api/events/:id/messages`; no mock data

### Backend Environment Variables

| Variable                    | Default                 | Purpose                                                           |
| --------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `PORT`                      | `4000`                  | Backend server port                                               |
| `CORS_ALLOWED_ORIGINS`      | `http://localhost:5173` | Comma-separated list of allowed CORS origins                      |
| `LOGIN_RECORD_TTL_MS`       | `600000`                | How long login attempt records are retained after lockout expires |
| `MAX_TRACKED_LOGIN_RECORDS` | `5000`                  | Maximum number of login attempt records kept in memory            |

For local development, `backend/.env` is loaded automatically when present. If no database URL is set, the backend falls back to `postgresql://postgres:postgres@127.0.0.1:5432/festival_planner`, so `docker compose up -d db` plus `cd backend && npm run dev` is enough for the standard local path.

In development, the Postgres-backed backend auto-seeds these demo users on startup:

- `admin@festival.local` / `festivalAdmin2025`
- `alice@email.com` / `password123`

For local development, the backend allows requests from `http://localhost:5173` by default. In non-local environments, set `CORS_ALLOWED_ORIGINS` to a comma-separated list of frontend origins instead of changing the code.

`LOGIN_RECORD_TTL_MS` and `MAX_TRACKED_LOGIN_RECORDS` must be positive integers. Invalid values fall back to the defaults.

### Building for Production

```bash
npm run build
```

To run backend integration tests locally, start the dedicated test database first:

```bash
docker compose up -d db-test
cd backend && npm test
```

## Repository Structure

```
.
├── .github/
│   ├── ISSUE_TEMPLATE/       # Issue templates (Theme, Story, Task, etc.)
│   ├── rulesets/             # Repository ruleset definitions
│   ├── workflows/
│   │   ├── ci-pr-validation.yml   # PR issue/commit validation
│   │   ├── branch-assignee-check.yml # Branch ownership checks
│   │   ├── auto-draft-pr.yml      # Auto-create draft PRs
│   │   ├── code-quality.yml       # Build and test checks
│   │   └── codeql.yml             # Security scanning
│   ├── copilot-instructions.md
│   ├── universal-agent-guide.md
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .git-hooks/
│   ├── commit-msg            # Validates commit messages
│   └── SETUP.md
├── src/
│   ├── app/                  # Next.js App Router pages and layouts
│   │   ├── api/              # Backend API route handlers
│   │   ├── layout.tsx        # Root layout with MUI theme
│   │   └── page.tsx          # Home page
│   ├── components/           # Reusable React components
│   ├── data/                 # Data tier
│   │   ├── config/           # Database configuration
│   │   ├── models/           # Data models
│   │   └── migrations/       # Database migrations
│   ├── hooks/                # Custom React hooks
│   ├── theme/                # MUI theme configuration
│   ├── types/                # Shared TypeScript types
│   ├── utils/                # Utility functions
│   └── __tests__/            # Test files
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

| Branch    | Purpose        | Deployed To |
| --------- | -------------- | ----------- |
| `develop` | Integration    | Development |
| `test`    | QA Testing     | Test        |
| `stage`   | Pre-production | Stage/UAT   |
| `main`    | Production     | Production  |

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

### Database Documentation

- [Schema Reference](docs/database/schema.md) - Generated table/column/index/RLS reference for `public` schema
- [ER Diagram (SVG)](docs/database/erd.svg) - Generated entity relationship diagram from live schema
- Regenerate both artifacts with: `./scripts/generate-erd.sh`

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
