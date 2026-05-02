# JWT Secret Lifecycle, Rotation, and Revocation

> **Related issues:** #352 (Story), #353 (Task)

## Overview

The backend uses three secret environment variables for token security:

| Variable | Purpose | Required format |
|---|---|---|
| `JWT_SECRET` | Signs access tokens (HMAC-SHA256 via `jsonwebtoken`) | At least 64 random bytes, hex or base64 encoded |
| `REFRESH_TOKEN_ENC_KEY` | Encrypts refresh tokens stored in cookies (AES-256-GCM) | Exactly 32 random bytes, **base64-encoded** (44 chars) |
| `TOKEN_HASH_SECRET` | HMAC salt for scrypt-hashing session tokens before DB storage | At least 32 random bytes, any encoding |

**None of these values must ever be committed to source control.** The `.gitignore` excludes `.env` files — verify this is in place before deploying.

---

## Generating Secrets

Use a cryptographically secure source for all secrets.

### `JWT_SECRET` (≥ 64 bytes, hex)

```bash
openssl rand -hex 64
# or
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### `REFRESH_TOKEN_ENC_KEY` (exactly 32 bytes, base64)

```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### `TOKEN_HASH_SECRET` (≥ 32 bytes, hex)

```bash
openssl rand -hex 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output values into your `.env` file (never hard-code them in source files).

---

## Behaviour When Secrets Are Unset

| Environment | Behaviour |
|---|---|
| `NODE_ENV=production` | Server **throws on startup** and refuses to start — no fallback |
| Development / test | Ephemeral random value generated at startup (printed as a `[SECURITY]` warning). Sessions do **not** survive restarts |

---

## Rotating Secrets

Secret rotation invalidates all currently-issued tokens of that type. Plan accordingly.

### Rotating `JWT_SECRET`

Impact: **all active access tokens are immediately invalidated.** Users must re-authenticate.

1. Generate a new secret value:
   ```bash
   openssl rand -hex 64
   ```
2. Update the secret in your secrets manager / hosting environment (e.g. GitHub Actions secret, AWS Secrets Manager, Azure Key Vault).
3. Restart the backend service so the new value is loaded.
4. Optionally, delete all rows from the `sessions` table to force a clean slate:
   ```sql
   DELETE FROM sessions;
   ```
5. Communicate planned downtime / forced re-login to users if needed.

### Rotating `REFRESH_TOKEN_ENC_KEY`

Impact: **all existing encrypted refresh token cookies become unreadable.** Users whose access tokens have also expired will need to log in again.

1. Generate a new 32-byte base64 key:
   ```bash
   openssl rand -base64 32
   ```
2. Update the environment variable and restart the backend.
3. Because stored refresh tokens are opaque random bytes hashed in the DB (not the ciphertext), the hashed rows remain valid until expiry — but clients can no longer decrypt the cookie. Effectively, all refresh tokens are invalidated. Optionally clear them:
   ```sql
   DELETE FROM refresh_tokens;
   ```

### Rotating `TOKEN_HASH_SECRET`

Impact: all scrypt-derived session/token hashes in the DB are invalidated. Every row in `sessions` (and any table that stores `hashToken()` output) becomes unmatchable.

1. Generate a new value:
   ```bash
   openssl rand -hex 32
   ```
2. Update the environment variable.
3. Clear all affected tables before restarting (otherwise lookups will always fail):
   ```sql
   DELETE FROM sessions;
   DELETE FROM refresh_tokens;
   ```
4. Restart the backend.

---

## Emergency Revocation (Invalidate All Active Sessions)

Use this procedure when a secret is suspected to be compromised or when a broad forced-logout is required.

### Option A — Rotate the secret (preferred)

Follow the rotation steps above for whichever secret is compromised. This is the fastest and most complete option because it makes all existing tokens unverifiable without touching the database directly.

### Option B — Clear sessions from the database

If you cannot rotate the secret immediately (e.g. secret manager is unavailable), invalidate sessions at the database level:

```sql
-- Invalidate all active sessions
DELETE FROM sessions;

-- Invalidate all refresh tokens
DELETE FROM refresh_tokens;
```

Run against the production database using `psql` or your preferred PostgreSQL client. Users will be forced to re-authenticate on their next request.

### Option C — Combined (most thorough)

1. Rotate `JWT_SECRET` (step above).
2. Clear the `sessions` and `refresh_tokens` tables.
3. Restart the backend.

---

## Source Control and CI Reminders

- **`.env` files are listed in `.gitignore`** — confirm with `git check-ignore -v .env`.
- `docker-compose.yml` reads secrets via `${JWT_SECRET}` — the placeholder default `change-me-in-production` must never be used in a real environment.
- CI pipelines (GitHub Actions) must supply secrets via **repository or environment secrets**, not hard-coded values in workflow YAML.
- CodeQL scans for `js/hardcoded-credentials` — the codebase uses ephemeral fallback values (not string literals) to satisfy this rule in dev/test.

---

## Related Files

| File | What it does |
|---|---|
| `backend/src/middleware/auth.ts` | Resolves `JWT_SECRET`, signs and verifies access tokens |
| `backend/src/utils/auth-helpers.ts` | Resolves `REFRESH_TOKEN_ENC_KEY` and `TOKEN_HASH_SECRET`, implements encrypt/decrypt/hash helpers |
| `backend/.env.example` | Template showing all required variables with generation hints |
| `docker-compose.yml` | Passes environment variables to the backend service |
| `SECURITY.md` | Repository-level security policy |
