# Quick Start Guide

> **Latest Update**: Database integration with cookie-based authentication now live on `develop` branch!

## For New Team Members

### 1. Clone and Setup (First Time)

```bash
# Clone the repository
git clone https://github.com/seriously-not-prod/break-things-here.git
cd break-things-here

# Checkout develop branch (latest features)
git checkout develop

# Install dependencies
npm install
cd backend && npm install && cd ..

# Setup git hooks (enforces commit standards)
./scripts/setup-hooks.sh
```

### 2. Verify Setup

```bash
# Build frontend
npm run build

# Build backend
cd backend && npm run build && cd ..

# Run frontend tests
npm test

# Run backend tests
docker compose up -d db-test
cd backend && npm test && cd ..
```

All builds should succeed and all tests should pass.

### 3. Run the Application

**Terminal 1 - Backend API:**
```bash
docker compose up -d db
cd backend
npm run dev
```
Backend runs on `http://localhost:4000`

**Terminal 2 - Frontend:**
```bash
npm run dev
```
Frontend runs on `http://localhost:5173`

### 4. Access the Application

Open your browser to: **http://localhost:5173**

**Default Users (for testing):**
- **Admin:** admin@festival.local / festivalAdmin2025
- **User:** alice@email.com / password123

## For Existing Team Members Pulling Latest Changes

### Update Your Local Repository

```bash
# Fetch latest changes
git fetch origin

# Update develop branch
git checkout develop
git pull origin develop

# Install any new dependencies
npm install
cd backend && npm install && cd ..

# Rebuild to ensure everything compiles
npm run build
cd backend && npm run build && cd ..
```

### What's New in Latest Develop

**✅ Database Integration (PR #185 - Merged)**
- PostgreSQL database replaced localStorage
- Cookie-based JWT authentication
- Session timeout and token refresh
- CSRF protection enabled
- ReDoS vulnerabilities fixed

**New Files:**
- `backend/src/db/database.ts` - Database connection and migrations
- `backend/src/controllers/` - Event, Task, and RSVP controllers
- `src/api/event-planner-api.ts` - Frontend API client
- `database/init.sql` - Database schema

**Modified Files:**
- `src/hooks/use-event-planner-store.ts` - Now uses backend API
- `src/contexts/auth-context.tsx` - Cookie-based auth
- `backend/src/index.ts` - CSRF protection middleware

### Verify Everything Works

```bash
# Run the event planner tests
npm test -- src/__tests__/event-planner-app.test.tsx
```

Expected output: **3 tests passed**

## Database Information

### Development Database

The backend uses **PostgreSQL**. Start the database with Docker before running the backend:

```bash
docker compose up -d db
```

- **Connection**: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/festival_planner`
- **Schema**: See `database/init.sql`
- **Reset**: Drop and recreate the database, then restart the backend (migrations run automatically on startup)

### Test Database

Backend integration tests use a separate PostgreSQL instance on port `5433`.

```bash
docker compose up -d db-test
cd backend && npm test
```

- **Connection**: `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/festival_planner_test`
- **Override**: Set `TEST_DATABASE_URL` explicitly if you need a different host or port

### Check Database Contents

```bash
cd backend
node scripts/check-database.mjs
```

This shows all users, events, tasks, and RSVPs in the database.

### Default Admin Account

A default admin user is created automatically:
- **Email:** admin@festival.local
- **Password:** festivalAdmin2025
- **Role:** Admin (can manage all events and users)

## Common Issues and Solutions

### "Cannot connect to backend"
- Ensure the main database is running: `docker compose up -d db`
- Ensure backend is running on port 4000: `cd backend && npm run dev`
- Check if another process is using port 4000: `lsof -i :4000`

### "Authentication failed"
- Database may not be initialized - restart backend to trigger auto-init
- Try logging in with admin@festival.local / festivalAdmin2025

### "Tests failing"
```bash
# Clean install dependencies
rm -rf node_modules backend/node_modules
npm install
cd backend && npm install && cd ..

# Clear build cache
rm -rf dist backend/dist

# Start the dedicated backend test database
docker compose up -d db-test

# Rebuild
npm run build
cd backend && npm run build && cd ..
```

### "CSRF token error"
- Clear browser cookies and refresh
- Restart both frontend and backend

## Development Workflow

### Creating New Features

```bash
# Create feature branch from develop
git checkout develop
git pull origin develop
git checkout -b feature/issue-number-description

# Make changes, commit, push
git add .
git commit -m "feat: description #issue-number"
git push origin feature/issue-number-description

# Create PR to develop branch
```

### Running in Production Mode

```bash
# Build optimized bundles
npm run build
cd backend && npm run build && cd ..

# Set production environment
export NODE_ENV=production
export DATABASE_URL=postgresql://postgres:password@your-db-host:5432/festival_planner

# Run backend
cd backend && node dist/index.js
```

## Need Help?

- **Documentation:** See [README.md](README.md)
- **Branching Strategy:** [docs/processes/branching-strategy.md](docs/processes/branching-strategy.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Project Board:** https://github.com/orgs/seriously-not-prod/projects/1

## Latest CI Status

All CI checks passing on develop:
- ✅ Code Quality
- ✅ CodeQL Security Scan
- ✅ TypeScript Compilation
- ✅ Test Suite
- ✅ Issue Hierarchy Validation
- ✅ Commit Message Validation

**Last Verified:** April 17, 2026
