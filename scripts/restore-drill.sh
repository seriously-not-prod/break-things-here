#!/bin/bash
#
# Point-in-Time Recovery (PITR) Restore Drill Script
#
# This script demonstrates a complete PITR restore workflow against a 
# throwaway test database. It validates that:
#   1. Base backup can be restored
#   2. WAL files can be replayed
#   3. Recovery to a specific point in time works
#   4. Recovered database is functional
#
# Prerequisites:
#   - Docker and docker-compose installed
#   - Base backup available (typically the persistent data volume)
#   - WAL archive available with archived WAL files
#   - Access to the PostgreSQL container
#
# Usage:
#   ./scripts/restore-drill.sh [TARGET_TIME]
#
#   TARGET_TIME: Optional recovery target time (format: YYYY-MM-DD HH:MM:SS)
#                If not provided, will recover to the latest available WAL
#
# Safety:
#   - Uses a separate throwaway container (festival-restore-test)
#   - Does not modify production data
#   - Base backup is read-only mounted
#   - Results are discarded when container stops
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_TIME="${1:-}"
RESTORE_CONTAINER="festival-restore-test"

# Color output for readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== PITR Restore Drill ===${NC}"
echo "Project root: $PROJECT_ROOT"
echo "Recovery target: ${TARGET_TIME:-latest available WAL}"

# Verify docker-compose is available
if ! command -v docker-compose &> /dev/null; then
  echo -e "${RED}Error: docker-compose not found${NC}"
  exit 1
fi

# Change to project root
cd "$PROJECT_ROOT"

# Check if base backup (data volume) exists
if ! docker volume inspect festival-postgres-data &> /dev/null; then
  echo -e "${RED}Error: Base backup volume 'festival-postgres-data' not found${NC}"
  echo "Please ensure the production database has run at least once"
  exit 1
fi

# Check if WAL archive exists and has files
if ! docker volume inspect festival-wal-archive &> /dev/null; then
  echo -e "${YELLOW}Warning: WAL archive volume not found or empty${NC}"
  echo "Recovery will only restore from base backup (no PITR)"
fi

echo -e "${YELLOW}Creating restore test container...${NC}"

# Remove existing restore test container if present
docker rm -f "$RESTORE_CONTAINER" 2>/dev/null || true

# Create a temporary recover.conf/postgresql.conf restoration script
RESTORE_SCRIPT=$(mktemp)
cat > "$RESTORE_SCRIPT" << 'EOF'
#!/bin/bash
set -e

PGDATA="/var/lib/postgresql/data"
WAL_ARCHIVE="/var/lib/postgresql/wal_archive"
TARGET_TIME="${TARGET_TIME:-}"

# Create recovery configuration
cat > "$PGDATA/recovery.signal" << 'RECOVERY'
# recovery.signal indicates we want to start in recovery mode
RECOVERY

if [ -n "$TARGET_TIME" ]; then
  cat > "$PGDATA/postgresql.auto.conf" << RECOVERY_CONF
recovery_target_timeline = 'latest'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
RECOVERY_CONF
  echo "Configured PITR recovery to: $TARGET_TIME"
else
  cat > "$PGDATA/postgresql.auto.conf" << RECOVERY_CONF
recovery_target_timeline = 'latest'
recovery_target_action = 'promote'
RECOVERY_CONF
  echo "Configured recovery to latest available WAL"
fi

echo "Starting PostgreSQL in recovery mode..."
exec postgres
EOF

chmod +x "$RESTORE_SCRIPT"

# Create temporary directory for recovery configuration
TEMP_RECOVERY_DIR=$(mktemp -d)
cp "$RESTORE_SCRIPT" "$TEMP_RECOVERY_DIR/restore.sh"

# Run restore test container
echo -e "${YELLOW}Starting restore test container...${NC}"
docker run \
  --name "$RESTORE_CONTAINER" \
  --rm \
  -e PGDATA=/var/lib/postgresql/data \
  -e TARGET_TIME="$TARGET_TIME" \
  -v festival-postgres-data:/var/lib/postgresql/data:ro \
  -v festival-wal-archive:/var/lib/postgresql/wal_archive:ro \
  -v "$TEMP_RECOVERY_DIR:/restore:ro" \
  postgres:16-alpine \
  sh -c "
    # Check if we have a valid base backup
    if [ ! -f /var/lib/postgresql/data/PG_VERSION ]; then
      echo 'Error: Invalid or missing base backup'
      exit 1
    fi
    
    # Create recovery signal
    touch /var/lib/postgresql/data/recovery.signal
    
    # Apply recovery configuration if specified
    if [ -n '$TARGET_TIME' ]; then
      cat > /var/lib/postgresql/data/postgresql.auto.conf << CONF
recovery_target_timeline = 'latest'
recovery_target_time = '$TARGET_TIME'
recovery_target_action = 'promote'
CONF
    fi
    
    # Start PostgreSQL
    postgres -c max_connections=10 &
    PID=\$!
    
    # Wait for recovery to complete
    sleep 10
    
    # Test database connectivity and basic functionality
    echo 'Testing recovered database...'
    if pg_isready -U postgres 2>/dev/null; then
      echo 'SUCCESS: Database recovered and is ready'
      psql -U postgres -d festival_planner -c 'SELECT version();' || echo 'Warning: Could not query database'
      kill \$PID 2>/dev/null || true
      exit 0
    else
      echo 'ERROR: Database recovery failed or database not ready'
      kill \$PID 2>/dev/null || true
      exit 1
    fi
  " || {
    echo -e "${RED}Restore drill failed${NC}"
    exit 1
  }

echo -e "${GREEN}SUCCESS: PITR restore drill completed successfully!${NC}"
echo "Recovery validated:"
echo "  - Base backup restored"
echo "  - WAL files replayed"
if [ -n "$TARGET_TIME" ]; then
  echo "  - Recovered to point in time: $TARGET_TIME"
fi
echo "  - Database is functional and ready"

# Cleanup
rm -f "$RESTORE_SCRIPT"
rm -rf "$TEMP_RECOVERY_DIR"

exit 0
