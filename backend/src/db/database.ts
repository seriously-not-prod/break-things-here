/**
 * PostgreSQL database initialization and management
 * Sets up the connection pool and runs schema migrations
 */

import pg from 'pg';

export interface RunResult {
  lastID?: number;
  changes: number;
}

interface DatabaseRow {
  [key: string]: unknown;
}

type QueryParams = unknown[];

export interface DatabaseAdapter {
  get<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T | undefined>;
  all<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T[]>;
  run(sql: string, params?: QueryParams): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  close?(): Promise<void>;
}

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

// Postgres wrapper (keeps existing behaviour)
class PgWrapper {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  async get<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T | undefined> {
    const converted = convertPlaceholders(sql);
    const result = await this.pool.query<DatabaseRow>(converted, params ?? []);
    return result.rows[0] as T | undefined;
  }

  async all<T = DatabaseRow>(sql: string, params?: QueryParams): Promise<T[]> {
    const converted = convertPlaceholders(sql);
    const result = await this.pool.query<DatabaseRow>(converted, params ?? []);
    return result.rows as T[];
  }

  async run(sql: string, params?: QueryParams): Promise<RunResult> {
    const trimmedUpper = sql.trim().toUpperCase();
    const converted = convertPlaceholders(sql);
    const result = await this.pool.query<{ id?: number }>(converted, params ?? []);
    const lastID = /\bRETURNING\b/.test(trimmedUpper) ? result.rows[0]?.id : undefined;
    return { lastID, changes: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

let dbWrapper: DatabaseAdapter | null = null;
let pool: pg.Pool | null = null;

const ORGANIZER_PERMISSION_NAMES = [
  'events.view',
  'events.create',
  'events.edit',
  'events.delete',
  'roles.view',
];

const ATTENDEE_PERMISSION_NAMES = ['events.view'];

const ROLE_NAMES = {
  attendee: 'Attendee',
  organizer: 'Organizer',
  admin: 'Admin',
} as const;

type RoleName = (typeof ROLE_NAMES)[keyof typeof ROLE_NAMES];

async function seedRolePermissions(db: DatabaseAdapter): Promise<void> {
  const [adminRoleId, organizerRoleId, attendeeRoleId] = await Promise.all([
    getRoleIdByName(db, ROLE_NAMES.admin),
    getRoleIdByName(db, ROLE_NAMES.organizer),
    getRoleIdByName(db, ROLE_NAMES.attendee),
  ]);

  await insertRolePermissions(db, adminRoleId);
  await insertRolePermissions(db, organizerRoleId, ORGANIZER_PERMISSION_NAMES);
  await insertRolePermissions(db, attendeeRoleId, ATTENDEE_PERMISSION_NAMES);
}

async function getRoleIdByName(db: DatabaseAdapter, roleName: RoleName): Promise<number> {
  const role = await db.get<{ id: number }>('SELECT id FROM roles WHERE name = ?', [roleName]);
  if (!role) {
    throw new Error(`Role ${roleName} was not found during permission seeding`);
  }

  return role.id;
}

async function insertRolePermissions(
  db: DatabaseAdapter,
  roleId: number,
  permissionNames?: string[],
): Promise<void> {
  const params = [roleId, ...(permissionNames ?? [])];
  const permissionFilter = permissionNames?.length
    ? ` WHERE name IN (${permissionNames.map(() => '?').join(', ')})`
    : '';
  await db.run(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT ?, id FROM permissions${permissionFilter} ON CONFLICT (role_id, permission_id) DO NOTHING`,
    params,
  );
}

export async function initializeDatabase(): Promise<DatabaseAdapter> {
  if (dbWrapper) return dbWrapper;

  const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. Set it to a PostgreSQL connection string.',
    );
  }

  const { Pool } = pg;
  pool = new Pool({ connectionString });
  const client = await pool.connect();
  client.release();
  dbWrapper = new PgWrapper(pool);
  await runMigrations(dbWrapper);
  return dbWrapper;
}

export function getDatabase(): DatabaseAdapter {
  if (!dbWrapper) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return dbWrapper;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    dbWrapper = null;
  }
}

async function runMigrations(db: DatabaseAdapter): Promise<void> {
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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_rate_limit (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email)
    )
  `);

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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    INSERT INTO roles (id, name, description) VALUES
    (1, 'Attendee', 'Default role for new users'),
    (2, 'Organizer', 'Can create and manage events'),
    (3, 'Admin', 'Full system access')
    ON CONFLICT (id) DO NOTHING
  `);

  await db.exec(`SELECT setval('roles_id_seq', GREATEST((SELECT MAX(id) FROM roles), 3))`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

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

  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT,
      capacity INTEGER,
      status TEXT CHECK(status IN ('Draft', 'Active', 'Completed')) DEFAULT 'Draft',
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'Other'`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS tags TEXT`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity INTEGER`);
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
  // Rename legacy event_date column to date if the old schema is still present
  {
    const col = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_date') AS exists`,
    );
    if (col?.exists) await db.exec(`ALTER TABLE events RENAME COLUMN event_date TO date`);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS activity_feed (
      id SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      link TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      assignee_name TEXT,
      assigned_user_id INTEGER,
      due_date TEXT,
      status TEXT CHECK(status IN ('Pending', 'In Progress', 'Blocked', 'Complete')) DEFAULT 'Pending',
      priority TEXT CHECK(priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvps (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      guests INTEGER DEFAULT 1,
      status TEXT CHECK(status IN ('Pending', 'Going', 'Maybe', 'Not Going', 'Declined')) DEFAULT 'Pending',
      notes TEXT,
      source TEXT DEFAULT 'public',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, email),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    )
  `);

  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS phone TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS dietary_restriction TEXT DEFAULT 'None'`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS accessibility_needs TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS plus_one_name TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS guest_group TEXT`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'public'`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS communication_log (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      guest_email TEXT,
      communication_type TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      status TEXT DEFAULT 'sent',
      sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_communication_log_event_id ON communication_log(event_id)');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      allocated_amount NUMERIC(10,2) DEFAULT 0,
      color TEXT DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES budget_categories(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      payment_status TEXT CHECK(payment_status IN ('Pending','Paid','Overdue','Cancelled')) DEFAULT 'Pending',
      vendor_name TEXT,
      notes TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS seating_tables (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 8,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS seating_assignments (
      table_id INTEGER NOT NULL REFERENCES seating_tables(id) ON DELETE CASCADE,
      rsvp_id INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
      PRIMARY KEY (table_id, rsvp_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  await db.exec('CREATE INDEX IF NOT EXISTS idx_event_documents_event_id ON event_documents(event_id)');

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

  // ── Vendor Management (BRD 3.6) ──────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendors (
      id             SERIAL PRIMARY KEY,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      category       TEXT NOT NULL,
      email          TEXT,
      phone          TEXT,
      website        TEXT,
      status         TEXT CHECK(status IN ('Contacted','Quote Received','Booked','Confirmed','Cancelled')) DEFAULT 'Contacted',
      quoted_amount  NUMERIC(10,2),
      contract_file  TEXT,
      notes          TEXT,
      rating         INTEGER CHECK(rating BETWEEN 1 AND 5),
      created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Shopping Lists & Items (BRD 3.7) ─────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id             SERIAL PRIMARY KEY,
      list_id        INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      quantity       INTEGER DEFAULT 1,
      unit           TEXT,
      estimated_cost NUMERIC(10,2),
      actual_cost    NUMERIC(10,2),
      status         TEXT CHECK(status IN ('Needed','Purchased','Not Available','Ordered')) DEFAULT 'Needed',
      assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes          TEXT,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Event Timeline (BRD 3.8) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS timeline_activities (
      id          SERIAL PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT,
      start_time  TIMESTAMP,
      end_time    TIMESTAMP,
      location    TEXT,
      vendor_id   INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
      sort_order  INTEGER DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Task enhancements (BRD 3.5, issues #373 #374) ────────────────────────
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2)`);
  // Schema drift fix: tasks created before full migration were missing these columns
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium'`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL`);

  // ── Vendors schema drift fix ──────────────────────────────────────────────
  // Older DB had company_name/booking_status; current code expects name/status
  {
    const col = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='company_name') AS exists`,
    );
    if (col?.exists) await db.exec(`ALTER TABLE vendors RENAME COLUMN company_name TO name`);
  }
  {
    const col = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vendors' AND column_name='booking_status') AS exists`,
    );
    if (col?.exists) await db.exec(`ALTER TABLE vendors RENAME COLUMN booking_status TO status`);
  }
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS website TEXT`);
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contract_file TEXT`);
  await db.exec(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rating INTEGER`);

  // ── Expenses schema drift fix ─────────────────────────────────────────────
  // Older DB stored vendor FK; current code stores vendor_name as free text
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor_name TEXT`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_subtasks (
      id         SERIAL PRIMARY KEY,
      task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      completed  BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id ON task_subtasks(task_id)`);

  // ── Event Messages / Team Conversation (issue #messages) ─────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_messages (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_messages_event_id ON event_messages(event_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_messages_sender_id ON event_messages(sender_id)`);

  // ── Multi-day events: add end_date column (#217) ──────────────────────────
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT`);

  // ── Event Categories — lookup table + junction table (#217) ───────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id          SERIAL PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    INSERT INTO categories (name) VALUES
    ('Music'),
    ('Food & Beverage'),
    ('Entertainment'),
    ('Sports'),
    ('Art & Culture'),
    ('Business'),
    ('Technology'),
    ('Education'),
    ('Charity'),
    ('Other')
    ON CONFLICT (name) DO NOTHING
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_categories (
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, category_id)
    )
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_event_categories_event_id ON event_categories(event_id)`);

  // ── Gallery caption support (#409, #430) ─────────────────────────────────
  await db.exec(`ALTER TABLE event_documents ADD COLUMN IF NOT EXISTS caption TEXT`);

  // ── Entra ID identity linking (#468, #470) ────────────────────────────────
  // entra_oid: Azure object ID — unique per Entra tenant identity
  // auth_provider: 'local' | 'entra' — tracks how the account was created
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid TEXT`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL`);
}
