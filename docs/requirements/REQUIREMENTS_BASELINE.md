# Festival & Event Planner - Comprehensive Requirements Document

**Document Generated:** May 19, 2026

## Source Documents

- Business Requirements Document (BRD) v2.0 | January 22, 2026
- Functional Requirements Document (FRD) v1.0 | January 22, 2026
- User Personas v1.0 | January 22, 2026
- Technical Requirements Document (TRD) v1.0 | January 22, 2026
- Use Cases Document | January 22, 2026

---

# SECTION 1: BUSINESS REQUIREMENTS & OBJECTIVES

## 1.1 Executive Summary

The Festival & Event Planner is a modern web application designed to streamline event planning and management.
The application serves dual purposes: providing a fully-functional event planning solution while demonstrating
AI-assisted development practices and modern web technologies.

### Key Characteristics:

- **Technology:** React, Next.js, Material-UI, PostgreSQL, Express API
- **Authentication:** Azure Entra ID with SSO and MFA
- **Access Control:** Role-Based Access Control (RBAC) with 5 distinct user groups
- **Deployment:** Docker-based containerized architecture
- **Security:** Enterprise-grade with Row-Level Security (RLS)

## 1.2 Business Goals & Objectives

### Primary Goals:

1. Provide a comprehensive, production-ready event planning solution
2. Demonstrate modern web application development best practices
3. Serve as a hands-on learning platform for AI-assisted development
4. Showcase integration of React, Next.js, PostgreSQL, and Azure Entra ID
5. Create a scalable architecture supporting future enhancements
6. Build a template for similar enterprise applications

### Business Objectives:

1. Enable users to create and manage unlimited events with full lifecycle support
2. Facilitate real-time collaboration among multiple event organizers
3. Provide comprehensive budget tracking and expense management
4. Streamline guest management with automated RSVP tracking
5. Organize event preparation through intelligent task management
6. Support vendor coordination with ratings and booking management
7. Enable event timeline planning with conflict detection
8. Deliver actionable analytics and insights

## 1.3 Success Metrics

### Efficiency Metrics:

- Create basic event in under 5 minutes
- Create fully-planned event in under 30 minutes
- Manage 50+ guest RSVPs in under 10 minutes
- Budget accuracy within 5% of actual expenses

### Performance Metrics:

- Page load time under 2 seconds
- API response time under 500ms
- Support 100+ concurrent users
- Achieve 99% uptime for production deployment

## 1.4 MVP Scope - Feature Categories

Schema reference alignment note (BRD v2.0 §1.4):

- The canonical database schema reference is `docs/database/schema.md`.
- The current live schema contains 60+ tables (currently 64 in the generated reference).
- Any mention of an "11-table core" in legacy planning artifacts is historical context, not the current implementation baseline.

### Authentication & Security

- Azure Entra ID with OpenID Connect and JWT
- Multi-factor Authentication (MFA) support
- Single Sign-On (SSO) capability
- Role-Based Access Control (5 Azure Entra groups)
- Session management with 30-minute timeout
- Security event audit logging

### Event Management

- Create/Edit/Delete events with full lifecycle
- Support for single-day and multi-day events
- Event type taxonomy (Birthday, Wedding, Corporate, etc.)
- Event status workflow (Draft, Planning, Confirmed, Active, Completed, Cancelled)
- Public/private visibility settings
- Event capacity limits with waitlist management
- Event archival and soft-delete recovery
- Event cloning and templating
- Calendar, list, grid, and timeline views with filtering

### Guest Management

- Add guests individually or bulk import from CSV/Excel
- RSVP status tracking (Pending, Confirmed, Declined, Maybe, No Response)
- Guest profile management with dietary restrictions and accessibility needs
- Plus-one allowance tracking
- RSVP deadline with automatic reminders
- Seating and check-in management
- Mobile-optimized guest RSVP portal (no login required)
- QR code generation for easy RSVP access
- Digital invitations with personalization

### Budget Management

- Overall budget setting with threshold alerts
- Pre-defined and custom budget categories
- Budget allocation with percentages
- Expense tracking with receipt attachments
- Multi-currency support with exchange rates
- Budget vs actual comparison charts
- Financial reporting and forecasting
- Oversspending alerts and warnings

