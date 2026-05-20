# TLS Termination & HTTPS Enforcement

> **⚠️ DISCLAIMER: This is a fake project for demonstration/testing purposes only.**
>
> **No feedback will be collected or worked on. Use at your own risk.**

## Overview

This document describes how TLS is terminated, which cipher suites and protocol
versions are required, where certificates originate, how they are renewed, and
who owns the TLS stack on-call.

## TLS Termination Point

TLS is terminated at the **reverse-proxy / ingress layer** (e.g. cloud load
balancer or Kubernetes Ingress controller). Neither the frontend nginx container
nor the backend Express server handle raw TLS connections:

```
Client ──TLS 1.3──▶ Reverse Proxy / Ingress ──plaintext──▶ nginx (:80) ──▶ backend (:4000)
```

- **Frontend container** — `frontend/nginx.conf` listens on port 80 (HTTP only).
  The `X-Forwarded-Proto` header set by the reverse proxy propagates the original
  scheme to the backend.
- **Backend container** — Express checks `X-Forwarded-Proto` to determine whether
  the originating request was HTTPS. When `ENFORCE_HTTPS=true` (mandatory in
  production/staging), insecure requests are redirected with `308 Permanent
Redirect` or rejected with `400 Bad Request`.

## Required TLS Version & Cipher Suites

| Setting             | Required Value | Enforcement                                                                                  |
| ------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| Minimum TLS version | **TLS 1.3**    | `EDGE_TLS_MIN_VERSION=TLSv1.3` env var; backend startup fails if unset in production/staging |
| TLS 1.0 / 1.1 / 1.2 | **Disabled**   | Must be disabled at the reverse proxy / ingress                                              |

### Recommended Cipher Suites (TLS 1.3)

TLS 1.3 cipher suites are negotiated automatically by the protocol and cannot be
misconfigured at the application layer. The following suites are expected from
compliant reverse proxies:

| Cipher Suite                   | Key Exchange | Notes                           |
| ------------------------------ | ------------ | ------------------------------- |
| `TLS_AES_256_GCM_SHA384`       | ECDHE        | Preferred                       |
| `TLS_AES_128_GCM_SHA256`       | ECDHE        | Acceptable                      |
| `TLS_CHACHA20_POLY1305_SHA256` | ECDHE        | Acceptable (mobile performance) |

> Legacy suites (CBC, RC4, 3DES, RSA key exchange) **must not** be enabled.

## HSTS Policy

HTTP Strict Transport Security is enforced by the backend via the
[Helmet](https://helmetjs.github.io/) middleware in `backend/src/index.ts`:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

| Directive           | Value               | Meaning                                                           |
| ------------------- | ------------------- | ----------------------------------------------------------------- |
| `max-age`           | `31536000` (1 year) | Browsers must use HTTPS for all future requests for this duration |
| `includeSubDomains` | `true`              | Policy applies to all subdomains                                  |
| `preload`           | `true`              | Domain is eligible for browser HSTS preload lists                 |

### Code Reference

```typescript
// backend/src/index.ts
app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);
```

### Verification

```bash
# Check HSTS header against a running instance
curl -sI https://<hostname>/health | grep -i strict-transport-security
# Expected: strict-transport-security: max-age=31536000; includeSubDomains; preload
```

Test coverage is in `backend/__tests__/helmet-security-headers.test.ts`.

## HTTPS Enforcement

The backend enforces HTTPS when `ENFORCE_HTTPS=true` (mandatory in
production/staging via `backend/src/config/security-controls.ts`):

- **GET / HEAD** requests over HTTP are redirected to HTTPS with `308 Permanent
Redirect`.
- **All other methods** over HTTP receive `400 Bad Request` with
  `{ "error": "HTTPS is required for this endpoint." }`.

## Certificate Source

| Item                  | Value                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- |
| Certificate Authority | Cloud-managed (e.g. AWS ACM, Azure App Service Managed Certificate, Let's Encrypt) |
| Certificate type      | Domain-validated (DV) wildcard or SAN certificate                                  |
| Key algorithm         | ECDSA P-256 (preferred) or RSA 2048-bit minimum                                    |
| Storage               | Cloud provider secret store (e.g. AWS ACM, Azure Key Vault)                        |

> Private keys **must never** be committed to source control or stored on
> application containers.

## Certificate Renewal Procedure

| Step | Description                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Cloud-managed certificates auto-renew 30 days before expiry                                                                                |
| 2    | For manually provisioned certificates: generate a new CSR, submit to CA, and deploy the renewed certificate to the load balancer / ingress |
| 3    | Verify renewal via `openssl s_client -connect <hostname>:443` and confirm the `Not After` date                                             |
| 4    | Monitor certificate expiry with infrastructure alerting (e.g. CloudWatch, Azure Monitor) with a 14-day warning threshold                   |

### Renewal Verification

```bash
# Check certificate expiry date
echo | openssl s_client -connect <hostname>:443 -servername <hostname> 2>/dev/null \
  | openssl x509 -noout -dates
```

## Database TLS

PostgreSQL connections must use encrypted transport in production/staging:

| Setting                     | Required Value               | Enforcement                                          |
| --------------------------- | ---------------------------- | ---------------------------------------------------- |
| `DB_SSL_REQUIRED`           | `true`                       | Backend startup fails if unset in production/staging |
| `sslmode` in `DATABASE_URL` | `verify-ca` or `verify-full` | Validates server certificate against trusted CA      |

See `backend/src/config/security-controls.ts` for the full list of mandatory
security flags.

## On-Call Ownership

| Area                                     | Owner                               | Responsibility                                                                 |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Reverse proxy / ingress TLS config       | **Platform / Infrastructure team**  | Certificate provisioning, cipher suite policy, TLS version enforcement         |
| HSTS and HTTPS enforcement (application) | **Backend team**                    | Helmet config, redirect middleware, security-controls startup gates            |
| Database TLS (`sslmode`)                 | **Platform / Infrastructure team**  | PostgreSQL server certificate management, `pg_hba.conf` TLS enforcement        |
| Certificate monitoring & alerts          | **Platform / Infrastructure team**  | Alerting on upcoming expiry, failed renewals                                   |
| Incident response (TLS-related)          | **On-call SRE / Platform engineer** | Rotate certificates, update cipher policies, coordinate with CA if compromised |

## Mandatory Production Environment Variables

All of the following must be set for the backend to start in production/staging
(enforced by `backend/src/config/security-controls.ts`):

```env
ENFORCE_HTTPS=true
EDGE_TLS_MIN_VERSION=TLSv1.3
DB_SSL_REQUIRED=true
DB_ENCRYPTION_AT_REST_VERIFIED=true
```

See [SECURITY.md](../../SECURITY.md) for the complete list of mandatory
production security flags.

## Related Documentation

- [SECURITY.md](../../SECURITY.md) — Security policies and mandatory production flags
- [JWT Secrets](jwt-secrets.md) — Token secret lifecycle and rotation
- [Password Hashing](../../PASSWORD_HASHING.md) — bcrypt configuration
