/**
 * Tests for Stale Session Cleanup (#253)
 *
 * Validates that expired sessions are purged while active ones remain.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeDatabase, getDatabase, closeDatabase } from '../src/db/database.js';
import { purgeExpiredSessions, startSessionCleanup, stopSessionCleanup } from '../src/utils/session-cleanup.js';

const originalDatabaseUrl = process.env.DATABASE_URL;

describe('Session Cleanup', () => {
  beforeEach(async () => {
    if (!originalDatabaseUrl) process.env.DATABASE_URL = ':memory:';
    await initializeDatabase();
    const db = getDatabase();

    // Create a test user for FK
    await db.run(
      `INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`,
      ['cleanup@test.com', 'hash123', 'Cleanup User'],
    );

    const pastDate1 = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
    const pastDate2 = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

    // Insert an expired session
    await db.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)`,
      [1, 'expired-token-1', 'expired-refresh-1', pastDate1],
    );

    // Insert another expired session
    await db.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)`,
      [1, 'expired-token-2', 'expired-refresh-2', pastDate2],
    );

    // Insert an active session (expires in the future)
    await db.run(
      `INSERT INTO sessions (user_id, token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)`,
      [1, 'active-token', 'active-refresh', futureDate],
    );
  });

  afterEach(async () => {
    stopSessionCleanup();
    await closeDatabase();
  });

  it('should purge only expired sessions', async () => {
    const purged = await purgeExpiredSessions();
    expect(purged).toBe(2);

    // Verify active session still exists
    const db = getDatabase();
    const remaining = await db.all('SELECT * FROM sessions');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].token).toBe('active-token');
  });

  it('should return 0 when no sessions are expired', async () => {
    // Purge first time
    await purgeExpiredSessions();
    // Purge again — nothing left to purge
    const purged = await purgeExpiredSessions();
    expect(purged).toBe(0);
  });

  it('should start and stop cleanup timer without error', () => {
    startSessionCleanup(60_000);
    // Starting again should be a no-op (no duplicate timers)
    startSessionCleanup(60_000);
    stopSessionCleanup();
  });
});
