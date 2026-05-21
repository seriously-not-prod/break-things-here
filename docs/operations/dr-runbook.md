# Disaster Recovery Runbook

Issues: #824, #766

Review date: 2026-05-20
Reviewed by: savitasawanteisg-byte

---

## Purpose

This runbook documents the end-to-end Disaster Recovery (DR) procedure for the Festival Event Planner system. It covers detection, escalation, RTO/RPO targets, database and application restore steps, communications templates, and the post-incident review process.

For Point-in-Time Recovery (PITR) configuration, WAL archiving setup, and recovery drills, see the companion runbook:
**[docs/operations/pitr.md](pitr.md)**

---

## RTO / RPO Targets

| Tier     | Service component         | RPO (max data loss) | RTO (max downtime) |
| -------- | ------------------------- | ------------------- | ------------------ |
| Critical | PostgreSQL database       | 1 hour              | 4 hours            |
| Critical | Backend API               | 0 (stateless)       | 1 hour             |
| Standard | Frontend (static build)   | 0 (stateless)       | 2 hours            |
| Standard | File uploads (`uploads/`) | 24 hours            | 4 hours            |

> **NFR reference:** NFR §5.4 requires a 14-day recovery window. The 1-hour RPO
> for the database is met by WAL archiving with a 1-hour archive interval.

---

## Detection

### Monitoring Signals

The following signals indicate a potential disaster scenario requiring this runbook:

| Signal                                 | Source                                           | Severity |
| -------------------------------------- | ------------------------------------------------ | -------- |
| Database container down / unresponsive | `docker compose ps` / health-check alert         | Critical |
| Backend API returning 5xx errors       | Application logs / uptime monitor                | Critical |
| WAL archive volume full or corrupt     | `wal-archive-cleanup` service logs               | High     |
| Data corruption detected               | Application error logs / integrity check failure | Critical |
| Host filesystem failure                | System metrics / disk alerts                     | Critical |
| Entire environment unreachable         | Uptime monitor / deployment pipeline             | Critical |

### Detection Commands

```bash
# Check container health
docker compose ps

# Check database connectivity
docker compose exec db pg_isready -U postgres

# Check WAL archive status
docker compose logs wal-archive-cleanup --tail 50

# Check disk space on WAL volume
docker compose exec db df -h /var/lib/postgresql/wal_archive

# Check backend logs for errors
docker compose logs backend --tail 100 | grep -i 'error\|fatal\|panic'
```

---

## Escalation

### On-Call Matrix

| Role                | Responsibility                                             |
| ------------------- | ---------------------------------------------------------- |
| On-call Engineer    | First responder; initial triage and detection confirmation |
| Database Admin      | Owns restore procedure; executes PITR steps                |
| Team Lead / Manager | Escalation if RTO breach is imminent (> 2 hours elapsed)   |
| Communications Lead | Sends stakeholder status updates                           |

### Escalation Procedure

1. **T+0** — On-call engineer detects signal and opens an incident channel (e.g. `#incident-YYYY-MM-DD`).
2. **T+0:15** — Confirm the incident scope: is it isolated to one service, the database, or the entire environment?
3. **T+0:30** — If database or data loss is involved, page the Database Admin immediately.
4. **T+1:00** — If RTO looks at risk, escalate to Team Lead and send the initial stakeholder communication (template below).
5. **T+2:00** — If not resolved and the RTO breach is imminent, escalate to management and consider invoking the full DR restore.
6. **T+recovery** — Send resolution communication; schedule post-incident review within 3 business days.

---

## Restore Steps

### Step 1 — Preserve Evidence

Before making any changes, capture the current state:

```bash
# Snapshot container logs
docker compose logs --no-color > /tmp/incident-$(date +%Y%m%d%H%M)-logs.txt

# Record current container status
docker compose ps >> /tmp/incident-$(date +%Y%m%d%H%M)-logs.txt

# Check WAL archive integrity
ls -lh $(docker compose exec db ls /var/lib/postgresql/wal_archive | tail -10)
```

### Step 2 — Determine Recovery Point

Identify the target recovery timestamp. Use the latest clean backup unless a specific point-in-time is required:

```bash
# List available base backups
docker compose exec db ls -lh /var/lib/postgresql/data/base_backup/ 2>/dev/null || echo "No local base backup found"

# Identify latest WAL archive file
docker compose exec db ls -lt /var/lib/postgresql/wal_archive | head -10
```

> For full PITR steps (restore_command setup, `recovery.conf`, recovery target
> syntax, and validation) see **[pitr.md](pitr.md)**.

### Step 3 — Stop Affected Services

```bash
# Stop backend and frontend to prevent writes during recovery
docker compose stop backend frontend

# Verify only db is running
docker compose ps
```

