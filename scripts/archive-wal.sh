#!/bin/sh
#
# WAL archiving script for PostgreSQL Point-in-Time Recovery (PITR)
# 
# This script is executed by PostgreSQL whenever a WAL (Write-Ahead Log) file
# is ready to be archived. It copies the WAL file to the wal_archive volume.
#
# Usage: archive-wal.sh <path> <filename>
#   $1 (%p): Full path to WAL file
#   $2 (%f): WAL filename only
#
# PostgreSQL configuration (docker-compose.yml):
#   archive_command=/usr/local/bin/archive-wal.sh "%p" "%f"
#   archive_mode=on
#   wal_level=replica
#

set -e

# Command-line arguments from PostgreSQL
WAL_PATH="$1"
WAL_FILENAME="$2"

# Archive directory
ARCHIVE_DIR="/var/lib/postgresql/wal_archive"

# Ensure archive directory exists
mkdir -p "$ARCHIVE_DIR"

# Copy WAL file to archive directory
# cp -p preserves file permissions and timestamps
cp -p "$WAL_PATH" "$ARCHIVE_DIR/$WAL_FILENAME"

# Return success (exit code 0) so PostgreSQL removes the original WAL file
exit 0
