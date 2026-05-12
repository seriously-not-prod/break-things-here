/**
 * PostgreSQL database initialization and management
 * Sets up the connection pool and runs schema migrations
 */

import pg from 'pg';
import { hashPassword } from '../utils/auth-helpers.js';

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
  withUserContext?<T>(userId: number, fn: (db: DatabaseAdapter) => Promise<T>): Promise<T>;
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

  async withUserContext<T>(userId: number, fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
      const contextDb: DatabaseAdapter = {
        async get<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R | undefined> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows[0] as R | undefined;
        },
        async all<R = DatabaseRow>(sql: string, params?: QueryParams): Promise<R[]> {
          const res = await client.query<DatabaseRow>(convertPlaceholders(sql), params ?? []);
          return res.rows as R[];
        },
        async run(sql: string, params?: QueryParams): Promise<RunResult> {
          const upper = sql.trim().toUpperCase();
          const res = await client.query<{ id?: number }>(convertPlaceholders(sql), params ?? []);
          const lastID = /\bRETURNING\b/.test(upper) ? res.rows[0]?.id : undefined;
          return { lastID, changes: res.rowCount ?? 0 };
        },
        async exec(sql: string): Promise<void> {
          await client.query(sql);
        },
      };
      const result = await fn(contextDb);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

const DEV_DEMO_USERS = [
  {
    email: 'admin@festival.local',
    password: 'Admin123!',
    displayName: 'Admin User',
    roleId: 3,
  },
  {
    email: 'organizer@festival.local',
    password: 'Organizer123!',
    displayName: 'Sarah Organizer',
    roleId: 2,
  },
  {
    email: 'organizer2@festival.local',
    password: 'Organizer123!',
    displayName: 'James Organizer',
    roleId: 2,
  },
  {
    email: 'alice@festival.local',
    password: 'Password123!',
    displayName: 'Alice Johnson',
    roleId: 1,
  },
  {
    email: 'bob@festival.local',
    password: 'Password123!',
    displayName: 'Bob Williams',
    roleId: 1,
  },
  {
    email: 'carol@festival.local',
    password: 'Password123!',
    displayName: 'Carol Davis',
    roleId: 1,
  },
  {
    email: 'alice@email.com',
    password: 'Password123!',
    displayName: 'Alice',
    roleId: 1,
  },
] as const;