### Step 4 — Restore the Database

Follow the full step-by-step procedure in **[docs/operations/pitr.md](pitr.md)**:

1. Stop the database container.
2. Replace the data directory with the base backup.
3. Configure `recovery.conf` (or `postgresql.conf` on PostgreSQL 12+) with `restore_command` and `recovery_target_time`.
4. Start the database in recovery mode.
5. Promote the instance to primary once the target time is reached.
6. Verify data integrity.

```bash
# After following pitr.md, verify the database is accepting connections
docker compose exec db psql -U postgres -c "SELECT NOW(), COUNT(*) FROM events;"
```

### Step 5 — Run Pending Migrations

After the restore, apply any migrations that were committed after the recovery point:

```bash
# From the project root
docker compose exec backend npx knex migrate:latest
```

### Step 6 — Restore File Uploads

If the `uploads/` directory was lost, restore from the most recent backup of the `uploads` volume:

```bash
# Example: restore from a tar archive
# Adjust the source path to your backup storage location
tar -xzf /backup/uploads-$(date +%Y%m%d).tar.gz -C ./backend/uploads/
```

### Step 7 — Restart and Verify

```bash
# Bring all services back up
docker compose up -d

# Health check
curl -f http://localhost:3001/api/health || echo "Backend not healthy"
curl -f http://localhost:5173 || echo "Frontend not responding"

# Check for new errors
docker compose logs backend --tail 50 | grep -i error
```

---

## Communications Templates

### Initial Incident Notification

Send within **1 hour** of incident declaration:

```
Subject: [INCIDENT] Festival Event Planner — <brief description>

Status: Investigating
Time of detection: <ISO-8601 timestamp>
Affected services: <list>
Estimated impact: <number of users / operations affected>

We are actively investigating. Next update in 60 minutes or sooner if resolved.

Incident channel: #incident-YYYY-MM-DD
On-call engineer: <name>
```

### Progress Update

Send every **60 minutes** until resolved:

```
Subject: [UPDATE] Festival Event Planner incident — <time elapsed>

Status: <Investigating / Recovering / Monitoring>
Actions taken so far:
  - <action 1>
  - <action 2>

Current ETA for resolution: <time>
Next update: <time or "on resolution">
```

### Resolution Notification

Send immediately on resolution:

```
Subject: [RESOLVED] Festival Event Planner — <brief description>

Status: Resolved
Resolution time: <ISO-8601 timestamp>
Total downtime: <duration>
Data loss (if any): <description or "None">

Root cause (preliminary): <brief description>
A full post-incident review will be completed within 3 business days.
```

---

## Post-Incident Review Template

Complete within **3 business days** of resolution and store under `docs/processes/`.

```markdown
# Post-Incident Review — <YYYY-MM-DD> <title>

## Incident Summary

- **Date/time detected:** <ISO-8601>
- **Date/time resolved:** <ISO-8601>
- **Total duration:** <h:mm>
- **Data loss:** <None | description>
- **Services affected:** <list>
- **On-call engineers:** <names>

## Timeline

| Time (UTC) | Event                       |
| ---------- | --------------------------- |
| HH:MM      | Incident detected           |
| HH:MM      | Root cause identified       |
| HH:MM      | Recovery action started     |
| HH:MM      | Services restored           |
| HH:MM      | Monitoring confirmed stable |

## Root Cause

<Clear description of the root cause.>

## Contributing Factors

- <Factor 1>
- <Factor 2>

## Impact

- **Users affected:** <count / "unknown">
- **Data integrity:** <Confirmed intact | Data loss description>
- **Regulatory / compliance impact:** <None | description>

## What Went Well

- <Item 1>
- <Item 2>

## What Could Be Improved

- <Item 1>
- <Item 2>

## Action Items

| Action                          | Owner  | Due date   | Issue |
| ------------------------------- | ------ | ---------- | ----- |
| <Preventive action description> | <name> | YYYY-MM-DD | #xxx  |

## Sign-Off

Reviewed by: <names>
Date: YYYY-MM-DD
```

---

## Related Documentation

- **[docs/operations/pitr.md](pitr.md)** — PITR configuration, WAL archiving, restore drills, and retention policy (14-day window)
- **[docs/security/tls.md](../security/tls.md)** — TLS termination and certificate renewal
- **[docs/security/jwt-secrets.md](../security/jwt-secrets.md)** — Secret rotation and emergency session revocation
- **[scripts/revoke-all-sessions.sql](../../scripts/revoke-all-sessions.sql)** — Emergency session revocation
- **[SECURITY.md](../../SECURITY.md)** — Security vulnerability reporting and policies
