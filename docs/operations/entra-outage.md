# Entra Outage — Temporary Fallback Toggle

Issues: #791, #783

---

## Purpose

This runbook documents the process for temporarily enabling local-credential fallback when Azure Entra ID is experiencing an outage. It is the break-glass procedure that allows users to continue logging in while Microsoft's identity platform is unavailable.

---

## When to Use

- Azure Entra ID / `login.microsoftonline.com` is unreachable or returning errors.
- Microsoft has declared an incident on the [Azure Status page](https://status.azure.com/) affecting Azure Active Directory / Entra ID.
- Users are unable to complete the SSO flow and the on-call team has confirmed Entra is the root cause (not a local configuration issue).

---

## Prerequisites

| Requirement  | Detail                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access level | Infrastructure operator with deployment secret access                                                                                                         |
| Environment  | Production or staging (development/test do not enforce Entra)                                                                                                 |
| Verification | Confirm outage is on Microsoft's side, not a local misconfiguration (check Azure status, test from a clean browser, review backend logs for `[Entra]` errors) |

---

## Fallback Toggle Procedure

### Step 1: Confirm the Outage

1. Check the [Azure Status Dashboard](https://status.azure.com/) for active incidents on Azure Active Directory / Entra ID.
2. Review backend logs for repeated Entra callback failures:
   ```bash
   # Docker / PM2 logs
   docker compose logs backend --tail 100 | grep -i '\[Entra\]\|OIDC\|login.microsoftonline'
   # or
   pm2 logs equip-backend --lines 100 | grep -i '\[Entra\]\|OIDC\|login.microsoftonline'
   ```
3. Verify the JWKS endpoint is unreachable:
   ```bash
   curl -sf "https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys" || echo "JWKS endpoint unreachable"
   ```
4. Log the decision: record the timestamp, confirming operator, and Azure incident ID in the incident channel.

### Step 2: Enable Local Fallback

Set the `ENTRA_ALLOW_LOCAL_FALLBACK` environment variable to `true` and restart the backend.

**Docker Compose:**

```bash
# Add or update the variable in the .env file
echo "ENTRA_ALLOW_LOCAL_FALLBACK=true" >> .env

# Restart the backend service
docker compose up -d backend
```

**PM2:**

```bash
# Set the variable and restart
ENTRA_ALLOW_LOCAL_FALLBACK=true pm2 restart equip-backend --update-env
```

**Platform-specific (Kubernetes / cloud provider):**
Update the secret or config map that feeds `ENTRA_ALLOW_LOCAL_FALLBACK` and trigger a rolling restart of the backend pods.

> **Important:** Do NOT disable `ENTRA_AUTH_ENABLED`. Keeping Entra enabled means the "Sign in with Microsoft" button stays visible. Users whose Azure sessions are still valid may succeed. Only the local fallback gate is being relaxed.

### Step 3: Verify Fallback Is Active

1. Confirm the backend started successfully (no startup assertion failure):
   ```bash
   docker compose logs backend --tail 20
   # Look for: "Security warning: local-credential fallback is active alongside Entra"
   ```
2. Test local login:
   ```bash
   curl -X POST http://localhost:4000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@festival.local","password":"festivalAdmin2025"}'
   # Expected: 200 OK with session token (not 410 Gone)
   ```
3. Verify from the frontend: navigate to `/login` and confirm the email/password form is visible below the Microsoft SSO button.

### Step 4: Communicate

- Notify the team via the incident channel that local fallback is active.
- Advise users who have Entra-only accounts (no local password) that they will be unable to log in until Entra is restored. These accounts can be given a temporary password via the admin panel if urgently needed.

---

## Restoring Entra-Only Mode

Once Microsoft confirms the Entra outage is resolved:

### Step 1: Verify Entra Is Healthy

```bash
# JWKS endpoint responds
curl -sf "https://login.microsoftonline.com/${AZURE_TENANT_ID}/discovery/v2.0/keys" | head -c 200

# Test Entra login from a browser — confirm the full SSO flow completes
```

### Step 2: Disable Local Fallback

Remove or unset `ENTRA_ALLOW_LOCAL_FALLBACK` and restart:

**Docker Compose:**

```bash
# Remove the line from .env
sed -i '/ENTRA_ALLOW_LOCAL_FALLBACK/d' .env

# Restart
docker compose up -d backend
```

**PM2:**

```bash
unset ENTRA_ALLOW_LOCAL_FALLBACK
pm2 restart equip-backend --update-env
```

### Step 3: Verify Entra-Only Is Re-Enforced

```bash
# Local login should return 410 Gone
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@festival.local","password":"festivalAdmin2025"}'
# Expected: 410 Gone, code: LOCAL_AUTH_DISABLED

# Entra login should work
curl http://localhost:4000/api/auth/entra/config
# Expected: {"enabled":true}
```

### Step 4: Close the Incident

- Confirm all users can sign in via Entra.
- Remove any temporary local passwords created for Entra-only accounts during the outage.
- Post an incident retrospective with timeline, impact, and actions taken.

---

## Decision Matrix

| Scenario                                                 | Action                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Entra outage, users locked out                           | Enable `ENTRA_ALLOW_LOCAL_FALLBACK=true`, restart backend     |
| Entra degraded but SSO still works                       | Monitor; do not toggle fallback unless users report failures  |
| Local misconfiguration (wrong tenant ID, expired secret) | Fix the configuration; do NOT enable fallback                 |
| Planned Entra maintenance window                         | Pre-enable fallback before the window if downtime is expected |

---

## Security Considerations

- **Duration:** Keep the fallback window as short as possible. Local credentials are a weaker authentication path (no MFA enforcement).
- **Audit:** The backend emits a startup warning (`Security warning: local-credential fallback is active alongside Entra`) that appears in logs and monitoring dashboards.
- **MFA gap:** Local login does not enforce MFA. For high-security environments, consider requiring VPN access or IP allowlisting during the fallback window.
- **Account hygiene:** After restoring Entra-only mode, revoke any temporary local passwords that were issued during the outage.

---

## Related Documentation

- [Entra Auth Rollout and Rollback Guide](../entra-auth-rollout.md)
- [PITR / WAL Archiving Runbook](pitr.md)
