# JWT Secret Lifecycle and Documentation

> **Relates to:** [#352](https://github.com/seriously-not-prod/break-things-here/issues/352) / [#353](https://github.com/seriously-not-prod/break-things-here/issues/353)  
> **Theme:** [#227 Security](https://github.com/seriously-not-prod/break-things-here/issues/227)

---

## Overview

This document covers the three server-side secrets used for token security in the Festival Planner backend, along with how to generate them, rotate them, and perform emergency revocation.

| Environment Variable | Purpose | Required in Production |
|---|---|---|
| `JWT_SECRET` | Signs and verifies JWT access tokens | ✅ Yes |
| `TOKEN_HASH_SECRET` | scrypt-derives a key to hash opaque tokens before DB storage | ✅ Yes |
| `REFRESH_TOKEN_ENC_KEY` | AES-256-GCM encrypts refresh tokens stored in HttpOnly cookies | ✅ Yes |

If any of these are missing in production, the backend will **throw on startup** and refuse to serve requests. In development/test, ephemeral per-startup values are used (sessions will not survive a restart).

---

## 1. Secret Descriptions

### `JWT_SECRET`

- **Type:** Arbitrary UTF-8 string (minimum 64 random hex characters recommended)
- **Used in:** `backend/src/middleware/auth.ts` → `generateTokens()`, `verifyToken()`
- **Effect of rotation:** All existing access tokens are immediately invalidated. Users must re-authenticate.
- **Expiry:** Access tokens expire after 1 hour (`JWT_EXPIRES_IN` env var). After rotation, no residual attack window remains once existing tokens expire.

### `TOKEN_HASH_SECRET`

- **Type:** Arbitrary UTF-8 string (minimum 32 random bytes recommended)
- **Alias:** `PASSWORD_RESET_SALT` (legacy — prefer `TOKEN_HASH_SECRET`)
- **Used in:** `backend/src/utils/auth-helpers.ts` → `hashToken()`
- **Effect of rotation:** All session lookups keyed by `hashToken(sessionJti)` will fail → all active sessions are invalidated. Users must re-authenticate.

### `REFRESH_TOKEN_ENC_KEY`

- **Type:** Base64-encoded 32-byte random key (`AES-256-GCM`)
- **Used in:** `backend/src/utils/auth-helpers.ts` → `encryptToken()` / `decryptToken()`
- **Effect of rotation:** All refresh tokens stored in client HttpOnly cookies become undecryptable → all refresh tokens are invalidated. Users must re-authenticate on next token refresh.

---

## 2. Generating Secrets

Run these commands to generate cryptographically strong values:

```bash
# JWT_SECRET — 64 random hex characters (256 bits of entropy)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# TOKEN_HASH_SECRET — 32 random hex characters
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# REFRESH_TOKEN_ENC_KEY — base64-encoded 32 bytes (required by AES-256)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Or using `openssl`:

```bash
openssl rand -hex 64          # JWT_SECRET
openssl rand -hex 32          # TOKEN_HASH_SECRET
openssl rand -base64 32       # REFRESH_TOKEN_ENC_KEY
```

Set them in your `.env` file (never commit `.env` — it is git-ignored):

```env
JWT_SECRET=<output of first command>
TOKEN_HASH_SECRET=<output of second command>
REFRESH_TOKEN_ENC_KEY=<output of third command>
```

---

## 3. Rotating Secrets (Planned Rotation)

Use this procedure during planned maintenance (e.g. scheduled quarterly rotation).

### Steps

1. **Generate new secret values** using the commands in Section 2.

2. **Update environment variables** in your deployment platform (Render, Railway, Docker, etc.) with the new values. Do **not** restart yet.

3. **Invalidate all active sessions in the database** (users will need to re-authenticate after restart):

   ```sql
   -- Run against your PostgreSQL instance before restarting the backend
   DELETE FROM sessions;
   DELETE FROM password_reset_tokens WHERE used_at IS NULL;
   ```

   Using `psql`:

   ```bash
   psql "$DATABASE_URL" -c "DELETE FROM sessions;"
   psql "$DATABASE_URL" -c "DELETE FROM password_reset_tokens WHERE used_at IS NULL;"
   ```

4. **Restart the backend** to pick up the new environment variables.

5. **Verify** the backend starts cleanly (check logs for `[SECURITY]` warnings — none should appear if all secrets are set).

### Impact

| Action | User impact |
|---|---|
| Rotating `JWT_SECRET` | All access tokens expire; users log in again within ~1 hour |
| Rotating `TOKEN_HASH_SECRET` | All sessions invalidated immediately; users log in again |
| Rotating `REFRESH_TOKEN_ENC_KEY` | All refresh cookies become invalid; users log in again |
| Deleting `sessions` table rows | All sessions invalidated immediately (recommended alongside any secret rotation) |

---

## 4. Emergency Revocation

Use this procedure if a secret is believed to be compromised.

### Immediate steps

1. **Rotate all three secrets immediately** (generate new values per Section 2).

2. **Wipe all active sessions from the database now** — before restarting:

   ```sql
   -- Emergency full session invalidation
   DELETE FROM sessions;
   ```

   Using `psql`:

   ```bash
   psql "$DATABASE_URL" -c "DELETE FROM sessions;"
   ```

3. **Restart the backend** with the new secrets.

4. **Consider also invalidating pending password reset tokens** to prevent replay:

   ```sql
   DELETE FROM password_reset_tokens WHERE used_at IS NULL;
   ```

5. **Audit the logs** for suspicious activity (look for `audit_log` table entries with unusual `action` values or `ip_address` patterns):

   ```sql
   SELECT action, email, ip_address, created_at
   FROM audit_log
   WHERE created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```

6. **File a security incident** in the GitHub repository using the Security Issue template.

---

## 5. Rules — Never Do These

- ❌ **Never commit** `.env` or any file containing real secret values to source control.
- ❌ **Never hardcode** any of these secrets in source files (CodeQL will flag `js/hardcoded-credentials`).
- ❌ **Never log** the values of `JWT_SECRET`, `TOKEN_HASH_SECRET`, or `REFRESH_TOKEN_ENC_KEY`.
- ❌ **Never reuse** the same secret across different environments (dev / staging / production must all have different values).
- ❌ **Never use short or guessable values** — always use the generation commands above.

---

## 6. CI / Test Environment

Tests use deterministic but non-production secrets injected via `backend/vitest.config.ts`:

```ts
env: {
  JWT_SECRET: 'test-jwt-secret-vitest-only-not-for-production-use',
  TOKEN_HASH_SECRET: 'test-token-hash-secret-vitest-only',
  REFRESH_TOKEN_ENC_KEY: Buffer.from('test-refresh-enc-key-32bytes!!xx').toString('base64'),
},
```

These values are safe to commit because they are:
- Only active during `vitest run`
- Not used in production (production throws if these exact strings were used, as they don't match length/entropy requirements in practice — but more importantly, production requires `NODE_ENV=production` where missing secrets throw)

---

## 7. Checklist for New Deployments

- [ ] Generated `JWT_SECRET` with ≥ 64 random hex characters
- [ ] Generated `TOKEN_HASH_SECRET` with ≥ 32 random hex characters
- [ ] Generated `REFRESH_TOKEN_ENC_KEY` as base64 of exactly 32 random bytes
- [ ] All three set in the deployment environment — never in committed files
- [ ] Backend starts without any `[SECURITY]` warning in logs
- [ ] `NODE_ENV=production` is set so missing secrets throw rather than silently fallback
- [ ] `.env` is listed in `.gitignore`

---

## See Also

- [SECURITY.md](../../SECURITY.md) — Vulnerability reporting policy
- [PASSWORD_HASHING.md](../../PASSWORD_HASHING.md) — bcrypt configuration
- `backend/src/middleware/auth.ts` — JWT signing and verification
- `backend/src/utils/auth-helpers.ts` — Token hashing and encryption