const DEV_DEMO_EVENT = {
  title: 'Eventora Launch Festival',
  date: '2026-06-18',
  endDate: '2026-06-20',
  location: 'Riverfront Park',
  description: 'Seeded demo event for exploring the full Eventora workspace.',
  capacity: 250,
  status: 'Active',
  eventType: 'Music',
  tags: 'launch,summer,vip',
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

async function seedDevelopmentDemoUsers(db: DatabaseAdapter): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  for (const user of DEV_DEMO_USERS) {
    const passwordHash = await hashPassword(user.password);
    await db.run(
      `INSERT INTO users (email, password_hash, display_name, email_verified, role_id, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         email_verified = 1,
         role_id = EXCLUDED.role_id,
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [user.email, passwordHash, user.displayName, user.roleId],
    );
  }
}

async function seedDevelopmentDemoWorkspace(db: DatabaseAdapter): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const admin = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['admin@festival.local']);
  const attendee = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', ['alice@email.com']);

  if (!admin) return;

  let event = await db.get<{ id: number }>(
    'SELECT id FROM events WHERE title = ? AND created_by = ? AND deleted_at IS NULL ORDER BY id LIMIT 1',
    [DEV_DEMO_EVENT.title, admin.id],
  );

  if (!event) {
    const created = await db.run(
      `INSERT INTO events (
        title, date, location, description, capacity, status, created_by,
        created_at, updated_at, event_type, tags, is_public, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, TRUE, ?)
      RETURNING id`,
      [
        DEV_DEMO_EVENT.title,
        DEV_DEMO_EVENT.date,
        DEV_DEMO_EVENT.location,
        DEV_DEMO_EVENT.description,
        DEV_DEMO_EVENT.capacity,
        DEV_DEMO_EVENT.status,
        admin.id,
        DEV_DEMO_EVENT.eventType,
        DEV_DEMO_EVENT.tags,
        DEV_DEMO_EVENT.endDate,
      ],
    );
    event = { id: created.lastID ?? 0 };
  }

  if (!event?.id) return;

  await db.run(
    `INSERT INTO event_members (event_id, user_id, role)
     VALUES (?, ?, 'Owner')
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [event.id, admin.id],
  );

  if (attendee) {
    await db.run(
      `INSERT INTO event_members (event_id, user_id, role)
       VALUES (?, ?, 'Member')
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      [event.id, attendee.id],
    );
  }

  const budgetCategoryCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM budget_categories WHERE event_id = ?',
    [event.id],
  );
  if (Number(budgetCategoryCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO budget_categories (event_id, name, allocated_amount, color)
       VALUES
       (?, 'Production', 18000, '#6366f1'),
       (?, 'Catering', 7000, '#10b981'),
       (?, 'Marketing', 5000, '#f59e0b')`,
      [event.id, event.id, event.id],
    );
  }

  const categories = await db.all<{ id: number; name: string }>(
    'SELECT id, name FROM budget_categories WHERE event_id = ? ORDER BY id',
    [event.id],
  );
  const productionCategory = categories.find((category) => category.name === 'Production');
  const cateringCategory = categories.find((category) => category.name === 'Catering');

  const expenseCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM expenses WHERE event_id = ?',
    [event.id],
  );
  if (Number(expenseCount?.count ?? '0') === 0 && productionCategory && cateringCategory) {
    await db.run(
      `INSERT INTO expenses (event_id, category_id, title, amount, payment_status, vendor_name, notes, created_by)
       VALUES
       (?, ?, 'Main stage lighting', 4200, 'Paid', 'Luma Sound Co.', 'Paid deposit confirmed.', ?),
       (?, ?, 'Artist green room catering', 1500, 'Pending', 'Fresh Plate Catering', 'Final headcount due next week.', ?)`,
      [event.id, productionCategory.id, admin.id, event.id, cateringCategory.id, admin.id],
    );
  }

  const taskCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM tasks WHERE event_id = ?',
    [event.id],
  );
  if (Number(taskCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO tasks (event_id, title, notes, assignee_name, assigned_user_id, due_date, status, priority, created_by, description)
       VALUES
       (?, 'Confirm headline artist', 'Lock final arrival schedule and tech rider.', 'Admin User', ?, '2026-06-01', 'In Progress', 'High', ?, 'Artist confirmation and technical requirements.'),
       (?, 'Review volunteer roster', 'Assign the evening gate team.', 'Alice', ?, '2026-06-05', 'Pending', 'Medium', ?, 'Volunteer shift review for festival weekend.'),
       (?, 'Print VIP wristbands', 'Prepare 75 gold wristbands.', 'Admin User', ?, '2026-06-10', 'Blocked', 'Low', ?, 'Waiting on final sponsor guest list.')`,
      [
        event.id, admin.id, admin.id,
        event.id, attendee?.id ?? null, admin.id,
        event.id, admin.id, admin.id,
      ],
    );
  }

  const rsvpCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM rsvps WHERE event_id = ?',
    [event.id],
  );
  if (Number(rsvpCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO rsvps (event_id, name, email, guests, status, notes, source, checked_in)
       VALUES
       (?, 'Alice', 'alice@email.com', 2, 'Going', 'VIP guest with one plus-one.', 'dashboard', TRUE),
       (?, 'Marcus Lee', 'marcus@example.com', 1, 'Pending', 'Waiting on travel approval.', 'public', FALSE),
       (?, 'Sofia Patel', 'sofia@example.com', 3, 'Maybe', 'Needs accessible seating.', 'admin', FALSE)`,
      [event.id, event.id, event.id],
    );
  }

  const seatingTableCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM seating_tables WHERE event_id = ?',
    [event.id],
  );
  if (Number(seatingTableCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO seating_tables (event_id, name, capacity, layout_x, layout_y)
       VALUES
       (?, 'VIP Table', 8, 60, 60),
       (?, 'Team Table', 10, 380, 60)`,
      [event.id, event.id],
    );
  }

  const seatingAssignmentCount = await db.get<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM seating_assignments sa JOIN seating_tables st ON st.id = sa.table_id WHERE st.event_id = ?',
    [event.id],
  );
  if (Number(seatingAssignmentCount?.count ?? '0') === 0) {
    const vipTable = await db.get<{ id: number }>('SELECT id FROM seating_tables WHERE event_id = ? AND name = ?', [event.id, 'VIP Table']);
    const firstGuest = await db.get<{ id: number }>('SELECT id FROM rsvps WHERE event_id = ? ORDER BY id LIMIT 1', [event.id]);
    if (vipTable && firstGuest) {
      await db.run(
        `INSERT INTO seating_assignments (table_id, rsvp_id)
         VALUES (?, ?)
         ON CONFLICT (table_id, rsvp_id) DO NOTHING`,
        [vipTable.id, firstGuest.id],
      );
    }
  }

  const vendorCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM vendors WHERE event_id = ?', [event.id]);
  if (Number(vendorCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO vendors (event_id, name, category, email, phone, website, status, quoted_amount, notes, rating, created_by)
       VALUES (?, 'Luma Sound Co.', 'Production', 'hello@lumasound.co', '555-0101', 'https://lumasound.example', 'Confirmed', 8200, 'Stage and lighting package booked.', 5, ?)`,
      [event.id, admin.id],
    );
  }

  const shoppingList = await db.get<{ id: number }>('SELECT id FROM shopping_lists WHERE event_id = ? ORDER BY id LIMIT 1', [event.id]);
  let shoppingListId = shoppingList?.id;
  if (!shoppingListId) {
    const createdList = await db.run(
      `INSERT INTO shopping_lists (event_id, name, created_by)
       VALUES (?, 'Launch Weekend Supplies', ?)
       RETURNING id`,
      [event.id, admin.id],
    );
    shoppingListId = createdList.lastID;
  }

  const shoppingItemCount = shoppingListId
    ? await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM shopping_items WHERE list_id = ?', [shoppingListId])
    : undefined;
  if (shoppingListId && Number(shoppingItemCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO shopping_items (list_id, name, quantity, unit, estimated_cost, actual_cost, status, assigned_to, notes)
       VALUES
       (?, 'LED wristbands', 250, 'pcs', 500, NULL, 'Needed', ?, 'For opening night crowd effect.'),
       (?, 'Backstage water cases', 20, 'cases', 180, 172, 'Purchased', ?, 'Delivered to storage.')`,
      [shoppingListId, admin.id, shoppingListId, attendee?.id ?? admin.id],
    );
  }

  const timelineCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM timeline_activities WHERE event_id = ?', [event.id]);
  if (Number(timelineCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO timeline_activities (event_id, title, description, start_time, end_time, location, sort_order, created_by)
       VALUES
       (?, 'Gates open', 'General admission opens for all attendees.', '2026-06-18T16:00:00Z', '2026-06-18T16:30:00Z', 'Main Gate', 1, ?),
       (?, 'Headline set', 'Main stage performance begins.', '2026-06-18T21:00:00Z', '2026-06-18T22:30:00Z', 'Main Stage', 2, ?),
       (?, 'VIP after-party', 'Private lounge access for sponsors and VIP guests.', '2026-06-18T23:00:00Z', '2026-06-19T01:00:00Z', 'Sky Lounge', 3, ?)`,
      [event.id, admin.id, event.id, admin.id, event.id, admin.id],
    );
  }

  const messageCount = await db.get<{ count: string }>('SELECT COUNT(*)::text AS count FROM event_messages WHERE event_id = ?', [event.id]);
  if (Number(messageCount?.count ?? '0') === 0) {
    await db.run(
      `INSERT INTO event_messages (event_id, sender_id, body)
       VALUES
       (?, ?, 'Welcome to the Eventora demo workspace. Use this event to explore each module.'),
       (?, ?, 'Budget, guests, seating, vendors, shopping, and timeline now have sample data.')`,
      [event.id, admin.id, event.id, attendee?.id ?? admin.id],
    );
  }
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
  await seedDevelopmentDemoUsers(dbWrapper);
  await seedDevelopmentDemoWorkspace(dbWrapper);
  return dbWrapper;
}