### Task Management

- Create tasks with priority levels (Low, Medium, High, Urgent)
- Task assignment to single or multiple team members
- Task dependencies (blocking/blocked relationships)
- Kanban board view with drag-and-drop status changes
- Status workflow (To Do, In Progress, Blocked, Completed, Cancelled)
- Timeline and Gantt chart views
- Task reminders and escalation notifications
- Team workload view and capacity planning

### Vendor Management

- Vendor directory with comprehensive contact information
- Vendor categories and ratings (1-5 stars)
- Quote comparison tool
- Booking and payment schedule tracking
- Vendor performance metrics

### Event Timeline

- Visual timeline with drag-and-drop interface
- Activity sequencing with dependencies
- Conflict detection for overlapping activities
- Vendor/resource assignment to timeline activities
- Timeline templates for common event types

### Shopping List Management

- Create and categorize shopping lists
- Item status tracking (Needed, Purchased, Not Available, Ordered)
- Price comparison and cost tracking
- Mobile-optimized shopping mode
- Automatic sync to event budget

### Analytics & Reporting

- Event statistics dashboard
- Guest analytics (RSVP rates, demographics)
- Budget performance analysis with variance reports
- Task completion metrics
- Custom report builder
- Export reports (PDF, Excel, CSV)
- Scheduled report generation and email delivery

### Collaboration

- Real-time updates across all users
- Activity feed showing recent changes
- Comment system on events, tasks, budgets
- @mentions for user notification
- File sharing and attachments
- Version history with rollback capability
- Team member online/offline status indicators
- Team chat/messaging integrated into events

---

# SECTION 2: FUNCTIONAL REQUIREMENTS

### FR-AUTH-001

**Priority:** High

**Description:** Users must authenticate using Azure Entra ID credentials via OpenID Connect protocol....

**Acceptance Criteria:**

- Login button redirects to Azure Entra ID login page
- Successful authentication returns JWT token
- Token stored securely in httpOnly cookie
- User redirected to dashboard after login
- Failed login displays appropriate error message

### FR-AUTH-002

**Priority:** High

**Description:** System automatically refreshes JWT tokens before expiration to maintain user session....

**Acceptance Criteria:**

- Token refresh attempted
- minutes before expiration
- Successful refresh extends session without user action
- Failed refresh logs user out and redirects to login
- Refresh token rotation implemented for security

### FR-AUTH-003

**Priority:** High

**Description:** User permissions determined by Azure Entra ID group membership enforced at UI and API levels....

**Acceptance Criteria:**

