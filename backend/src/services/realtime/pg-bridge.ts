/**
 * PostgreSQL LISTEN/NOTIFY bridge for the unified real-time hub (#809).
 *
 * Maintains one dedicated `pg.Client` per process that LISTENs on the
 * `realtime_hub` channel.  When a NOTIFY payload arrives from another replica,
 * it calls `hub.publishLocal()` — fan-out only, no second NOTIFY — keeping all
 * replicas in sync without message storms.
 *
 * Usage:
 *   - Call `initPgBridge()` once after the database pool is ready at startup.
 *   - Call `closePgBridge()` in your shutdown hook.
 *   - The hub calls `notifyReplicas()` after every local publish.
 */
import pg from 'pg';
import { logger } from '../../utils/logger.js';
import { hub, type HubMessage } from './hub.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL = 'realtime_hub';
const RECONNECT_DELAY_MS = 5_000;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let bridgeClient: pg.Client | null = null;
let shuttingDown = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function connect(): Promise<void> {
  if (shuttingDown) return;

  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    logger.warn('[pg-bridge] DATABASE_URL not set — cross-replica sync disabled');
    return;
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    // Channel name is a fixed constant — no user input, safe to inline.
    await client.query(`LISTEN "${CHANNEL}"`);
    bridgeClient = client;
    logger.info(`[pg-bridge] Listening on channel "${CHANNEL}"`);

    client.on('notification', (notification) => {
      if (!notification.payload) return;
      try {
        const message = JSON.parse(notification.payload) as HubMessage;
        hub.publishLocal(message);
      } catch (err) {
        logger.warn('[pg-bridge] Malformed notification payload — skipping', { err: String(err) });
      }
    });

    client.on('error', (err) => {
      logger.error('[pg-bridge] Client error — scheduling reconnect', { err: String(err) });
      bridgeClient = null;
      scheduleReconnect();
    });

    client.on('end', () => {
      if (!shuttingDown) {
        logger.warn('[pg-bridge] Connection ended unexpectedly — scheduling reconnect');
        bridgeClient = null;
        scheduleReconnect();
      }
    });
  } catch (err) {
      logger.error('[pg-bridge] Connection failed — scheduling reconnect', { err: String(err) });
    try {
      await client.end();
    } catch {
      /* already closed */
    }
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (!shuttingDown) {
    setTimeout(() => void connect(), RECONNECT_DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the bridge. Call once after the database pool is ready.
 * Safe to call multiple times (idempotent when already connected).
 */
export async function initPgBridge(): Promise<void> {
  shuttingDown = false;
  if (!bridgeClient) {
    await connect();
  }
}

/** Gracefully close the bridge client (e.g., during server shutdown). */
export async function closePgBridge(): Promise<void> {
  shuttingDown = true;
  if (bridgeClient) {
    try {
      await bridgeClient.end();
    } catch {
      /* ignore */
    }
    bridgeClient = null;
  }
}

/**
 * Send a NOTIFY to all other replica processes listening on `realtime_hub`.
 * No-ops silently when the bridge is not initialised (e.g., in test environments).
 *
 * The payload is serialised as JSON and limited to 8 000 bytes by Postgres;
 * callers are responsible for keeping message payloads small.
 */
export async function notifyReplicas(message: HubMessage): Promise<void> {
  if (!bridgeClient) return;
  const payload = JSON.stringify(message);
  // pg parameterised query prevents injection of channel name (which is a
  // fixed constant anyway) and sanitises the payload string.
  await bridgeClient.query(`NOTIFY "${CHANNEL}", $1`, [payload]);
}
