/**
 * PostgreSQL database initialization and management
 * Sets up the connection pool and runs schema migrations
 */

import pg from 'pg';

const { Pool } = pg;

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

/**
 * PostgreSQL wrapper providing get / all / run / exec interface
 * used by controller code throughout the application.
 */
export class DbWrapper {
  private db: pg.Pool;

  constructor(db: pg.Pool) {
    this.db = db;
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const converted = convertPlaceholders(sql);
    const result = await this.db.query(converted, params);
    return result.rows[0] as T | undefined;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<AllReturn<T>> {
    const converted = convertPlaceholders(sql);
    const result = await this.db.query(converted, params ?? []);
    return result.rows as AllReturn<T>;
  }

  /**
   * Executes a DML statement.
   * If the SQL contains a RETURNING clause, rows[0].id is surfaced as lastID.
   */
  async run(sql: string, params?: unknown[]): Promise<RunResult> {
    const trimmedUpper = sql.trim().toUpperCase();
    const converted = convertPlaceholders(sql);
    const result = await this.db.query(converted, params);
    const lastID = /\bRETURNING\b/.test(trimmedUpper) ? (result.rows[0]?.id as number | undefined) : undefined;
    return { lastID, changes: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.db.query(sql);
  }
}

let dbWrapper: DbWrapper | null = null;
let dbConnection: pg.Pool | null = null;

const ORGANIZER_PERMISSION_NAMES = [
  'events.view',
  'events.create',
  'events.edit',
  'events.delete',
  'roles.view',
];

const ATTENDEE_PERMISSION_NAMES = ['events.view'];

async function seedRolePermissions(db: DbWrapper): Promise<void> {
  await insertRolePermissions(db, 3, undefined);
  await insertRolePermissions(db, 2, ORGANIZER_PERMISSION_NAMES);
  await insertRolePermissions(db, 1, ATTENDEE_PERMISSION_NAMES);
}

async function insertRolePermissions(
  db: DbWrapper,
  roleId: number,
  permissionNames: string[] | undefined,
): Promise<void> {
  const params = [roleId, ...(permissionNames ?? [])];
  const permissionFilter = permissionNames?.length
    ? ` WHERE name IN (${permissionNames.map(() => '?').join(', ')})`
    : '';

  await db.run(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT ?::int, id FROM permissions${permissionFilter} ON CONFLICT (role_id, permission_id) DO NOTHING`,
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

  // Verify connectivity
  const client = await pool.connect();
  client.release();

  dbConnection = pool;
  dbWrapper = new DbWrapper(pool);
  await runPostgresMigrations(dbWrapper);

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
    await dbConnection.end();
    dbConnection = null;
    dbWrapper = null;
  }
}

/**
 * Creates all application tables if they do not already exist and seeds
 * required reference data (roles, permissions).
 * Exported so tests can validate the real migration SQL.
 */
export async function runPostgresMigrations(db: DbWrapper): Promise<void> {
  // Create users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      email_verified_at TIMESTAMP,
      email_verification_token TEXT,
      pending_email TEXT,
      pending_email_token TEXT,
      pending_email_token_expiry TIMESTAMP,
      role_id INTEGER DEFAULT 1,
      account_locked INTEGER DEFAULT 0,
      locked_until TIMESTAMP,
      login_attempts INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  // Create sessions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      expires_at TIMESTAMP NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create password_reset_rate_limit table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create roles table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  try {
    await db.exec(`SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3))`);
  } catch {
    // In-memory test adapters (pg-mem) may not expose sequence objects — safe to skip
  }

  // Create permissions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

  await seedRolePermissions(db);

  // Create events table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT,
      status TEXT CHECK(status IN ('Draft', 'Active', 'Completed')) DEFAULT 'Draft',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_members (
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT DEFAULT 'Member',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, user_id),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create venues table (#273)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS venues (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL,
      name          TEXT NOT NULL,
      address       TEXT,
      city          TEXT,
      capacity      INTEGER,
      contact_name  TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      status        TEXT CHECK(status IN ('Confirmed', 'Tentative', 'Cancelled')) DEFAULT 'Tentative',
      notes         TEXT,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_venues_event_id ON venues(event_id)`);

  // Create vendors table (#273)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL,
      name          TEXT NOT NULL,
      category      TEXT,
      contact_name  TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      cost          REAL,
      status        TEXT CHECK(status IN ('Confirmed', 'Pending', 'Cancelled')) DEFAULT 'Pending',
      notes         TEXT,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendors_event_id ON vendors(event_id)`);

  // Create event_budgets table (#274)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_budgets (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL UNIQUE,
      total_budget REAL NOT NULL,
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  // Create expense_categories table (#274)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    INSERT INTO expense_categories (name) VALUES
    ('Catering'),
    ('AV'),
    ('Security'),
    ('Venue'),
    ('Marketing'),
    ('Other')
    ON CONFLICT (name) DO NOTHING
  `);

  // Create expenses table (#274)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL,
      category_id  INTEGER NOT NULL,
      description  TEXT NOT NULL,
      amount       REAL NOT NULL,
      vendor_id    INTEGER,
      receipt_url  TEXT,
      status       TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      created_by   INTEGER NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id)    REFERENCES events(id)             ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES expense_categories(id),
      FOREIGN KEY (vendor_id)   REFERENCES vendors(id)            ON DELETE SET NULL,
      FOREIGN KEY (created_by)  REFERENCES users(id)              ON DELETE CASCADE
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_event_id ON expenses(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id)`);
}