- Admin users can access all features and data
- Organizers can create and manage their own events
- Collaborators can edit assigned events only
- Guests can view public events and manage RSVPs
- Viewers have read
- only access to public events
- Unauthorized access attempts logged and blocked
- Event Management Requirements (

### FR-EVENT-001

**Priority:** High

**Description:** Organizers can create new events with comprehensive details....

**Acceptance Criteria:**

- Form includes: name, description, type, date, time, location, privacy
- Event type dropdown includes common types (Birthday, Wedding, etc
- Date picker validates future dates only
- Location field integrates with map service
- Privacy toggle sets event as public or private
- Form validation prevents submission with missing required fields
- Successful creation displays confirmation and redirects to event dashboard
- Event assigned to creating user as owner

### FR-EVENT-002

**Priority:** High

**Description:** Event owners and co-organizers can modify event details....

**Acceptance Criteria:**

- Edit button available only to authorized users
- Form pre
- populated with current event data
- Changes tracked with timestamp and user
- Audit log records all modifications
- Notifications sent to collaborators when key details change

### FR-EVENT-003

**Priority:** Medium

**Description:** Event owners can delete events with soft delete for recovery....

**Acceptance Criteria:**

- Delete button available only to event owner
- Confirmation dialog prevents accidental deletion
- Soft delete marks event as deleted without removing data
- Deleted events hidden from normal views
- day recovery window before permanent deletion
- Admin can recover deleted events within
- Guest Management Requirements (

### FR-GUEST-001

**Priority:** High

**Description:** Organizers can add guests individually to event guest list....

**Acceptance Criteria:**

- Form includes: name, email, phone, dietary restrictions
- Email validation ensures proper format
- one option adds additional guest slot
- Duplicate email detection warns user
- Guest automatically receives invitation email if configured
- Guest appears in guest list immediately

### FR-GUEST-002

**Priority:** Medium

**Description:** Organizers can import multiple guests from CSV file....

**Acceptance Criteria:**

- CSV template available for download
- File upload validates CSV format
- Field mapping wizard matches columns to guest fields
- Preview shows first
- rows before import
- Duplicate detection flags existing guests
- Import summary shows success/failure count
- Failed rows exported to error file with reasons

### FR-GUEST-003

**Priority:** High

**Description:** System tracks guest RSVP status and responses....

**Acceptance Criteria:**

- RSVP status options: Pending, Confirmed, Declined, Maybe, No Response
- Guest portal allows easy RSVP without login
- RSVP changes update guest count automatically
- Organizer dashboard shows current RSVP statistics
- Email reminders sent at configurable intervals
- RSVP deadline enforces submission cutoff
- Budget Management Requirements (

### FR-BUDGET-001

**Priority:** High

**Description:** Organizers can set overall budget and category allocations....

**Acceptance Criteria:**

- Total budget amount accepts decimal values
- defined categories available (Venue, Catering, etc
- Custom categories can be added
- Category allocations sum to total budget
- Percentage distribution shown visually
- Budget saved and associated with event

### FR-BUDGET-002

**Priority:** High

**Description:** Organizers can add and track expenses against budget categories....

**Acceptance Criteria:**

- Expense form includes: amount, category, vendor, date, description
- Receipt upload supports PDF, JPG, PNG files up to
- Payment status tracked (Pending, Paid, Overdue)
- Expenses automatically deducted from category budget
- time budget utilization displayed
- Overspending warnings triggered at
- % threshold
- User Interface Requirements
- The application must provide intuitive, responsive interfaces following Material Design principles
- All forms include inline validation with clear error messages
- Mobile
- first responsive design ensures usability on devices from
- K displays
- Data Requirements
- All data must be persisted to PostgreSQL database with proper relationships and constraints
- Audit columns (created_at, created_by, updated_at, updated_by) required on all tables
- Row Level Security policies enforce permissions at database level
- Integration Requirements
- Azure Entra ID provides authentication and authorization
- Express provides the active REST API contract for frontend and integrations
- All API calls include JWT token in Authorization header
- CORS configured to allow requests from Next
- js frontend

---

# SECTION 3: USER PERSONAS & WORKFLOWS

## 3.1 Primary User Personas

### Sarah Chen - Busy Event Organizer

**Age:** 32 | **Occupation:** Marketing Manager & Community Volunteer

**Background:** Sarah organizes multiple events per year including corporate gatherings, charity fundraisers, and personal celebrations. She juggles a full-time job with volunteer work and personal commitments. Curre...

### Marcus Rodriguez - Collaborative Planner

**Age:** 45 | **Occupation:** High School Teacher & PTA Volunteer

**Background:** Marcus frequently helps organize school events, community festivals, and fundraisers. He's usually brought in as a collaborator on events organized by others. He's detail-oriented and reliable but doe...

### Emily Patel - Guest

**Age:** 28 | **Occupation:** Software Developer

**Background:** Emily receives invitations to various events including weddings, birthday parties, professional networking events, and community gatherings. She values her time and appreciates when event information ...

### David Kim - System Administrator

**Age:** 38 | **Occupation:** IT Systems Administrator

**Background:** David manages the organization's technology infrastructure and user access systems. He's responsible for integrating new applications with Azure Entra ID, managing security policies, and ensuring comp...

---

# SECTION 4: TECHNICAL REQUIREMENTS

## 4.1 Technology Stack

### Frontend Layer

- **Framework:** React 18 with TypeScript (strict mode)
- **Meta-Framework:** Next.js 14 with App Router
- **UI Components:** Material-UI (MUI) v5
- **State Management:** Zustand for global state
- **Data Fetching:** TanStack Query v5 for server state management
- **Forms:** React Hook Form with Zod validation

### Backend & Database

- **Database:** PostgreSQL 14+
- **API Layer:** Express (versioned `/api` contract)
- **Authentication:** Azure Entra ID with MSAL.js

### DevOps & Infrastructure

- **Containerization:** Docker & Docker Compose
- **Version Control:** Git with feature branch workflow

## 4.2 Database Schema Architecture

### Current schema baseline (live PostgreSQL schema)

- Canonical table inventory: `docs/database/schema.md` (generated from live metadata).
- Current footprint: 60+ tables (currently 64) across event management, RSVP, auth/RBAC, analytics, communication, and operations domains.
- The previously cited "11-table core" is retained only as historical planning context and is not used as the active architecture definition.

### Representative foundational tables

- **users** - User profiles and identity mapping
- **events** - Event master records and lifecycle metadata
- **guests** - First-class guest identity/profile records (linked from `rsvps.guest_id`)
- **rsvps** - RSVP workflow records and status data
- **tasks** - Work planning and execution tracking
- **budget_categories** and **expenses** - Budget structure and spend tracking
- **vendors** - Vendor lifecycle and service management
- **timeline_activities** - Event timeline orchestration
- **audit_log** and **activity_feed** - Operational traceability and activity visibility
- **attendance_events** and communication-related tables - RSVP/attendance and outreach telemetry

### Table Features:

- Audit columns on all tables: created_at, created_by, updated_at, updated_by
- Row Level Security (RLS) policies for permission enforcement
- Foreign key constraints ensuring referential integrity
- Proper indexing for query optimization

### UUID vs SERIAL Decision Record (Issue #774)

- Spike analysis document: `docs/architecture/uuid-migration-spike.md`
- Decision for current release cycle: **Defer UUID PK migration** and **ratify SERIAL/sequence-backed integer keys as the active implementation baseline**.
- Rationale: the current 64-table live schema is heavily sequence/integer keyed, with broad cross-layer type impact. A safe UUID migration requires a dedicated multi-phase effort (dual-column cutover) outside current delivery scope.
- Future direction: track UUID migration as a dedicated epic with phased DB, backend, and frontend rollout planning.

### Review and Sign-Off

- Reviewed by task assignee (`#774`): `@SmitRAmoliya`
- Sign-off date: 2026-05-20

### TRD Change Log

| Date       | Section                          | Change                                                                                                                                                                                    | Reference |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2026-05-20 | 4.1 Technology Stack             | Updated backend API contract to Express `/api` and removed PostgREST as the active runtime API layer.                                                                                     | #775      |
| 2026-05-20 | 4.3 Development Environment      | Replaced PostgREST service reference with Express backend container and documented freed port `3001` in default compose runtime.                                                          | #775      |
| 2026-05-20 | 4.2 Database Schema Architecture | Replaced outdated "11-table core" wording with live-schema baseline and canonical reference to `docs/database/schema.md` (64 tables at generation time).                                  | #773      |
| 2026-05-20 | 4.2 Database Schema Architecture | Added UUID migration spike outcome and decision to defer UUID cutover now, ratify SERIAL baseline, and track phased UUID migration as future work.                                        | #774      |
| 2026-05-20 | 4.2 Database Schema Architecture | Recorded Task #771 decision to implement `guests` as a first-class table with `rsvps.guest_id` linkage; architecture decision documented in `docs/architecture/guests-table-decision.md`. | #771      |

## 4.3 Development Environment

### Docker Compose Services:

- **PostgreSQL Container** - Database with persistent volumes
- **Express Backend Container** - API contract served on backend port 4000 (`/api`)
- **Next.js Dev Server** - Frontend with hot reload (port 3000)
- **Freed Port** - `3001` (previous PostgREST mapping) is intentionally unassigned in the default compose runtime
- **Environment Configuration** - Via .env files

### Development Tools:

- Automated database migrations with Flyway
- Seed data scripts for development
- Pre-commit hooks for code quality

---

# SECTION 5: NON-FUNCTIONAL REQUIREMENTS

## 5.1 Performance Requirements

- Page load time under 2 seconds on 4G connection
- API response time under 500ms for 95% of requests
- Support 100+ concurrent users without degradation
- Database queries optimized with proper indexing
- Lazy loading for images and heavy components
- Code splitting for optimal JavaScript bundle size
- Image optimization with Next.js Image component
- Caching strategy: API responses (5 min), static assets (1 year)

## 5.2 Security Requirements

- HTTPS/TLS 1.3 for all client-server communications
- Azure Entra ID authentication with MFA support
- JWT tokens with 1-hour expiration and refresh tokens
- HttpOnly, Secure, SameSite cookies for token storage
- PostgreSQL Row Level Security (RLS) for data access control
- Prepared statements preventing SQL injection
- Content Security Policy (CSP) preventing XSS
- CSRF tokens for state-changing operations
- Input validation on client and server sides
- Rate limiting: 100 requests/minute per user
- Security headers: HSTS, X-Frame-Options, X-Content-Type-Options
- Regular dependency updates for security patches

## 5.3 Usability & Accessibility

- Intuitive interface following Material Design 3 principles
- Mobile-first responsive design (breakpoints: 600px, 900px, 1200px)
- Consistent navigation and layout across all pages
- Clear error messages with actionable guidance
- Form validation with inline error display
- Keyboard shortcuts for power users (Ctrl+K command palette)
- Inline help text and contextual tooltips
- WCAG 2.1 Level AA accessibility compliance
- Semantic HTML for screen reader compatibility
- Sufficient color contrast ratios (4.5:1 minimum)
- Focus indicators for keyboard navigation
- Loading states and progress indicators for async operations

## 5.4 Reliability & Availability

- Target 99% uptime for production environment
- Automated database backups (daily full, hourly incremental)
- Point-in-time recovery capability (14-day retention)
- Error logging with context (user, action, timestamp)
- Graceful error handling with user-friendly messages
- Automatic retry for transient failures (network, timeout)
- Health check endpoints for monitoring (/api/health)
- Database connection pooling for stability
- Foreign key constraints ensuring referential integrity
- Transaction support with rollback on failures

## 5.5 Maintainability

- Clean code following Airbnb JavaScript Style Guide
- TypeScript strict mode for type safety
- Comprehensive JSDoc comments for functions and components
- Component documentation with usage examples
- API documentation with OpenAPI/Swagger
- Database schema documentation with ER diagrams
- Modular architecture with clear separation of concerns
- Unit tests for business logic (Jest)
- Integration tests for API endpoints (Supertest)
- End-to-end tests for critical user flows (Playwright)
- Automated linting (ESLint) and formatting (Prettier)
- Pre-commit hooks for code quality checks
- Version-controlled database migrations
- Git workflow: main, develop, feature/\* branches
- Pull request reviews required before merging

---

# SECTION 6: CONSTRAINTS, ASSUMPTIONS & OUT-OF-SCOPE

## 6.1 Assumptions

- Users have access to Docker Desktop for local development
- Azure Entra ID tenant available for authentication
- Modern web browsers with JavaScript enabled
- Stable internet connection (minimum 4G/broadband speeds)
- Users have basic computer literacy
- English-language interface only in MVP
- Desktop/laptop as primary device for organizers
- Mobile devices primarily for guest RSVPs
- No payment processing required in MVP
- Single organization deployment (no multi-tenancy in MVP)

## 6.2 Constraints

- **Development:** Local Docker environment only (no cloud dependencies)
- **Budget:** Open-source technologies only, zero licensing costs
- **Timeline:** MVP development within educational project timeframe
- **Team:** Small development team leveraging AI assistance
- **Data Storage:** Local PostgreSQL, no cloud sync in MVP
- **File Uploads:** 10MB per file limit, 100MB per event total
- **Guest Capacity:** Maximum 500 guests per event
- **Event Capacity:** Unlimited events per user
- **Concurrent Users:** Designed for 100 simultaneous users
- **Browser Support:** Latest 2 versions only (no IE11)

## 6.3 Out of Scope (Future Phases)

- Native mobile applications (iOS/Android)
- Payment processing and ticket sales
- Live streaming integration for virtual events
- AI-powered **automated** event recommendations and optimization engine (ML-based, unsolicited — distinct from the in-scope interactive AI Planning Assistant; see §6.4)
- Social media platform integration (Facebook, Instagram)
- Email marketing campaigns and newsletters
- Attendee networking features (matchmaking, chat)
- Virtual event platform capabilities (webinar, breakout rooms)
- Multi-language interface and localization
- White-label customization for branded deployments
- Third-party calendar sync (Google Calendar, Outlook)
- SMS notifications and reminders
- Advanced analytics with machine learning insights
- Event website builder
- Sponsor and exhibitor management
- Auto-application of AI output without explicit user confirmation
- Third-party AI agent orchestration frameworks (LangChain, Semantic Kernel, etc.)

## 6.4 In-Scope AI Capability (Current Stack)

The **AI Planning Assistant** is an in-scope, implemented capability on the current Vite + React Router + Express + PostgreSQL stack. It is an interactive, user-driven chat assistant — not an automated recommendation engine.

For the full AI requirement set, implementation status, traceability matrix, and clarifications, see:

> **[docs/requirements/ai-requirement-baseline.md](ai-requirement-baseline.md)** — AI Requirement Baseline and Traceability (Story #948)

---

# SECTION 7: COMPLIANCE CHECKLIST & BASELINE

## 7.1 Requirements Traceability Matrix

### High-Priority Features for MVP

#### Critical (Must Have)

- [ ] Azure Entra ID authentication with JWT tokens
- [ ] Event CRUD operations (Create, Read, Update, Delete)
- [ ] Guest list management with RSVP tracking
- [ ] Budget tracking with expense management
- [ ] Task management with assignment workflow
- [ ] Dashboard with key metrics
- [ ] Real-time collaboration updates
- [ ] PostgreSQL database with RLS policies
- [ ] Express API contract coverage for required MVP workflows

#### High-Priority (Should Have)

- [ ] Timeline view with conflict detection
- [ ] Vendor management system
- [ ] Shopping list management
- [ ] Analytics and reporting
- [ ] Photo gallery with sharing
- [ ] Notifications and alerts system
- [ ] Advanced filtering and search

#### Medium-Priority (Nice to Have)

- [ ] Event templates and cloning
- [ ] Advanced financial reporting
- [ ] Integration with external services
- [ ] Custom field management
- [ ] Bulk operations

## 7.2 Non-Functional Requirements Verification

| Requirement         | Target            | Status |
| ------------------- | ----------------- | ------ |
| Page Load Time      | <2 seconds        | ⬜     |
| API Response Time   | <500ms            | ⬜     |
| Concurrent Users    | 100+              | ⬜     |
| Uptime              | 99%               | ⬜     |
| Database Backups    | Daily             | ⬜     |
| Security Compliance | TLS 1.3, RLS, MFA | ⬜     |
| Accessibility       | WCAG 2.1 AA       | ⬜     |
| Code Coverage       | >80%              | ⬜     |
| Browser Support     | Latest 2 versions | ⬜     |

## 7.3 Testing & Quality Assurance

### Test Coverage Targets

- Unit Tests: >80% coverage on business logic
- Integration Tests: All API endpoints
- E2E Tests: Critical user flows (authentication, RSVP, budget)
- Performance Tests: Load testing for 100+ concurrent users
- Security Tests: OWASP Top 10 vulnerability scanning
- Accessibility Tests: Automated axe-core testing + manual review

### Quality Gates

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Zero critical/high security vulnerabilities
- [ ] Code coverage >80%
- [ ] ESLint/Prettier checks passing
- [ ] TypeScript strict mode compilation
- [ ] Lighthouse score >90 on mobile/desktop
- [ ] WCAG AA accessibility audit passed

---

# Document Information

**Last Updated:** May 19, 2026
**Document Status:** Baseline Extracted from Source Documents

**Purpose:** This document serves as the comprehensive baseline for all requirements
extracted from the Festival & Event Planner specification documents. All features,
technical specifications, and quality requirements are organized and categorized for
development planning, compliance assessment, and traceability.

---
