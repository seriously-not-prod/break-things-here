/**
 * PostgreSQL database initialization and management
 * Sets up the connection pool and runs schema migrations
 */

process.env.TZ = process.env.TZ || 'UTC';

import pg from 'pg';

const { Pool } = pg;

type SupportedDatabase = pg.Pool;
type DatabaseEngine = 'postgres';

export interface RunResult {
  lastID?: number;
  changes: number;
}

type AllReturn<T> = T extends Array<unknown> ? T : T[];

/**
 * Converts ? positional placeholders to PostgreSQL $N style.
 */
function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function stripReturningId(sql: string): string {
  return sql.replace(/\s+RETURNING\s+id\s*;?\s*$/i, '');
}

/**
 * Wrapper around a PostgreSQL Pool.
 * Provides get / all / run / exec so controller code can use a simple
 * database abstraction with placeholder conversion.
 */
export class DbWrapper {
  private db: SupportedDatabase;
  private engine: DatabaseEngine;

  constructor(db: SupportedDatabase, engine: DatabaseEngine) {
    this.db = db;
    this.engine = engine;
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const converted = convertPlaceholders(sql);
    const result = await (this.db as pg.Pool).query(converted, params);
    return result.rows[0] as T | undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<AllReturn<T>> {
    const converted = convertPlaceholders(sql);
    const result = await (this.db as pg.Pool).query(converted, params ?? []);
    return result.rows as AllReturn<T>;
  }

  /**
   * Executes a DML statement.
   * If the SQL contains a RETURNING clause, rows[0].id is surfaced as lastID.
   */
  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const trimmedUpper = sql.trim().toUpperCase();
    const converted = convertPlaceholders(sql);
    const result = await (this.db as pg.Pool).query(converted, params);
    const lastID = /\bRETURNING\b/.test(trimmedUpper) ? (result.rows[0]?.id as number | undefined) : undefined;
    return { lastID, changes: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await (this.db as pg.Pool).query(sql);
  }
}

let dbWrapper: DbWrapper | null = null;
let dbConnection: SupportedDatabase | null = null;
let dbEngine: DatabaseEngine | null = null;

const ORGANIZER_PERMISSION_NAMES = [
  'events.view',
  'events.create',
  'events.edit',
  'events.delete',
  'roles.view',
];

const ATTENDEE_PERMISSION_NAMES = ['events.view'];

async function seedRolePermissions(db: DbWrapper, sqliteMode: boolean): Promise<void> {
  await insertRolePermissions(db, 3, undefined, sqliteMode);
  await insertRolePermissions(db, 2, ORGANIZER_PERMISSION_NAMES, sqliteMode);
  await insertRolePermissions(db, 1, ATTENDEE_PERMISSION_NAMES, sqliteMode);
}

async function insertRolePermissions(
  db: DbWrapper,
  roleId: number,
  permissionNames: string[] | undefined,
  sqliteMode: boolean,
): Promise<void> {
  const params = [roleId, ...(permissionNames ?? [])];
  const permissionFilter = permissionNames?.length
    ? ` WHERE name IN (${permissionNames.map(() => '?').join(', ')})`
    : '';
  const insertClause = sqliteMode
    ? 'INSERT OR IGNORE INTO role_permissions (role_id, permission_id)'
    : 'INSERT INTO role_permissions (role_id, permission_id)';
  const conflictClause = sqliteMode ? '' : ' ON CONFLICT (role_id, permission_id) DO NOTHING';

  await db.run(
    `${insertClause}
     SELECT ?, id FROM permissions${permissionFilter}${conflictClause}`,
    params,
  );
}

/**
 * Initializes the PostgreSQL connection pool and runs schema migrations.
 */
export async function initializeDatabase(): Promise<DbWrapper> {
  if (dbWrapper) return dbWrapper;

  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/festival_planner';

  const pool = new Pool({ connectionString });
  pool.on('connect', (client) => {
    void client.query("SET TIME ZONE 'UTC'");
  });

  // Verify connectivity
  const client = await pool.connect();
  client.release();

  dbConnection = pool;
  dbEngine = 'postgres';
  dbWrapper = new DbWrapper(pool, 'postgres');
  await runMigrations(dbWrapper, 'postgres');

  return dbWrapper;
}

/**
 * Returns the initialised database wrapper.
 */
export function getDatabase(): DbWrapper {
  if (!dbWrapper) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbWrapper;
}

/**
 * Closes the database connection pool.
 */
export async function closeDatabase(): Promise<void> {
  if (dbConnection) {
    await (dbConnection as pg.Pool).end();
    dbConnection = null;
    dbEngine = null;
    dbWrapper = null;
  }
}

/**
 * Creates all application tables if they do not already exist and seeds
 * required reference data (roles, permissions).
 */
async function runMigrations(db: DbWrapper, engine: DatabaseEngine): Promise<void> {
  await runPostgresMigrations(db);
}

async function runPostgresMigrations(db: DbWrapper): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    await db.exec(`
      DROP TABLE IF EXISTS album_photos, albums, photo_shares, event_photos, event_documents,
        rsvps, tasks, event_members, events, role_permissions, permissions, user_profiles,
        sessions, password_reset_rate_limit, password_reset_tokens, audit_log, users CASCADE;
    `);
  }

  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      email_verified_at TIMESTAMPTZ,
      email_verification_token TEXT,
      pending_email TEXT,
      pending_email_token TEXT,
      pending_email_token_expiry TIMESTAMPTZ,
      role_id INTEGER DEFAULT 1,
      account_locked INTEGER DEFAULT 0,
      locked_until TIMESTAMPTZ,
      login_attempts INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMPTZ
    )
  `);

  // Create sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      last_activity TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create password_reset_tokens table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT NOT NULL,
      token_selector TEXT NOT NULL DEFAULT '',
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create password_reset_rate_limit table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email)
    )
  `);

  // Create audit_log table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT,
      action TEXT NOT NULL,
      description TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create roles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default roles (idempotent)
  await db.exec(`
    INSERT INTO roles (id, name, description) VALUES
    (1, 'Attendee', 'Default role for new users'),
    (2, 'Organizer', 'Can create and manage events'),
    (3, 'Admin', 'Full system access')
    ON CONFLICT (id) DO NOTHING
  `);

  // Advance the sequence past the seeded ids to avoid PK conflicts on later inserts
  await db.exec(`SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3))`);

  // Create permissions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create role_permissions junction table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

  // Create user_profiles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL,
      bio TEXT,
      phone_number TEXT,
      profile_photo_url TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      country TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Seed default permissions (idempotent)
  await db.exec(`
    INSERT INTO permissions (name, description) VALUES
    ('users.view',   'View user profiles'),
    ('users.edit',   'Edit user profiles'),
    ('users.delete', 'Delete users'),
    ('events.view',  'View events'),
    ('events.create','Create events'),
    ('events.edit',  'Edit events'),
    ('events.delete','Delete events'),
    ('roles.view',   'View roles'),
    ('roles.manage', 'Manage roles and permissions')
    ON CONFLICT (name) DO NOTHING
  `);

  await seedRolePermissions(db, false);

  // Create events table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT CHECK(event_type IN ('Birthday', 'Wedding', 'Corporate', 'Festival', 'Conference', 'Other')) DEFAULT 'Other',
      status TEXT CHECK(status IN ('Draft', 'Planning', 'Confirmed', 'Active', 'Completed', 'Cancelled')) DEFAULT 'Draft',
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ,
      venue_name TEXT,
      address TEXT,
      location TEXT,
      capacity INTEGER,
      is_public INTEGER DEFAULT 1,
      cover_image_url TEXT,
      tags TEXT,
      created_by INTEGER NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create tasks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assignee TEXT,
      due_date TEXT,
      status TEXT CHECK(status IN ('Pending', 'Complete')) DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Create rsvps table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      guests INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('Pending', 'Confirmed', 'Declined')) DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, email),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Create event_documents table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_documents (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      display_name TEXT,
      description TEXT,
      category TEXT,
      pinned INTEGER DEFAULT 0,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id)`);

  // Create event_photos table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_photos (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      caption TEXT,
      status TEXT CHECK(status IN ('Approved', 'Pending', 'Rejected')) DEFAULT 'Approved',
      is_cover INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON event_photos(event_id)`);

  // Albums and album_photos
  await db.exec(`
    CREATE TABLE IF NOT EXISTS albums (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cover_photo_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (cover_photo_id) REFERENCES event_photos(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS album_photos (
      album_id INTEGER NOT NULL,
      photo_id INTEGER NOT NULL,
      PRIMARY KEY (album_id, photo_id),
      FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
      FOREIGN KEY (photo_id) REFERENCES event_photos(id) ON DELETE CASCADE
    )
  `);

  // Share tokens for public photo links
  await db.exec(`
    CREATE TABLE IF NOT EXISTS photo_shares (
      token TEXT PRIMARY KEY,
      photo_id INTEGER NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (photo_id) REFERENCES event_photos(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_members (
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'Member',
      joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

