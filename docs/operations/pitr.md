# Point-in-Time Recovery (PITR) Operations Runbook

## Overview

This runbook documents the Point-in-Time Recovery (PITR) infrastructure for the Festival Event Planner database. PITR allows recovery of the database to any point in time within the 14-day retention window, fulfilling NFR §5.4 requirements.

**Key Requirements:**

- Recovery capability for any point in the last 14 days
- Automated WAL (Write-Ahead Log) archiving
- Automated retention management
- Documented recovery procedures
- Regular recovery drills

## Architecture

### Components

1. **PostgreSQL WAL Archiving** (running in `db` service)
   - Enabled via `archive_mode=on` in docker-compose.yml
   - WAL level set to `replica` for full recovery capability
   - Archive command: `/usr/local/bin/archive-wal.sh "%p" "%f"`

2. **WAL Archive Volume** (`wal-archive`)
   - Stores archived WAL files
   - Mounted at `/var/lib/postgresql/wal_archive` in `db` container
   - Shared with `wal-archive-cleanup` service

3. **Retention Management** (`wal-archive-cleanup` service)
   - Automated cleanup via cron job
   - Runs daily to remove WAL files older than 14 days
   - Integrated with docker-compose for automatic orchestration

4. **Base Backup** (`postgres-data` volume)
   - Daily full backups via `db-backup` service
   - Combined with WAL replay for recovery

## Configuration Details

### PostgreSQL Parameters

Set in `docker-compose.yml` via command-line arguments:

```yaml
db:
  command:
    - postgres
    - -c archive_mode=on # Enable WAL archiving
    - -c archive_command=... # Archive command script
    - -c wal_level=replica # Full WAL for recovery
    - -c max_wal_senders=3 # Support for WAL streaming
    - -c wal_keep_size=1GB # Local WAL retention
```

**Parameter Meanings:**

- `archive_mode=on`: Enables archiving of WAL files to external archive
- `wal_level=replica`: Logs full information needed for WAL archiving and PITR
- `max_wal_senders=3`: Maximum concurrent WAL streaming connections (for replication/backups)
- `wal_keep_size=1GB`: Local retention of WAL segments before archiving

### Archive Command Script

**Location:** `scripts/archive-wal.sh`

The script is mounted into the PostgreSQL container and called whenever a WAL segment is ready for archiving:

```bash
archive_command=/usr/local/bin/archive-wal.sh "%p" "%f"
```

**Parameters:**

- `%p`: Full path to WAL file
- `%f`: WAL filename only

**Script Behavior:**

1. Creates archive directory if needed
2. Copies WAL file to `/var/lib/postgresql/wal_archive`
3. Returns exit code 0 (success) to trigger PostgreSQL cleanup

### Retention Policy

**WAL Retention:** 14 days (as required by NFR §5.4)

**Automated Cleanup:**

```
Cron: 0 * * * * (hourly)
Command: find /var/lib/postgresql/wal_archive -type f -mtime +14 -delete
```

This removes WAL files not accessed in the last 14 days, maintaining the required retention window.

## Recovery Procedures

### Quick Recovery Test (Restore Drill)

Before running a production recovery, execute the restore drill to validate:

- Base backup integrity
- WAL file availability
- Recovery process functionality

**Command:**

```bash
./scripts/restore-drill.sh [TARGET_TIME]
```

**Arguments:**

- `TARGET_TIME` (optional): Recovery target in format `YYYY-MM-DD HH:MM:SS`
- If not provided: Recovers to latest available WAL (crash recovery)

**Example - Recover to 2 hours ago:**

```bash
# First, calculate target time (shell)
TARGET_TIME=$(date -d '-2 hours' '+%Y-%m-%d %H:%M:%S')
./scripts/restore-drill.sh "$TARGET_TIME"
```

**Expected Output:**

```
=== PITR Restore Drill ===
...
SUCCESS: PITR restore drill completed successfully!
Recovery validated:
  - Base backup restored
  - WAL files replayed
  - Recovered to point in time: 2024-11-20 14:30:00
  - Database is functional and ready
```

### Full Production Recovery

When a production recovery is needed:

1. **Stop the application**

   ```bash
   docker-compose down
   ```

2. **Identify recovery target time**
   - Determine the exact point in time to recover to
   - This could be just before data corruption or loss
   - Verify target is within the 14-day retention window

3. **Access the database container's data volume**

   ```bash
   # Inspect the data volume
   docker volume inspect festival-postgres-data
   ```

4. **Perform recovery** (detailed steps below)

5. **Validate recovered data**

   ```bash
   docker-compose up db
   # Connect to database and verify data
   ```

6. **Resume application**
   ```bash
   docker-compose up
   ```

### Detailed Recovery Steps

**Step 1: Create recovery configuration**

Copy the base backup (or restore from volume):

```bash
# If recovering from external backup
cp -r /path/to/backup/data /pg_recovery_data

# Set recovery parameters
cat > /pg_recovery_data/postgresql.auto.conf << EOF
recovery_target_timeline = 'latest'
recovery_target_time = '2024-11-20 14:30:00'
recovery_target_action = 'promote'
EOF

# Signal PostgreSQL to start in recovery mode
touch /pg_recovery_data/recovery.signal
```

**Step 2: Start PostgreSQL in recovery mode**

