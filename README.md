# Festival Event Planner

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

A React TypeScript frontend and Node.js backend for planning and managing festival events.

## Overview

This application helps organize and manage festival events, providing tools for event planning, coordination, and execution.

Current implementation includes a login flow with:
- React + Material UI login form
- Loading and error states
- 3 failed login attempt limit
- 10 minute temporary lockout after max failures

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

Install dependencies in both applications:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Development

Run backend API:

```bash
cd backend && npm run dev
```

Run frontend app in another terminal:

```bash
cd frontend && npm run dev
```

Frontend runs on `http://localhost:5173` and backend runs on `http://localhost:3001`.

Demo login credentials (configurable by environment variables):
- Email: `user@example.com`
- Password: `Password123!`

### Build

```bash
cd frontend && npm run build
```

## Documentation

Project documentation can be found in the [docs](docs/) folder:
- [Requirements Documentation](docs/requirements/)

## License

See [LICENSE](LICENSE) for details.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.
