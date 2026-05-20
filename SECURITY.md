# Security Policy

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only. This is not a real application or repository.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please follow these steps:

1. **Do Not** open a public issue
2. Email the security team with details of the vulnerability
3. Include steps to reproduce the issue
4. Provide any relevant logs or screenshots

### What to Include

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Varies based on severity

## Security Best Practices

When contributing to this project:

- Never commit sensitive data (API keys, passwords, tokens)
- Keep dependencies up to date
- Follow secure coding practices
- Use environment variables for configuration
- Validate all user inputs
- Implement proper authentication and authorization

## Mandatory Production Security Flags

For production/staging deployments, backend startup now fails closed unless all
of these values are explicitly set:

- `ENFORCE_HTTPS=true`
- `EDGE_TLS_MIN_VERSION=TLSv1.3`
- `DB_SSL_REQUIRED=true`
- `DB_ENCRYPTION_AT_REST_VERIFIED=true`
- `VIRUS_SCAN_ENABLED=true`
- `VIRUS_SCAN_BLOCK_ON_ERROR=true`

Additionally, `DATABASE_URL` must use PostgreSQL with strict SSL verification:

- `sslmode=verify-ca` or `sslmode=verify-full`

This ensures the 3.1.3 Data Security controls are enforced as hard startup
requirements, not optional runtime behavior.

## TLS & HTTPS

TLS is terminated at the reverse-proxy / ingress layer with TLS 1.3 enforced.
HSTS is applied by the backend via Helmet (`max-age=31536000; includeSubDomains; preload`).

For full details on TLS termination, cipher suites, certificate management,
renewal procedures, and on-call ownership, see:

- **[docs/security/tls.md](docs/security/tls.md)** — TLS termination ownership and HTTPS enforcement

## Secret Management

The backend uses three server-side secrets for token security. See the dedicated guide for generation, rotation, and emergency revocation procedures:

- **[docs/security/jwt-secrets.md](docs/security/jwt-secrets.md)** — JWT_SECRET, TOKEN_HASH_SECRET, REFRESH_TOKEN_ENC_KEY lifecycle, rotation, and revocation
- **[PASSWORD_HASHING.md](PASSWORD_HASHING.md)** — bcrypt configuration for password storage

For emergency session revocation, use `scripts/revoke-all-sessions.sql` against your PostgreSQL instance:

```bash
psql "$DATABASE_URL" -f scripts/revoke-all-sessions.sql
```

## Incident Response & Disaster Recovery

For the end-to-end DR procedure covering detection, escalation, RTO/RPO targets, database restore steps, communications templates, and post-incident review:

- **[docs/operations/dr-runbook.md](docs/operations/dr-runbook.md)** — Disaster Recovery runbook
- **[docs/operations/pitr.md](docs/operations/pitr.md)** — Point-in-Time Recovery configuration and restore drills (14-day WAL retention)

## Disclosure Policy

We follow responsible disclosure practices. Please allow us time to address the vulnerability before publicly disclosing it.