```bash
# Run PostgreSQL with the recovery configuration
docker run --rm \
  -v festival-postgres-data:/var/lib/postgresql/data:ro \
  -v festival-wal-archive:/var/lib/postgresql/wal_archive:ro \
  postgres:16-alpine \
  postgres -c recovery_target_timeline='latest' \
           -c recovery_target_time='2024-11-20 14:30:00' \
           -c recovery_target_action='promote'
```

**Step 3: Monitor recovery progress**

PostgreSQL logs will show:

```
LOG: database system was interrupted; last known up at 2024-11-20 14:45:23...
LOG: starting archive recovery
LOG: restore command failed
LOG: archive recovery complete
LOG: database is ready to accept connections
```

**Step 4: Verify recovered data**

After recovery completes and database is ready:

```bash
psql -U postgres -d festival_planner -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
```

Check:

- All expected tables are present
- Row counts match expectations
- Timestamps are correct for recovery point

## Monitoring and Maintenance

### WAL Archiving Status

**Check if archiving is working:**

```bash
# Connect to PostgreSQL
psql -U postgres -c "
  SELECT
    datname,
    wal_level,
    CASE WHEN archive_mode = 'on' THEN 'ENABLED' ELSE 'DISABLED' END as archiving,
    archive_command
  FROM pg_database, pg_settings
  WHERE datname = 'festival_planner'
    AND name = 'archive_command';
"
```

**View archived WAL files:**

```bash
# List WAL files in archive
docker exec festival-db ls -lah /var/lib/postgresql/wal_archive/ | head -20
docker exec festival-db find /var/lib/postgresql/wal_archive -type f | wc -l
```

**Check archive retention:**

```bash
# Show oldest and newest archived WAL files
docker exec festival-db bash -c "
  echo 'Oldest WAL:' && ls -1t /var/lib/postgresql/wal_archive/ | tail -1
  echo 'Newest WAL:' && ls -1t /var/lib/postgresql/wal_archive/ | head -1
  echo 'Total WAL files:' && find /var/lib/postgresql/wal_archive -type f | wc -l
"
```

### Cleanup Verification

**Check cleanup cron job:**

```bash
# View cleanup cron logs
docker exec festival-wal-archive-cleanup cat /etc/crontabs/root
```

**Manual cleanup test:**

```bash
# Manually remove WAL files older than 7 days (for testing)
docker exec festival-wal-archive-cleanup \
  find /var/lib/postgresql/wal_archive -type f -mtime +7 -delete -print
```

### Health Checks

Add monitoring for:

```bash
# Check if WAL archiving is functioning
docker exec festival-db pg_stat_archiver

# Expected output shows:
# - archived_count > 0 (WALs successfully archived)
# - failed_count = 0 (no archiving failures)
# - last_archived_time recently updated
```

## Troubleshooting

### Issue: WAL Archiving Fails

**Symptoms:**

- `pg_stat_archiver.failed_count` > 0
- Archive directory not growing

**Resolution:**

```bash
# Check archive script permissions
docker exec festival-db ls -la /usr/local/bin/archive-wal.sh

# Check archive directory permissions
docker exec festival-db ls -la /var/lib/postgresql/ | grep wal_archive

# Check PostgreSQL logs
docker logs festival-db | grep archive
```

### Issue: Archive Directory Growing Too Large

**Symptoms:**

- Disk space warnings
- Archive directory exceeds expected size

**Resolution:**

```bash
# Check retention cleanup is running
docker logs festival-wal-archive-cleanup

# Manually verify WAL age
docker exec festival-wal-archive-cleanup \
  find /var/lib/postgresql/wal_archive -type f -mtime +14 -print

# Force cleanup if needed
docker exec festival-wal-archive-cleanup \
  find /var/lib/postgresql/wal_archive -type f -mtime +14 -delete
```

### Issue: Recovery Drill Fails

**Symptoms:**

- Restore drill exits with error
- "Invalid or missing base backup"

**Resolution:**

```bash
# Verify base backup volume exists and has data
docker volume ls | grep festival-postgres-data
docker run --rm -v festival-postgres-data:/data alpine ls /data

# Verify WAL archive exists
docker volume ls | grep festival-wal-archive
docker run --rm -v festival-wal-archive:/wal alpine ls /wal

# Check PostgreSQL version compatibility
docker run --rm postgres:16-alpine postgres --version
```

## Maintenance Schedule

| Task                          | Frequency | Contact           |
| ----------------------------- | --------- | ----------------- |
| Restore Drill                 | Monthly   | DevOps team       |
| WAL Archiving Health Check    | Weekly    | Monitoring system |
| Retention Policy Verification | Monthly   | DevOps team       |
| Full Disaster Recovery Test   | Quarterly | DevOps team + DBA |

## References

- NFR §5.4: Point-in-Time Recovery requirements
- PostgreSQL Documentation: [Backup and Restore](https://www.postgresql.org/docs/16/backup.html)
- PostgreSQL WAL: [Write-Ahead Logging](https://www.postgresql.org/docs/16/wal.html)
- Related Issues: #664 (Theme), #763 (User Story), #777 (This Task)

## Contact and Support

For questions or issues related to PITR:

- Review logs: `docker logs festival-db`, `docker logs festival-wal-archive-cleanup`
- Run restore drill: `./scripts/restore-drill.sh`
- Check monitoring dashboards
- Escalate to Database Reliability team if needed