export function getDatabase(): DatabaseAdapter {
  if (!dbWrapper) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return dbWrapper;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  return pool;
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
  // Rename legacy event_date column to date if the old schema is still present.
  // Guard: skip rename if date already exists (handles DB state where both columns coexist).
  {
    const [legacyCol, dateCol] = await Promise.all([
      db.get<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='event_date') AS exists`,
      ),
      db.get<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='date') AS exists`,
      ),
    ]);
    if (legacyCol?.exists && !dateCol?.exists) {
      await db.exec(`ALTER TABLE events RENAME COLUMN event_date TO date`);
    } else if (legacyCol?.exists && dateCol?.exists) {
      // Both columns exist — drop the legacy one to resolve the drift
      await db.exec(`ALTER TABLE events DROP COLUMN IF EXISTS event_date`);
    }
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

  // ── Communication tracking (#419, #465, #466) ───────────────────────────
  // Append-only event log for email opens (pixel) and clicks (redirect).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS communication_tracking_events (
      id SERIAL PRIMARY KEY,
      communication_log_id INTEGER NOT NULL REFERENCES communication_log(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('open','click')),
      target_url TEXT,
      ip_address TEXT,
      user_agent TEXT,
      occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comm_tracking_log_id ON communication_tracking_events(communication_log_id)',
  );
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_comm_tracking_type ON communication_tracking_events(event_type)',
  );

  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      allocated_amount NUMERIC(10,2) DEFAULT 0,
      tax_rate NUMERIC(5,2) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
      gratuity_rate NUMERIC(5,2) DEFAULT 0 CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100),
      contingency_rate NUMERIC(5,2) DEFAULT 0 CHECK (contingency_rate >= 0 AND contingency_rate <= 100),
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
      layout_x INTEGER,
      layout_y INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS layout_x INTEGER`);
  await db.exec(`ALTER TABLE seating_tables ADD COLUMN IF NOT EXISTS layout_y INTEGER`);

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

  // ── Budget planning schema drift fix (#596, #597) ─────────────────────────
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS gratuity_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS contingency_rate NUMERIC(5,2) DEFAULT 0`);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_tax_rate_range_chk
      CHECK (tax_rate >= 0 AND tax_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_gratuity_rate_range_chk
      CHECK (gratuity_rate >= 0 AND gratuity_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE budget_categories
      ADD CONSTRAINT budget_categories_contingency_rate_range_chk
      CHECK (contingency_rate >= 0 AND contingency_rate <= 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

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

  // ── Task dependencies (#440) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id              SERIAL PRIMARY KEY,
      task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, depends_on_id),
      CONSTRAINT task_dependencies_no_self_ref CHECK(task_id <> depends_on_id)
    )
  `);
  // Idempotent: add named self-ref constraint if table pre-existed without it
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE task_dependencies
        ADD CONSTRAINT task_dependencies_no_self_ref CHECK(task_id <> depends_on_id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id)`);

  // ── Budget templates (#438) ───────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_templates (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_template_items (
      id               SERIAL PRIMARY KEY,
      template_id      INTEGER NOT NULL REFERENCES budget_templates(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      allocated_amount NUMERIC(10,2) DEFAULT 0,
      color            TEXT DEFAULT '#6366f1',
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_budget_template_items_template_id ON budget_template_items(template_id)`);

  // ── Task templates & time entries (#450) ─────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_templates (
      id              SERIAL PRIMARY KEY,
      event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      description     TEXT,
      priority        TEXT CHECK(priority IN ('Low','Medium','High')) DEFAULT 'Medium',
      estimated_hours NUMERIC(5,2),
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_templates_event_id ON task_templates(event_id)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_time_entries (
      id          SERIAL PRIMARY KEY,
      task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hours_spent NUMERIC(5,2) NOT NULL CHECK(hours_spent > 0),
      notes       TEXT,
      logged_at   DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON task_time_entries(task_id)`);

  // Recurring task support columns
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT`);
  await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_end_date TEXT`);
  // Guard: only add FK column once task_templates is confirmed to exist
  {
    const tmplExists = await db.get<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='task_templates') AS exists`,
    );
    if (tmplExists?.exists) {
      await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES task_templates(id) ON DELETE SET NULL`);
    }
  }

  // ── Recurring expenses (#449) ─────────────────────────────────────────────
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE`);
  // Add column without inline CHECK first (idempotent), then add named constraint separately
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT`);
  await db.exec(`
    DO $$
    BEGIN
      ALTER TABLE expenses
        ADD CONSTRAINT expenses_recurrence_pattern_valid
        CHECK (recurrence_pattern IS NULL OR recurrence_pattern IN ('weekly','monthly','quarterly','annually'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurrence_end_date DATE`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_installment BOOLEAN DEFAULT FALSE`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_total INTEGER`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_number INTEGER`);

  // ── Vendor communication log (#452) ──────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_communication_log (
      id         SERIAL PRIMARY KEY,
      event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      vendor_id  INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
      type       TEXT NOT NULL CHECK(type IN ('email','call','meeting','quote','follow_up','other')),
      subject    TEXT NOT NULL,
      body       TEXT,
      sent_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_vendor_id ON vendor_communication_log(vendor_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_comm_log_event_id ON vendor_communication_log(event_id)`);

  // ── Store suggestions (#464) ──────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS store_suggestions (
      id           SERIAL PRIMARY KEY,
      event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      website      TEXT,
      notes        TEXT,
      category     TEXT,
      suggested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status       TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_store_suggestions_event_id ON store_suggestions(event_id)`);
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_store_suggestions_unique
    ON store_suggestions(event_id, lower(name))
  `);

  // ── RLS pilot: schema alignment (#475) ───────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_documents (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      caption TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_messages (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS event_categories (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, category_id)
    )
  `);

  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date TEXT`);

  // ── Entra ID identity linking (#468, #470) ────────────────────────────────
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid TEXT`);
  await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local'`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_entra_oid ON users(entra_oid) WHERE entra_oid IS NOT NULL`);

  // ── RLS pilot: enable row-level security (#472) ───────────────────────────
  if (process.env.RLS_PILOT_ENABLED === 'true') {
    console.log('[RLS] Applying RLS pilot policies on events and event_members…');

    await db.exec(`ALTER TABLE events ENABLE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE events FORCE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE event_members ENABLE ROW LEVEL SECURITY`);
    await db.exec(`ALTER TABLE event_members FORCE ROW LEVEL SECURITY`);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_events_owner'
        ) THEN
          CREATE POLICY rls_events_owner ON events
            USING (
              created_by = NULLIF(current_setting('app.current_user_id', true), '')::int
            );
        END IF;
      END $$;
    `);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'events' AND policyname = 'rls_events_member'
        ) THEN
          CREATE POLICY rls_events_member ON events
            USING (
              id IN (
                SELECT event_id FROM event_members
                WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
              )
            );
        END IF;
      END $$;
    `);

    await db.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'event_members' AND policyname = 'rls_event_members_self'
        ) THEN
          CREATE POLICY rls_event_members_self ON event_members
            USING (
              user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
            );
        END IF;
      END $$;
    `);

    console.log('[RLS] RLS pilot policies applied.');
  }

  // ── Guest merge audit (#411, #435) ───────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS guest_merge_audit (
      id                 SERIAL PRIMARY KEY,
      event_id           INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      surviving_rsvp_id  INTEGER REFERENCES rsvps(id) ON DELETE SET NULL,
      merged_rsvp_id     INTEGER NOT NULL,
      merged_email       TEXT NOT NULL,
      merged_name        TEXT NOT NULL,
      merged_snapshot    JSONB NOT NULL,
      merged_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      merged_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes              TEXT
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_event_id ON guest_merge_audit(event_id)`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_guest_merge_audit_surviving ON guest_merge_audit(surviving_rsvp_id)`,
  );

  // ── RSVP access tokens for QR codes (#411, #437) ──────────────────────────
  // A stable per-RSVP token used to render QR codes that link to the guest
  // RSVP page. Tokens are opaque and can be rotated independently.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_access_tokens (
      rsvp_id      INTEGER PRIMARY KEY REFERENCES rsvps(id) ON DELETE CASCADE,
      token        TEXT NOT NULL UNIQUE,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked_at   TIMESTAMP
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_access_tokens_token ON rsvp_access_tokens(token) WHERE revoked_at IS NULL`,
  );

  // ── Waitlist columns on rsvps (#413, #442) ────────────────────────────────
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlist_position INTEGER`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMP`);
  await db.exec(`ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMP`);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvps_event_waitlist ON rsvps(event_id, waitlist_position) WHERE waitlist_position IS NOT NULL`,
  );

  // ── Custom RSVP questions (#413, #443) ────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_questions (
      id            SERIAL PRIMARY KEY,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      prompt        TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('short_text','long_text','single_choice','multi_choice','number','boolean')),
      options       JSONB,
      required      BOOLEAN DEFAULT FALSE,
      sort_order    INTEGER DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_questions_event_id ON rsvp_questions(event_id)`,
  );

  await db.exec(`
    CREATE TABLE IF NOT EXISTS rsvp_question_responses (
      id          SERIAL PRIMARY KEY,
      rsvp_id     INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES rsvp_questions(id) ON DELETE CASCADE,
      response    TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (rsvp_id, question_id)
    )
  `);
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rsvp_question_responses_rsvp ON rsvp_question_responses(rsvp_id)`,
  );

  // ── Planned-vs-actual timeline workflow (#460) ───────────────────────────
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS planned_start_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS planned_end_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP`);
  await db.exec(`ALTER TABLE timeline_activities ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned' CHECK (status IN ('planned','in-progress','completed','skipped'))`);

  // ── Currency & exchange rates (#418, #461) ────────────────────────────────
  await db.exec(`ALTER TABLE events ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD'`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency_code TEXT`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount_base NUMERIC(14,4)`);
  await db.exec(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8)`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      base_currency  TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate           NUMERIC(18,8) NOT NULL CHECK (rate > 0),
      source         TEXT NOT NULL DEFAULT 'manual',
      fetched_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (base_currency, quote_currency)
    )
  `);
}
